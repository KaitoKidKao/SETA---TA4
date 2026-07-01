import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Agent } from '@mastra/core/agent';
import { createCanvas } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';
import { getDocumentProxy } from 'unpdf';
import { getModelConfig } from './model.ts';

export async function performOcr(filePath: string): Promise<string> {
  // Check file existence
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`OCR target file not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();

  // Handle PDF files by rendering pages to canvases and running OCR on each
  if (ext === '.pdf') {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const doc = await getDocumentProxy(new Uint8Array(fileBuffer));
      const numPages = Math.min(doc.numPages, 3); // Limit to first 3 pages for performance
      let fullOcrText = '';

      for (let i = 1; i <= numPages; i++) {
        try {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = createCanvas(viewport.width, viewport.height);
          const context = canvas.getContext('2d');

          await page.render({
            canvasContext: context as any,
            viewport,
          }).promise;

          const pngBuffer = canvas.toBuffer('image/png');
          const {
            data: { text },
          } = await Tesseract.recognize(pngBuffer, 'vie+eng');
          fullOcrText += `${text}\n`;
        } catch (pageErr) {
          console.warn(`Failed to render or OCR page ${i} of PDF ${filePath}:`, pageErr);
        }
      }
      return fullOcrText;
    } catch (pdfErr) {
      console.error(`Failed to perform OCR on PDF ${filePath}:`, pdfErr);
      throw new Error(`OCR PDF processing failed: ${String(pdfErr)}`);
    }
  }

  const fileBuffer = await fs.readFile(filePath);

  // Decide mime-type for image files
  let mimeType = 'application/octet-stream';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.gif') mimeType = 'image/gif';
  else if (ext === '.webp') mimeType = 'image/webp';

  // Option 1: Vision API using gpt-4o-mini (for images only)
  if (mimeType.startsWith('image/')) {
    try {
      const model = getModelConfig();
      const apiKey =
        typeof model === 'object' && model && 'apiKey' in model ? (model as any).apiKey : '';
      if (!apiKey || apiKey === 'mock-key') {
        throw new Error('OpenAI API Key is not set or mock key, fallback to local OCR');
      }

      const base64Image = fileBuffer.toString('base64');
      const ocrAgent = new Agent({
        id: 'smartrecruit.ocrAgent',
        name: 'OCR Agent',
        instructions:
          'You are an OCR expert. Extract and return all text content from the image provided. Do not summarize or add metadata, return ONLY the raw text.',
        model: {
          providerId: 'openai',
          modelId: 'gpt-4o-mini',
          apiKey: apiKey,
        },
      });

      const response = await ocrAgent.generate([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text from this image.' },
            {
              type: 'image',
              image: base64Image,
              mimeType,
            },
          ],
        },
      ]);

      const text = response.text || '';
      if (text.trim().length > 0) {
        return text;
      }
      throw new Error('Empty text returned from OpenAI Vision API');
    } catch (error) {
      console.warn('Vision OCR failed, falling back to local Tesseract OCR:', error);
    }
  }

  // Option 2: Fallback to Local Tesseract WebAssembly for non-PDF files
  try {
    const {
      data: { text },
    } = await Tesseract.recognize(fileBuffer, 'vie+eng');
    if (text && text.trim().length > 0) {
      return text;
    }
    throw new Error('Tesseract local OCR returned empty text');
  } catch (tessError) {
    console.error('Tesseract local OCR failed:', tessError);
    throw new Error(`OCR processing failed on file: ${filePath}. Reason: ${String(tessError)}`);
  }
}
