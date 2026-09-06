import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const PDFJS_WORKER_SRC = pdfWorkerUrl;

pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

export const getUntrustedPdfDocument = (
  data: ArrayBuffer,
  getDocument: typeof pdfjsLib.getDocument = pdfjsLib.getDocument
) => getDocument({
  data,
  isEvalSupported: false
});
