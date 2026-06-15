import { PgVector } from '@mastra/pg';
import { embedMany, resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { generatePseudoEmbedding } from '../domain/pseudo-embed.ts';

export const SMARTRECRUIT_VECTOR_NAMESPACE = 'smartrecruit_rag';
export const SMARTRECRUIT_VECTOR_INDEX = 'candidate_cv_embeddings';
export const SMARTRECRUIT_VECTOR_DIMENSION = 1536;

export interface CandidateCVVectorMetadata {
  tenant_id: string;
  candidate_id: string;
  display_name: string;
  email: string;
  fit_score: number | null;
  skills: string[];
  cv_text: string;
  embedded_at: string;
}

export function candidateCvVectorId(tenantId: string, candidateId: string): string {
  return `${tenantId}:${candidateId}`;
}

interface CachedStore {
  store: PgVector;
  databaseUrl: string;
  indexReady: Promise<void> | null;
}

let cached: CachedStore | null = null;

export function getSmartrecruitVectorStore(databaseUrl: string): PgVector {
  if (cached && cached.databaseUrl === databaseUrl) return cached.store;
  if (cached && cached.databaseUrl !== databaseUrl) {
    void cached.store.disconnect().catch(() => {});
    cached = null;
  }
  const store = new PgVector({
    id: 'smartrecruit-candidate-cvs',
    connectionString: databaseUrl,
    schemaName: SMARTRECRUIT_VECTOR_NAMESPACE,
  });
  cached = { store, databaseUrl, indexReady: null };
  return store;
}

export function ensureSmartrecruitVectorIndex(store: PgVector): Promise<void> {
  if (cached?.store === store && cached.indexReady) return cached.indexReady;
  const promise = store.createIndex({
    indexName: SMARTRECRUIT_VECTOR_INDEX,
    dimension: SMARTRECRUIT_VECTOR_DIMENSION,
    metric: 'cosine',
    indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 200 } },
  });
  if (cached?.store === store) cached.indexReady = promise;
  return promise;
}

export async function resetSmartrecruitVectorStore(): Promise<void> {
  if (!cached) return;
  const { store } = cached;
  cached = null;
  await store.disconnect().catch(() => {});
}

let isEmbeddingProviderHealthy = true;

export async function getEmbeddingWithFallback(text: string): Promise<number[]> {
  if (!isEmbeddingProviderHealthy) {
    return generatePseudoEmbedding(text);
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'mock-key' || apiKey.startsWith('mock')) {
    isEmbeddingProviderHealthy = false;
    return generatePseudoEmbedding(text);
  }

  try {
    const provider = resolveEmbeddingProvider();
    const [vector] = await embedMany(provider, [text]);
    if (vector) return vector;
  } catch (error) {
    console.error('Embedding provider failed, switching to local pseudo-embeddings:', error);
    isEmbeddingProviderHealthy = false; // Tripping the circuit breaker
    return generatePseudoEmbedding(text);
  }
  return generatePseudoEmbedding(text);
}

export async function upsertCandidateCvEmbedding(
  dbUrl: string,
  candidate: {
    id: string;
    tenant_id: string;
    display_name: string;
    email: string;
    fit_score?: number | null;
    cv_skills?: string | null;
    cv_text: string;
  },
): Promise<void> {
  const store = getSmartrecruitVectorStore(dbUrl);
  await ensureSmartrecruitVectorIndex(store);

  const vector = await getEmbeddingWithFallback(candidate.cv_text);

  const metadata: CandidateCVVectorMetadata = {
    tenant_id: candidate.tenant_id,
    candidate_id: candidate.id,
    display_name: candidate.display_name,
    email: candidate.email,
    fit_score: candidate.fit_score ?? null,
    skills: candidate.cv_skills
      ? candidate.cv_skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    cv_text: candidate.cv_text,
    embedded_at: new Date().toISOString(),
  };

  await store.upsert({
    indexName: SMARTRECRUIT_VECTOR_INDEX,
    vectors: [vector],
    metadata: [metadata],
    ids: [candidateCvVectorId(candidate.tenant_id, candidate.id)],
  });
}

export const SMARTRECRUIT_HISTORY_INDEX = 'outreach_interaction_embeddings';

export interface OutreachHistoryVectorMetadata {
  tenant_id: string;
  candidate_id: string;
  history_id: string;
  subject: string;
  summary_text: string;
  sent_at: string;
}

export function outreachHistoryVectorId(tenantId: string, historyId: string): string {
  return `history:${tenantId}:${historyId}`;
}

export async function upsertOutreachHistoryEmbedding(
  dbUrl: string,
  history: {
    id: string;
    tenant_id: string;
    candidate_id: string;
    subject: string;
    summary_text: string;
    sent_at: string;
  },
): Promise<void> {
  const store = getSmartrecruitVectorStore(dbUrl);

  await store
    .createIndex({
      indexName: SMARTRECRUIT_HISTORY_INDEX,
      dimension: SMARTRECRUIT_VECTOR_DIMENSION,
      metric: 'cosine',
      indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 200 } },
    })
    .catch(() => {});

  const vector = await getEmbeddingWithFallback(history.summary_text);

  const metadata: OutreachHistoryVectorMetadata = {
    tenant_id: history.tenant_id,
    candidate_id: history.candidate_id,
    history_id: history.id,
    subject: history.subject,
    summary_text: history.summary_text,
    sent_at: history.sent_at,
  };

  await store.upsert({
    indexName: SMARTRECRUIT_HISTORY_INDEX,
    vectors: [vector],
    metadata: [metadata],
    ids: [outreachHistoryVectorId(history.tenant_id, history.id)],
  });
}
