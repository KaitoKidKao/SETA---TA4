import 'dotenv/config';
import { initPools } from '@seta/shared-db';
import { auth } from '../packages/identity/src/backend/auth.ts';
import { listRoleGrants } from '../packages/identity/src/index.ts';

async function main() {
  initPools({ databaseUrl: process.env.DATABASE_URL! });
  const sessionId = 'de7d0764-a2b7-4dd4-b993-15d5f88f1653';
  const headers = new Headers();
  headers.append('cookie', `better-auth.session_token=${sessionId}`);

  const authSession = await auth.api.getSession({ headers });
  console.log('--- AUTH SESSION ---');
  console.log(authSession);

  if (authSession?.user) {
    const grants = await listRoleGrants(authSession.user.id);
    console.log('--- GRANTS ---');
    console.log(grants);
  }
}

main().catch(console.error);
