import { PgVector } from '@mastra/pg';

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
