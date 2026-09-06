import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const viewerHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 20px; background: #333; display: flex; flex-direction: column; align-items: center; gap: 20px; }
    canvas { box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
  </style>
</head>
<body>
  <div id="container"></div>
  <script type="module">
    import * as pdfjsLib from '/pdf.mjs';

    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const loadingTask = pdfjsLib.getDocument({
      url: '/document.pdf',
      isEvalSupported: false
    });
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

      await page.render({ canvasContext: context, viewport }).promise;
    }

    window.__PDF_RENDERED__ = true;
  </script>
</body>
</html>`;

async function renderPdfPages() {
  const artifactDir = 'C:\\Users\\Usuario\\.gemini\\antigravity-ide\\brain\\f49d00ea-aff7-44a4-901a-f74edb9ef33c';
  const pdfJsBuildDir = path.resolve('node_modules/pdfjs-dist/build');
  const pdfFiles = fs.readdirSync(artifactDir).filter((file) => file.endsWith('.pdf'));
  let activePdfPath = '';

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/pdf.mjs' || requestUrl.pathname === '/pdf.worker.min.mjs') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      fs.createReadStream(path.join(pdfJsBuildDir, requestUrl.pathname.slice(1))).pipe(response);
      return;
    }

    if (requestUrl.pathname === '/document.pdf') {
      response.writeHead(200, { 'Content-Type': 'application/pdf' });
      fs.createReadStream(activePdfPath).pipe(response);
      return;
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(viewerHtml);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start local PDF.js test server.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const viewerUrl = `http://127.0.0.1:${address.port}/`;

  try {
    for (const pdfFile of pdfFiles) {
      activePdfPath = path.join(artifactDir, pdfFile);
      console.log(`Rendering pages of ${pdfFile}...`);

      await page.goto(viewerUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__PDF_RENDERED__ === true, { timeout: 20000 });

      const canvases = await page.locator('canvas').all();
      console.log(`Found ${canvases.length} rendered pages for ${pdfFile}`);

      for (let index = 0; index < canvases.length; index++) {
        const outName = `${pdfFile.replace('.pdf', '')}_page_${index + 1}.png`;
        await canvases[index].screenshot({ path: path.join(artifactDir, outName) });
        console.log(`Saved screenshot: ${outName}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log('All PDF pages rendered to PNG successfully!');
}

renderPdfPages().catch((err) => {
  console.error('Error rendering PDF pages:', err);
  process.exit(1);
});
