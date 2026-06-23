import type { SessionScope } from '@seta/core';
import { and, eq, gte, inArray, ne, notInArray, or, sql } from 'drizzle-orm';
import { requirePermission, SMARTRECRUIT_ACCESS, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria, interactionHistories } from '../db/schema.ts';
import {
  getEmbeddingWithFallback,
  getSmartrecruitVectorStore,
  SMARTRECRUIT_VECTOR_INDEX,
} from '../embeddings/vector-store.ts';
import { screenCv } from './screen-cv.ts';

export interface ScreenCandidatePoolInput {
  criteriaId: string;
  limit?: number;
  includeAlreadyScreened?: boolean;
  session: SessionScope;
  abortSignal?: AbortSignal;
}

export interface ScreenCandidatePoolOutput {
  criteriaId: string;
  screened: number;
  skipped: number;
  results: Array<{
    id: string;
    displayName: string;
    email: string;
    status: string;
    fitScore: number;
  }>;
}

export interface RecommendCandidatePoolInput {
  criteriaId: string;
  limit?: number;
  minSimilarity?: number;
  excludeCandidateIds?: string[];
  recentContactDays?: number;
  session: SessionScope;
}

export interface RecommendCandidatePoolOutput {
  criteriaId: string;
  matched: number;
  results: Array<{
    id: string;
    displayName: string;
    email: string;
    status: string;
    fitScore: number | null;
    similarityScore: number | null;
  }>;
}

export function isCandidateRecommendationEligible(candidate: {
  id: string;
  status: string;
  re_engagement_eligible: boolean;
  applied_position: string | null;
  jobTitle: string;
  excludedCandidateIds: ReadonlySet<string>;
  recentlyContactedCandidateIds: ReadonlySet<string>;
  hasVectorSimilarity: boolean;
}): boolean {
  if (candidate.excludedCandidateIds.has(candidate.id)) return false;
  if (candidate.recentlyContactedCandidateIds.has(candidate.id)) return false;
  if (candidate.status === 'rejected' && !candidate.re_engagement_eligible) return false;

  const positionMatches =
    candidate.applied_position?.trim().toLowerCase() === candidate.jobTitle.trim().toLowerCase();
  if (positionMatches || candidate.re_engagement_eligible) return true;

  // Candidates without a historical position are allowed only when vector similarity is available.
  return !candidate.applied_position && candidate.hasVectorSimilarity;
}

function buildCandidateCvText(candidate: typeof candidates.$inferSelect): string {
  if (candidate.cv_text?.trim()) return candidate.cv_text;
  return [
    `Candidate: ${candidate.display_name}`,
    `Current Title: ${candidate.current_title ?? ''}`,
    `Current Company: ${candidate.current_company ?? ''}`,
    `Past Companies: ${candidate.past_companies ?? ''}`,
    `Years of Experience: ${candidate.years_of_experience ?? ''}`,
    `Seniority: ${candidate.seniority_level ?? ''}`,
    `Domain Experience: ${candidate.domain_experience ?? ''}`,
    `Employment History: ${candidate.employment_history ?? ''}`,
    `Notable Projects: ${candidate.notable_projects ?? ''}`,
    `Skills: ${candidate.cv_skills ?? ''}`,
    `English Level: ${candidate.english_level ?? ''}`,
    `Education: ${candidate.highest_education ?? ''} ${candidate.education_major ?? ''}`.trim(),
    `Certifications: ${candidate.certifications ?? ''}`,
  ]
    .filter((section) => !section.endsWith(': '))
    .join('\n');
}

function isCandidateRelevant(
  candidate: typeof candidates.$inferSelect,
  selectedCriteria: typeof criteria.$inferSelect,
): boolean {
  if (!candidate.applied_position) return true;
  return (
    candidate.applied_position.toLowerCase() === selectedCriteria.job_title.toLowerCase() ||
    candidate.re_engagement_eligible
  );
}

export async function recommendCandidatePool(
  input: RecommendCandidatePoolInput,
): Promise<RecommendCandidatePoolOutput> {
  requirePermission(input.session, SMARTRECRUIT_ACCESS);

  const db = smartrecruitDb();
  const [selectedCriteria] = await db
    .select()
    .from(criteria)
    .where(and(eq(criteria.id, input.criteriaId), eq(criteria.tenant_id, input.session.tenant_id)))
    .limit(1);
  if (!selectedCriteria) {
    throw new Error(`Screening criteria with ID ${input.criteriaId} not found.`);
  }

  const limit = input.limit ?? 10;
  const minSimilarity = input.minSimilarity ?? 0.55;
  const excludedCandidateIds = new Set(input.excludeCandidateIds ?? []);
  const recentContactCutoff = new Date();
  recentContactCutoff.setDate(recentContactCutoff.getDate() - (input.recentContactDays ?? 30));

  const recentContacts = await db
    .select({ candidateId: interactionHistories.candidate_id })
    .from(interactionHistories)
    .where(
      and(
        eq(interactionHistories.tenant_id, input.session.tenant_id),
        gte(interactionHistories.sent_at, recentContactCutoff),
      ),
    );
  const recentlyContactedCandidateIds = new Set(recentContacts.map((row) => row.candidateId));

  let candidateRows: (typeof candidates.$inferSelect)[] = [];
  const similarityByCandidateId = new Map<string, number>();
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    try {
      const store = getSmartrecruitVectorStore(dbUrl);
      const queryVector = await getEmbeddingWithFallback(selectedCriteria.jd_text);
      const vectorResults = await store.query({
        indexName: SMARTRECRUIT_VECTOR_INDEX,
        queryVector,
        topK: Math.max(limit * 5, 25),
        filter: { tenant_id: { $eq: input.session.tenant_id } },
      });

      const candidateIds: string[] = [];
      for (const row of vectorResults) {
        const candidateId = (row.metadata as { candidate_id?: unknown })?.candidate_id;
        const similarity = typeof row.score === 'number' ? row.score : null;
        if (typeof candidateId !== 'string' || similarity === null || similarity < minSimilarity) {
          continue;
        }
        candidateIds.push(candidateId);
        similarityByCandidateId.set(candidateId, similarity);
      }

      if (candidateIds.length > 0) {
        candidateRows = await db
          .select()
          .from(candidates)
          .where(
            and(
              eq(candidates.tenant_id, input.session.tenant_id),
              inArray(candidates.id, candidateIds),
            ),
          );
        candidateRows.sort(
          (a, b) =>
            (similarityByCandidateId.get(b.id) ?? 0) - (similarityByCandidateId.get(a.id) ?? 0),
        );
      }
    } catch (err) {
      console.warn('Talent Pool vector retrieval failed; using metadata fallback:', err);
    }
  }

  // Metadata-only fallback does not invoke an LLM and only accepts exact-position or re-engage rows.
  if (candidateRows.length === 0) {
    const fallbackConditions = [
      eq(candidates.tenant_id, input.session.tenant_id),
      or(ne(candidates.status, 'rejected'), eq(candidates.re_engagement_eligible, true)),
      or(
        sql`lower(trim(${candidates.applied_position})) = lower(trim(${selectedCriteria.job_title}))`,
        eq(candidates.re_engagement_eligible, true),
      ),
    ];
    if (excludedCandidateIds.size > 0) {
      fallbackConditions.push(notInArray(candidates.id, [...excludedCandidateIds]));
    }
    if (recentlyContactedCandidateIds.size > 0) {
      fallbackConditions.push(notInArray(candidates.id, [...recentlyContactedCandidateIds]));
    }
    candidateRows = await db
      .select()
      .from(candidates)
      .where(and(...fallbackConditions))
      .limit(Math.max(limit * 3, 25));
  }

  const results = candidateRows
    .filter((candidate) =>
      isCandidateRecommendationEligible({
        id: candidate.id,
        status: candidate.status,
        re_engagement_eligible: candidate.re_engagement_eligible,
        applied_position: candidate.applied_position,
        jobTitle: selectedCriteria.job_title,
        excludedCandidateIds,
        recentlyContactedCandidateIds,
        hasVectorSimilarity: similarityByCandidateId.has(candidate.id),
      }),
    )
    .slice(0, limit)
    .map((candidate) => ({
      id: candidate.id,
      displayName: candidate.display_name,
      email: candidate.email,
      status: candidate.status,
      fitScore: candidate.fit_score,
      similarityScore: similarityByCandidateId.get(candidate.id) ?? null,
    }));

  return { criteriaId: selectedCriteria.id, matched: results.length, results };
}

export async function screenCandidatePool(
  input: ScreenCandidatePoolInput,
): Promise<ScreenCandidatePoolOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  const db = smartrecruitDb();
  const [selectedCriteria] = await db
    .select()
    .from(criteria)
    .where(and(eq(criteria.id, input.criteriaId), eq(criteria.tenant_id, input.session.tenant_id)))
    .limit(1);

  if (!selectedCriteria) {
    throw new Error(`Screening criteria with ID ${input.criteriaId} not found.`);
  }

  let pool: (typeof candidates.$inferSelect)[] = [];
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    try {
      const store = getSmartrecruitVectorStore(dbUrl);
      const queryVector = await getEmbeddingWithFallback(selectedCriteria.jd_text);

      const limit = input.limit ?? 25;
      const topK = limit * 3; // buffer for filtering

      const vectorResults = await store.query({
        indexName: SMARTRECRUIT_VECTOR_INDEX,
        queryVector,
        topK,
        filter: { tenant_id: { $eq: input.session.tenant_id } },
      });

      const candidateIds = vectorResults
        .map((row) => (row.metadata as { candidate_id?: unknown })?.candidate_id)
        .filter((candidateId): candidateId is string => typeof candidateId === 'string');

      if (candidateIds.length > 0) {
        const rows = await db
          .select()
          .from(candidates)
          .where(
            and(
              inArray(candidates.id, candidateIds),
              eq(candidates.tenant_id, input.session.tenant_id),
            ),
          );

        // Keep the order of the vector search similarity
        const idToIndex = new Map(candidateIds.map((id, index) => [id, index]));
        rows.sort((a, b) => (idToIndex.get(a.id) ?? 999) - (idToIndex.get(b.id) ?? 999));

        pool = rows
          .filter((candidate) => isCandidateRelevant(candidate, selectedCriteria))
          .filter((candidate) => input.includeAlreadyScreened || candidate.fit_score === null)
          .slice(0, limit);
      }
    } catch (err) {
      console.warn('Vector search failed, falling back to SQL-based pool retrieval:', err);
    }
  }

  // Fallback to SQL filter if Vector DB returned nothing or error
  if (pool.length === 0) {
    const rows = await db
      .select()
      .from(candidates)
      .where(eq(candidates.tenant_id, input.session.tenant_id));

    pool = rows
      .filter((candidate) => isCandidateRelevant(candidate, selectedCriteria))
      .filter((candidate) => input.includeAlreadyScreened || candidate.fit_score === null)
      .slice(0, input.limit ?? 25);
  }

  const results: ScreenCandidatePoolOutput['results'] = [];
  let skipped = 0;

  for (const candidate of pool) {
    const cvText = buildCandidateCvText(candidate);
    if (!cvText.trim()) {
      skipped++;
      continue;
    }

    const screened = await screenCv({
      existingCandidateId: candidate.id,
      candidateName: candidate.display_name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone ?? undefined,
      cvPath: candidate.cv_path ?? undefined,
      cvText,
      criteriaId: selectedCriteria.id,
      session: input.session,
      abortSignal: input.abortSignal,
    });

    results.push({
      id: screened.id,
      displayName: screened.displayName,
      email: screened.email,
      status: screened.status,
      fitScore: screened.fitScore,
    });
  }

  return {
    criteriaId: selectedCriteria.id,
    screened: results.length,
    skipped,
    results,
  };
}
