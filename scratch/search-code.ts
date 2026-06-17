import * as fs from 'node:fs/promises';

async function main() {
  const code = await fs.readFile(
    'apps/web/src/modules/smartrecruit/pages/smartrecruit-page.tsx',
    'utf-8',
  );
  const lines = code.split('\n');

  // Find where runStatus === 'paused' && isGate2Active is rendered
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("runStatus === 'paused' && isGate2Active")) {
      startLine = i;
      break;
    }
  }

  if (startLine !== -1) {
    console.log(`Found starting at line ${startLine + 1}`);
    // Print 150 lines starting from startLine
    for (let i = startLine; i < Math.min(startLine + 120, lines.length); i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  } else {
    console.log('Not found');
  }
}

main().catch(console.error);
