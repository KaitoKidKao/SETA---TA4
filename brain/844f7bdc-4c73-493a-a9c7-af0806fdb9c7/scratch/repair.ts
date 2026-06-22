import { Client } from 'pg';

async function main() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const client = new Client({ connectionString });
  await client.connect();

  console.log('--- Resetting cursors for SmartRecruit ---');
  const resetCursors = await client.query(`
    UPDATE core.subscription_cursors
    SET last_processed_event_id = '00000000-0000-0000-0000-000000000000',
        last_processed_occurred_at = '1970-01-01 00:00:00+00'::timestamp with time zone,
        last_processed_at = NOW()
    WHERE subscription IN (
      'smartrecruit.campaign.resume-after-screening',
      'smartrecruit.campaign.resume-after-drafting',
      'smartrecruit.campaign.resume-after-sending'
    )
  `);
  console.log(`Updated ${resetCursors.rowCount} cursors.`);

  console.log('--- Clearing dead letters for SmartRecruit ---');
  const deleteDead = await client.query(`
    DELETE FROM core.subscription_dead_letter
    WHERE subscription IN (
      'smartrecruit.campaign.resume-after-screening',
      'smartrecruit.campaign.resume-after-drafting',
      'smartrecruit.campaign.resume-after-sending'
    )
  `);
  console.log(`Deleted ${deleteDead.rowCount} dead letters.`);

  await client.end();
}

main().catch(console.error);
