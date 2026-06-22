import { Client } from 'pg';

async function main() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- Last 5 Runs in agent.workflow_runs ---');
  const runs = await client.query(`
    SELECT run_id, workflow_id, status, suspend_reason, started_at, finished_at
    FROM agent.workflow_runs
    ORDER BY started_at DESC LIMIT 5
  `);
  console.log(runs.rows);

  console.log('--- SmartRecruit Cursors ---');
  const cursors = await client.query(
    "SELECT * FROM core.subscription_cursors WHERE subscription LIKE 'smartrecruit%'",
  );
  console.log(cursors.rows);

  console.log('--- Dead Letters for smartrecruit.campaign.resume-after-screening ---');
  const dead = await client.query(`
    SELECT * FROM core.subscription_dead_letter 
    WHERE subscription = 'smartrecruit.campaign.resume-after-screening'
  `);
  console.log(dead.rows);

  console.log('--- Graphile Jobs ---');
  const jobs = await client.query(`
    SELECT id, task_identifier, queue_name, run_at, attempts, max_attempts, last_error
    FROM graphile_worker.jobs
    ORDER BY id DESC LIMIT 10
  `);
  console.log(jobs.rows);

  await client.end();
}

main().catch(console.error);
