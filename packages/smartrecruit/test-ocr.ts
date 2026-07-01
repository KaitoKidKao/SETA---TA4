import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';
import { getDocumentProxy } from 'unpdf';

async function test() {
  const buffer = fs.readFileSync('../../test_hidden_prompt_injection.pdf');
  try {
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const numPages = Math.min(doc.numPages, 3);
    let ocrText = '';
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      await page.render({
        // biome-ignore lint/suspicious/noExplicitAny: unpdf canvas compatibility
        canvasContext: context as any,
        viewport,
      }).promise;
      const pngBuffer = canvas.toBuffer('image/png');
      const {
        data: { text: pageText },
      } = await Tesseract.recognize(pngBuffer, 'vie+eng');
      ocrText += `${pageText}\n`;
    }
    console.log('OCR TEXT:');
    console.log(ocrText);
  } catch (err) {
    console.error('Error during OCR:', err);
  }
}

test();
