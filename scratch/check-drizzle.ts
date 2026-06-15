import { initPools } from '@seta/shared-db';
import * as dotenv from 'dotenv';
import { and, desc, eq } from 'drizzle-orm';
import { smartrecruitDb } from '../packages/smartrecruit/src/backend/db/client.ts';
import { candidates } from '../packages/smartrecruit/src/backend/db/schema.ts';

dotenv.config();

async function main() {
  initPools({ databaseUrl: process.env.DATABASE_URL! });
  const db = smartrecruitDb();

  const tenantId = 'da53d43f-36e6-4440-9011-f1d002544918';

  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.tenant_id, tenantId))
    .orderBy(desc(candidates.fit_score));

  console.log('--- DRIZZLE CANDIDATES QUERY ---');
  console.log('Count:', rows.length);
  console.log(
    'First 5:',
    rows
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.display_name, status: c.status, score: c.fit_score })),
  );
}

main().catch(console.error);
