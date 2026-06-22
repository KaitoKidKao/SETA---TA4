import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  const res = await client.query('SELECT id, user_id, expires_at FROM identity.session');
  console.log('--- SESSIONS ---');
  console.log(res.rows);

  const resUsers = await client.query(
    'SELECT id, tenant_id, email FROM identity.user WHERE id IN (SELECT user_id FROM identity.session)',
  );
  console.log('--- ACTIVE SESSION USERS ---');
  console.log(resUsers.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
