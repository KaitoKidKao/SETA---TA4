import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, createDb, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { resetSmartrecruitDb } from '../../src/backend/db/client.ts';
import * as schema from '../../src/backend/db/schema.ts';

export function withSmartrecruitTestDb<T>(
  fn: (ctx: {
    pool: Pool;
    db: NodePgDatabase<typeof schema>;
    databaseUrl: string;
    session: SessionScope;
  }) => Promise<T>,
): Promise<T> {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  const session: SessionScope = {
    session_id: crypto.randomUUID(),
    user_id: userId,
    tenant_id: tenantId,
    email: 'recruiter@example.com',
    display_name: 'Recruiter',
    role_summary: {
      roles: ['recruiter'],
      cross_tenant_read: false,
    },
    role_summary_hash: 'hash',
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };

  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetSmartrecruitDb();
      initPools({ databaseUrl });
      try {
        const db = createDb(pool, schema, { schemaFilter: ['smartrecruit'] });
        return await fn({ pool, db, databaseUrl, session });
      } finally {
        resetCoreDb();
        resetSmartrecruitDb();
        await closePools();
      }
    },
  );
}
