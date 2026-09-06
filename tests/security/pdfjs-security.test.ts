import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import * as legacyPdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import {
  PDFJS_WORKER_SRC,
  getUntrustedPdfDocument
} from '@/services/pdfjs.service';

describe('PDF.js document-ingest security', () => {
  it('disables dynamic evaluation for every untrusted document load', () => {
    const loadingTask = { promise: Promise.resolve({}) } as ReturnType<typeof pdfjsLib.getDocument>;
    const getDocument = vi.fn(() => loadingTask);
    const data = new ArrayBuffer(16);

    const result = getUntrustedPdfDocument(data, getDocument);

    expect(result).toBe(loadingTask);
    expect(getDocument).toHaveBeenCalledWith({
      data,
      isEvalSupported: false
    });
  });

  it('uses the bundled worker asset from the installed PDF.js package', () => {
    expect(PDFJS_WORKER_SRC).toBeTruthy();
    expect(PDFJS_WORKER_SRC).not.toMatch(/^https?:\/\//i);
    expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toBe(PDFJS_WORKER_SRC);
    expect(PDFJS_WORKER_SRC).toContain('pdf.worker.min');
  });

  it('opens a harmless one-page PDF with the selected PDF.js runtime', async () => {
    const fixture = new jsPDF();
    fixture.text('Benign PDF.js regression fixture', 20, 20);
    const data = new Uint8Array(fixture.output('arraybuffer'));
    legacyPdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.resolve(__dirname, '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')
    ).href;

    const loadingTask = legacyPdfjsLib.getDocument({
      data,
      isEvalSupported: false
    });
    const document = await loadingTask.promise;

    expect(document.numPages).toBe(1);
    const page = await document.getPage(1);
    const text = await page.getTextContent();
    expect(text.items.length).toBeGreaterThan(0);

    await document.destroy();
  });

  it('keeps the dependency graph free of pdfjs-dist 3.11.174', () => {
    const root = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string }>;
    };

    const resolvedPdfJsVersions = Object.entries(packageLock.packages)
      .filter(([packagePath]) => packagePath.endsWith('node_modules/pdfjs-dist'))
      .map(([, metadata]) => metadata.version)
      .filter((version): version is string => Boolean(version));

    expect(packageJson.dependencies['pdfjs-dist']).toBe('4.10.38');
    expect(resolvedPdfJsVersions).toEqual(['4.10.38']);
    expect(resolvedPdfJsVersions).not.toContain('3.11.174');
  });
});
