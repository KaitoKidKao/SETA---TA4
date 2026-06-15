async function main() {
  const sessionId = 'de7d0764-a2b7-4dd4-b993-15d5f88f1653';
  const url = 'http://localhost:3000/api/smartrecruit/v1/candidates';

  const res = await fetch(url, {
    headers: {
      cookie: `better-auth.session_token=${sessionId}`,
    },
  });

  console.log('--- CANDIDATES API RESPONSE ---');
  console.log('Status:', res.status);
  const text = await res.text();
  try {
    console.log(JSON.parse(text));
  } catch {
    console.log(text);
  }
}

main().catch(console.error);
