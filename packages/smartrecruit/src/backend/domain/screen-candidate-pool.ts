import type { SessionScope } from '@seta/core';
import { and, eq, inArray } from 'drizzle-orm';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria } from '../db/schema.ts';
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
        .map((row) => (row.metadata as any)?.candidate_id)
        .filter(Boolean) as string[];

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
