// Real Chromium publication review of an authored catalog at the browser's current devicePixelRatio
// (browser zoom or OS display scaling). Same pipeline as "Publicar / PDF"; no backend or production calls.
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { CatalogDocument } from '@/vnext/domain';
import { DocumentRenderer } from '@/vnext/rendering';
import { reviewPublication, verifyPublicationForPrint, type PublicationReviewResult, type PublicationSource } from '@/vnext/publication/review';
import '@/vnext/app/styles.css';

const params = new URLSearchParams(location.search);
const documentUrl = params.get('doc'), assetBase = params.get('assets');
if (!documentUrl || !assetBase) throw new Error('Missing doc/assets query parameters');
const response = await fetch(documentUrl, { cache: 'no-store' });
if (!response.ok) throw new Error(`Catalog unavailable: ${response.status}`);
const catalog = await response.json() as CatalogDocument;
const source: PublicationSource = {
  document: catalog, openSessionId: 'zoom-proof', remoteRevision: 1, authLineage: 'zoom-proof', authorityScopeId: 'zoom-proof',
  assetUrls: new Map(catalog.assets.map(asset => [asset.id, assetBase + encodeURIComponent(asset.name)])),
};
const host = document.getElementById('pages')!, root = createRoot(host);
const render = (value: PublicationReviewResult) => flushSync(() => root.render(
  <DocumentRenderer document={value.document} plans={value.plans} assetUrls={value.urls} />));

const result = await reviewPublication(source, host, render, () => true);
let print = 'NOT_ATTEMPTED';
if (result.status === 'READY') {
  try { await verifyPublicationForPrint(result, host, () => true); print = 'APPROVED'; }
  catch (error) { print = (error as { code?: string }).code ?? String(error); }
}
const codes: Record<string, number> = {};
for (const item of result.diagnostics) codes[item.code] = (codes[item.code] ?? 0) + 1;
Object.assign(window, { zoomProof: {
  devicePixelRatio: window.devicePixelRatio, title: catalog.title, pages: catalog.pages.length, status: result.status, print, codes,
  errors: result.diagnostics.filter(item => item.severity === 'ERROR').slice(0, 5).map(item => ({ code: item.code, details: item.details })),
} });
document.getElementById('status')!.textContent = `${catalog.title}: ${result.status} / ${print}`;
document.documentElement.dataset.proofDone = 'true';
