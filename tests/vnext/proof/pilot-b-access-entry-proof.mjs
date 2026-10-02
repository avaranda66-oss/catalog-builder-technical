import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const output = resolve(root, 'scratch/pilot-b-access-entry-proof');
await mkdir(output, { recursive: true });
const fixture = await readFile(
  resolve(root, 'tests/vnext/proof/fixtures/pilot-b-access-entry-browser.html'),
  'utf8'
);
const port = Number(process.env.PILOT_B_PROOF_PORT ?? 5262);
const origin = `http://127.0.0.1:${port}`;
const server = await createServer({
  root,
  plugins: [{
    name: 'pilot-b-proof-controlled-routes',
    configureServer(devServer) {
      devServer.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname !== '/' && pathname !== '/v2') {
          next();
          return;
        }
        try {
          const html = await devServer.transformIndexHtml(req.url ?? pathname, fixture);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  }],
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] },
  },
  logLevel: 'error',
});

const errors = {
  consoleErrors: [],
  pageErrors: [],
  failedResources: [],
  requestFailures: [],
};

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.failedResources.push({ status: response.status(), url: response.url() });
    }
  });
  page.on('requestfailed', (request) => {
    errors.requestFailures.push({
      url: request.url(),
      error: request.failure()?.errorText ?? null,
    });
  });
}

let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  watch(page);

  // 1 — Anonymous direct /v2: canonical root Login, no protected controls.
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Acesse seus catálogos' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.locator('[data-catalog-library]').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Novo catálogo|Criar novo catálogo|Abrir/ }).count(), 0);
  assert.equal(
    await page.evaluate(() => window.__PILOT_B_PROOF__.returnTarget()),
    '/v2'
  );
  const anonymous = { url: page.url(), returnTarget: '/v2' };

  // 2 — Resolving: no Library/create/open while authority is pending.
  await page.evaluate(() => window.__PILOT_B_PROOF__.setAuth('loading-hold'));
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.locator('[data-vnext-access-state="resolving"]').waitFor();
  assert.match((await page.locator('body').textContent()) ?? '', /Validando acesso/);
  assert.equal(await page.locator('[data-catalog-library]').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Novo catálogo|Criar novo catálogo|Abrir/ }).count(), 0);
  const resolving = { url: page.url(), protectedControls: 0 };

  // 3 — Authorized + empty Library: empty CTA and canonical logout become available.
  await page.evaluate(() => {
    window.__PILOT_B_PROOF__.setRepository('empty');
    window.__PILOT_B_PROOF__.setAuth('authorized');
  });
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();
  await page.getByText('Comece seu primeiro catálogo', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar novo catálogo' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Sair' }).count(), 1);
  const authorizedEmpty = { url: page.url(), create: true, logout: true };

  // 4 — Authorized + populated Library: row opens the exact catalog route.
  await page.evaluate(() => window.__PILOT_B_PROOF__.setRepository('populated'));
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.getByText('Catálogo PILOT.B', { exact: true }).waitFor();
  const catalogId = await page.evaluate(() => window.__PILOT_B_PROOF__.catalogId);
  await page.getByRole('button', { name: 'Abrir' }).click();
  await page.locator('[data-opened-catalog]').waitFor();
  assert.equal(
    await page.locator('[data-opened-catalog]').getAttribute('data-opened-catalog'),
    catalogId
  );
  assert.equal(new URL(page.url()).searchParams.get('catalog'), catalogId);
  const authorizedPopulated = { catalogId, url: page.url(), opened: true };

  // 5 — Valid session but unauthorized profile: root denial, no Library/create/open.
  await page.evaluate(() => window.__PILOT_B_PROOF__.setAuth('forbidden'));
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Acesso não disponível' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  assert.match((await page.locator('body').textContent()) ?? '', /Seu acesso ainda não foi liberado/);
  assert.equal(await page.locator('[data-catalog-library]').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Novo catálogo|Criar novo catálogo|Abrir/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Tentar novamente' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Sair' }).count(), 1);
  const unauthorized = { url: page.url(), libraryMounted: false };

  // 6 — Authorized list failure: exclusive retry, no empty/create/open.
  await page.evaluate(() => {
    window.__PILOT_B_PROOF__.setAuth('authorized');
    window.__PILOT_B_PROOF__.setRepository('list-error');
  });
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.locator('[data-library-list-error]').waitFor();
  assert.equal(await page.getByText('Comece seu primeiro catálogo', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Novo catálogo' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Criar novo catálogo' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Abrir' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Tentar novamente' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Sair' }).count(), 1);
  const listFailure = { url: page.url(), exclusive: true };

  // 7 — Logout -> root Login -> consume safe target once -> /v2 -> real reload, no loop.
  await page.evaluate(() => {
    window.__PILOT_B_PROOF__.setRepository('empty');
    window.__PILOT_B_PROOF__.setAuth('authorized');
  });
  await page.goto(`${origin}/v2`, { waitUntil: 'networkidle' });
  await page.getByText('Comece seu primeiro catálogo', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('heading', { name: 'Acesse seus catálogos' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(await page.evaluate(() => window.__PILOT_B_PROOF__.returnTarget()), '/v2');

  await page.evaluate(() => window.__PILOT_B_PROOF__.authenticate());
  await page.locator('[data-catalog-library]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/v2');
  assert.equal(await page.evaluate(() => window.__PILOT_B_PROOF__.returnTarget()), null);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-catalog-library]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/v2');
  assert.equal(await page.getByRole('heading', { name: 'Acesse seus catálogos' }).count(), 0);
  const logoutReturnRefresh = {
    finalUrl: page.url(),
    returnTargetConsumed: true,
    refreshLibraryMounted: true,
  };

  await page.screenshot({
    path: resolve(output, 'pilot-b-access-entry.png'),
    fullPage: true,
  });

  assert.deepEqual(errors.consoleErrors, []);
  assert.deepEqual(errors.pageErrors, []);
  assert.deepEqual(errors.failedResources, []);
  assert.deepEqual(errors.requestFailures, []);

  const evidence = {
    chromiumVersion: browser.version(),
    crossings: {
      anonymous,
      resolving,
      authorizedEmpty,
      authorizedPopulated,
      unauthorized,
      listFailure,
      logoutReturnRefresh,
    },
    ...errors,
  };
  await writeFile(
    resolve(output, 'evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    'utf8'
  );
  console.log('PILOT.B Access / Entry / Empty-State Chromium proof: PASS');
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
