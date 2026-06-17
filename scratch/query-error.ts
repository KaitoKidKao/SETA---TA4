import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgres://seta:seta@localhost:5442/seta',
});

async function main() {
  await client.connect();
  const runId = '9fe41ba7-c2f1-4af6-9d60-ef514d5eaa50';
  const res = await client.query(
    `
    SELECT id, event_type, payload
    FROM core.events 
    WHERE aggregate_id = $1;
  `,
    [runId],
  );

  for (const row of res.rows) {
    console.log('-----------------------------------------');
    console.log('EVENT TYPE:', row.event_type);
    console.log('PAYLOAD:');
    console.log(JSON.stringify(row.payload, null, 2));
  }

  await client.end();
}

main().catch(console.error);
