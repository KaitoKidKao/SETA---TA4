import * as fs from 'fs/promises';
// Mock getModelConfig so it doesn't fail
import { vi } from 'vitest'; // We are running with tsx, so we can't use vi unless we mock manually
import { performOcr } from '../packages/smartrecruit/src/backend/domain/ocr.ts';

// Let's modify the process.env directly
process.env.OPENAI_API_KEY = ''; // force fallback to tesseract

async function test() {
  console.log('Starting OCR test...');
  // Create a mock image file
  const mockImagePath = 'scratch/mock_image.png';
  await fs.writeFile(mockImagePath, 'fake-image-data-to-trigger-tesseract');

  try {
    const text = await performOcr(mockImagePath);
    console.log('OCR Success! Extracted text:', text);
  } catch (err) {
    console.error('OCR Error caught:', err);
  } finally {
    await fs.unlink(mockImagePath).catch(() => {});
  }
}

test().catch(console.error);
