import { createDb, getPool } from '@seta/shared-db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function smartrecruitDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = createDb(getPool('web'), schema, { schemaFilter: ['smartrecruit'] });
  return cached;
}

export function resetSmartrecruitDb(): void {
  cached = null;
}
