import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function renderPdfPages() {
  const artifactDir = 'C:\\Users\\Usuario\\.gemini\\antigravity-ide\\brain\\f49d00ea-aff7-44a4-901a-f74edb9ef33c';
  const pdfFiles = fs.readdirSync(artifactDir).filter(f => f.endsWith('.pdf'));
  console.log('Found PDF files:', pdfFiles);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(artifactDir, pdfFile);
    console.log(`Rendering pages of ${pdfFile}...`);
    
    // Load PDF in browser using PDF.js via CDN or iframe
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          body { margin: 0; padding: 20px; background: #333; display: flex; flex-direction: column; align-items: center; gap: 20px; }
          canvas { box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
        </style>
      </head>
      <body>
        <div id="container"></div>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          async function loadPDF(url) {
            const loadingTask = pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;
            const container = document.getElementById('container');
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 2 });
              
              const canvas = document.createElement('canvas');
              canvas.id = 'page-' + pageNum;
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              container.appendChild(canvas);
              
              await page.render({
                canvasContext: context,
                viewport: viewport
              }).promise;
            }
            window.__PDF_RENDERED__ = true;
          }
        </script>
      </body>
      </html>
    `;

    await page.setContent(html);
    const pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
    await page.evaluate(async (b64) => {
      const byteCharacters = atob(b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      await window.loadPDF(url);
    }, pdfBase64);

    await page.waitForFunction(() => window.__PDF_RENDERED__ === true, { timeout: 20000 });
    await page.waitForTimeout(1000);

    const canvases = await page.locator('canvas').all();
    console.log(`Found ${canvases.length} rendered pages for ${pdfFile}`);
    
    for (let i = 0; i < canvases.length; i++) {
      const outName = `${pdfFile.replace('.pdf', '')}_page_${i + 1}.png`;
      await canvases[i].screenshot({ path: path.join(artifactDir, outName) });
      console.log(`Saved screenshot: ${outName}`);
    }
  }

  await browser.close();
  console.log('All PDF pages rendered to PNG successfully!');
}

renderPdfPages().catch((err) => {
  console.error('Error rendering PDF pages:', err);
  process.exit(1);
});
