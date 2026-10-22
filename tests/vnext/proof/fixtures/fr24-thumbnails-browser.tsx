import React from 'react';
import ReactDOM from 'react-dom/client';
import { createDocumentSession } from '@/vnext/application';
import { createW2CDemoDocument, W2C_PRIMARY_ASSET_ID } from '@/vnext/app/editor-defaults';
import { pageThumbnailDiagnostics } from '@/vnext/app/editor/PageThumbnail';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument, type Page, type TextObject } from '@/vnext/domain';
import { fatherTable } from './father-large-catalog-data';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

/**
 * FR-24 measurement fixture for the FR-18 thumbnails: a 10-page catalog (title,
 * text, photo and a 23 × 8 table per page) in the simple editor.
 * `?thumbnails=off` removes IntersectionObserver, so no thumbnail is drawn: the baseline.
 * Not a CI proof; the Onda 2 gate (and the 2H slice report) read `window.__FR24__`.
 */
const thumbnails = new URL(location.href).searchParams.get('thumbnails') !== 'off';
if (!thumbnails) Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true });

const demo = createW2CDemoDocument(() => crypto.randomUUID());
const asset = demo.assets.find((candidate) => candidate.id === W2C_PRIMARY_ASSET_ID)!;
const text = (id: string, value: string, y: number, height: number, size: number, bold = false): TextObject => ({
  id, type: 'text', zIndex: 2, frame: { xMm: 12, yMm: y, widthMm: 186, heightMm: height }, text: plainRichText(`${id}-rich`, value),
  style: { fontFamily: 'Noto Sans', fontSizePt: size, lineHeight: 1.2, fontWeight: bold ? 700 : 400, color: '#172033' },
});
const pages: Page[] = Array.from({ length: 10 }, (_, p) => ({
  id: `fr24-page-${p + 1}`, widthMm: 210, heightMm: 297, safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
  objects: [
    text(`fr24-title-${p + 1}`, `Calibradores · seção ${p + 1}`, 12, 12, 20, true),
    text(`fr24-text-${p + 1}`, 'Texto de apresentação da seção, com duas ou três linhas para medir o desenho das miniaturas.', 28, 16, 10),
    { id: `fr24-image-${p + 1}`, type: 'image', zIndex: 1, frame: { xMm: 150, yMm: 44, widthMm: 48, heightMm: 32 }, assetId: asset.id, fit: 'contain' },
    { id: `fr24-table-${p + 1}`, type: 'table', zIndex: 1, frame: { xMm: 12, yMm: 80, widthMm: 186, heightMm: 190 }, table: fatherTable(`fr24-grid-${p + 1}`, 23, 8, p * 22) },
  ],
}));
const seed: CatalogDocument = { ...demo, title: 'FR-24 · 10 páginas com miniaturas', pages, assets: [asset] };
const session = createDocumentSession(seed, { createId: () => crypto.randomUUID() });

const longTasks: number[] = [];
try {
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) longTasks.push(entry.duration); }).observe({ type: 'longtask', buffered: true });
} catch {
  // Long Task API unavailable: totals stay at zero.
}
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const idle = () => new Promise<void>((resolve) => (window.requestIdleCallback ? window.requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 50)));
const hosts = () => [...document.querySelectorAll<HTMLElement>('[data-page-thumbnail]')].filter((host) => host.closest('.vnext-page-list'));
const states = () => hosts().map((host) => host.getAttribute('data-thumbnail-state'));
async function until(condition: () => boolean, timeoutMs = 15000): Promise<boolean> {
  const started = performance.now();
  while (!condition()) {
    if (performance.now() - started > timeoutMs) return false;
    await frame();
  }
  return true;
}
const sum = (values: readonly number[]) => Math.round(values.reduce((total, value) => total + value, 0));

declare global {
  interface Window {
    __FR24__: {
      thumbnails: boolean;
      startedAt: number;
      states(): (string | null)[];
      draws(): number;
      thumbnailRenderMs(): number;
      longTaskMs(): number;
      firstView(): Promise<{ shellMs: number; visibleDrawnMs: number | null; drawnPages: number; longTaskMs: number }>;
      scrollAll(): Promise<{ allDrawnMs: number | null; drawnPages: number; longTaskMs: number }>;
      edits(count: number): Promise<{ commitMs: number[]; thumbnailMs: (number | null)[]; longTaskMs: number }>;
    };
  }
}

const startedAt = performance.now();
window.__FR24__ = {
  thumbnails,
  startedAt,
  states,
  draws: () => pageThumbnailDiagnostics.draws,
  thumbnailRenderMs: () => Math.round(pageThumbnailDiagnostics.renderMs),
  longTaskMs: () => sum(longTasks),
  async firstView() {
    await until(() => Boolean(document.querySelector('[data-vnext-shell]')));
    const shellMs = Math.round(performance.now() - startedAt);
    const drawn = thumbnails ? await until(() => states().some((state) => state === 'rendered') && !states().some((state, index) => state === 'waiting' && isOnScreen(hosts()[index]))) : false;
    await idle();
    return { shellMs, visibleDrawnMs: drawn ? Math.round(performance.now() - startedAt) : null, drawnPages: states().filter((state) => state === 'rendered').length, longTaskMs: sum(longTasks) };
  },
  async scrollAll() {
    const list = document.querySelector<HTMLElement>('.vnext-page-list');
    const started = performance.now(), before = longTasks.length;
    for (let top = 0; list && top <= list.scrollHeight; top += 120) {
      list.scrollTop = top;
      await frame();
    }
    const drawn = thumbnails ? await until(() => states().every((state) => state === 'rendered')) : false;
    await idle();
    return { allDrawnMs: drawn ? Math.round(performance.now() - started) : null, drawnPages: states().filter((state) => state === 'rendered').length, longTaskMs: sum(longTasks.slice(before)) };
  },
  async edits(count) {
    const list = document.querySelector<HTMLElement>('.vnext-page-list');
    if (list) list.scrollTop = 0;
    await frame();
    const commitMs: number[] = [], thumbnailMs: (number | null)[] = [], before = longTasks.length;
    for (let index = 0; index < count; index += 1) {
      const current = session.getSnapshot().document.pages[0].objects[0];
      if (current.type !== 'text') throw new Error('fixture title missing');
      const started = performance.now();
      const result = session.execute({ type: 'text.setContent', objectId: current.id, expectedText: current.text, plainText: `Calibradores · seção 1 · edição ${index + 1}` });
      if (!result.ok) throw new Error(result.error.code);
      await frame(); await frame();
      commitMs.push(Math.round(performance.now() - started));
      if (thumbnails) {
        const ok = await until(() => hosts()[0]?.getAttribute('data-thumbnail-state') === 'rendered');
        thumbnailMs.push(ok ? Math.round(performance.now() - started) : null);
      } else thumbnailMs.push(null);
      await idle();
    }
    return { commitMs, thumbnailMs, longTaskMs: sum(longTasks.slice(before)) };
  },
};

function isOnScreen(host: HTMLElement | undefined): boolean {
  if (!host) return false;
  const list = host.closest('.vnext-page-list')?.getBoundingClientRect();
  const rect = host.getBoundingClientRect();
  return Boolean(list && rect.bottom > list.top && rect.top < list.bottom);
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><VNextApp session={session} simpleByDefault /></React.StrictMode>);
