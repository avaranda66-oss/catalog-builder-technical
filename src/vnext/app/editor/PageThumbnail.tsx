import React from 'react';
import { createPortal } from 'react-dom';
import type { CatalogDocument, Page } from '../../domain';
import { compilePlans, DocumentRenderer, type TablePlan } from '../../rendering';
import './PageThumbnail.css';

/**
 * FR-18: a small picture of one page, drawn by the same DocumentRenderer that
 * prints it (like the Recovery preview), at about 0.15 of its size.
 *
 * - Only pages that are on screen are drawn (IntersectionObserver). Where the
 *   browser cannot tell what is on screen, nothing is drawn and the caller's
 *   fallback icon stays.
 * - Each page is cached by its content: an unchanged page is never drawn again,
 *   and a changed page off screen waits until it scrolls back into view.
 * - The page is drawn inside a closed shadow root, as the diagnostics probe
 *   does, so its text and data attributes never mix with the editor's own
 *   page, accessibility tree or tests. The host is aria-hidden.
 */

/** 210 × 297 mm at 96 CSS px per inch. */
const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;
export const PAGE_THUMBNAIL_SCALE = 0.15;
const PLAN_CACHE_LIMIT = 96;

export type PageThumbnailDocument = Pick<CatalogDocument, 'schemaVersion' | 'id' | 'title' | 'locale' | 'style' | 'assets'>;

export interface PageThumbnailProps {
  readonly page: Page;
  readonly document: PageThumbnailDocument;
  readonly assetUrls: ReadonlyMap<string, string>;
  /** Content key from `pageThumbnailSignature`; pages with the same key are drawn once. */
  readonly signature: string;
  readonly className?: string;
}

/** Counters for the FR-24 cost measurement and the cache tests. */
export const pageThumbnailDiagnostics = {
  draws: 0,
  planCompiles: 0,
  reset(): void {
    this.draws = 0;
    this.planCompiles = 0;
  },
};

const pageJson = new WeakMap<Page, string>();
const styleJson = new WeakMap<object, string>();
const assetsJson = new WeakMap<object, string>();

function cachedJson<T extends object>(cache: WeakMap<T, string>, value: T): string {
  let json = cache.get(value);
  if (json === undefined) {
    json = JSON.stringify(value);
    cache.set(value, json);
  }
  return json;
}

/** Everything that changes how a page looks: the page itself, the document style, the images and the language. */
export function pageThumbnailSignature(page: Page, document: PageThumbnailDocument): string {
  return `${cachedJson(pageJson, page)}|${cachedJson(styleJson, document.style)}|${cachedJson(assetsJson, document.assets)}|${document.locale}`;
}

const SHADOW_ROOTS = new WeakMap<Element, ShadowRoot>();
const planCache = new Map<string, ReadonlyMap<string, TablePlan>>();
function plansFor(signature: string, single: CatalogDocument): ReadonlyMap<string, TablePlan> {
  const cached = planCache.get(signature);
  if (cached) {
    planCache.delete(signature);
    planCache.set(signature, cached);
    return cached;
  }
  pageThumbnailDiagnostics.planCompiles += 1;
  const plans = compilePlans(single).plans;
  planCache.set(signature, plans);
  if (planCache.size > PLAN_CACHE_LIMIT) planCache.delete(planCache.keys().next().value as string);
  return plans;
}

let rendererCss: string | undefined;
/** The renderer's own rules and font faces, copied into each shadow root (same approach as the diagnostics probe). */
function thumbnailRendererCss(): string {
  if (rendererCss) return rendererCss;
  const rules: string[] = [];
  for (const sheet of [...window.document.styleSheets]) {
    try {
      for (const rule of [...sheet.cssRules]) {
        const cssText = rule.cssText;
        if (cssText.includes('[data-editorial-root]') || cssText.startsWith('@font-face')) rules.push(cssText);
      }
    } catch {
      // Same-origin Vite styles are readable; unrelated opaque sheets are skipped.
    }
  }
  const css = rules.join('\n');
  if (css) rendererCss = css;
  return css;
}

function useOnScreen(target: React.RefObject<HTMLElement>): boolean {
  const [onScreen, setOnScreen] = React.useState(false);
  React.useEffect(() => {
    const node = target.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOnScreen(entry.isIntersecting);
    }, { rootMargin: '160px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);
  return onScreen;
}

function useHostWidth(target: React.RefObject<HTMLElement>): number | undefined {
  const [width, setWidth] = React.useState<number>();
  React.useEffect(() => {
    const node = target.current;
    if (!node) return undefined;
    const measure = () => {
      const next = node.clientWidth;
      setWidth((current) => (next > 0 && next !== current ? next : current));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);
  return width;
}

class ThumbnailBoundary extends React.Component<{ readonly onError: () => void; readonly children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const ThumbnailDrawing = React.memo(function ThumbnailDrawing({ page, document, assetUrls, signature }: Omit<PageThumbnailProps, 'className'>) {
  const single = React.useMemo<CatalogDocument>(() => ({ ...document, pages: [page] }), [document, page]);
  const plans = plansFor(signature, single);
  pageThumbnailDiagnostics.draws += 1;
  return <DocumentRenderer document={single} plans={plans} assetUrls={assetUrls} />;
}, (previous, next) => previous.signature === next.signature && previous.assetUrls === next.assetUrls);

type Drawn = Omit<PageThumbnailProps, 'className'>;

function PageThumbnailView({ page, document, assetUrls, signature, className }: PageThumbnailProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const shadowRef = React.useRef<ShadowRoot | null>(null);
  const [mount, setMount] = React.useState<{ root: ShadowRoot; css: string } | null>(null);
  const [drawn, setDrawn] = React.useState<Drawn | null>(null);
  const [failed, setFailed] = React.useState(false);
  const onScreen = useOnScreen(hostRef);
  const width = useHostWidth(hostRef);

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || shadowRef.current || typeof host.attachShadow !== 'function') return;
    const root = host.attachShadow({ mode: 'closed' });
    shadowRef.current = root;
    SHADOW_ROOTS.set(host, root);
    setMount({ root, css: thumbnailRendererCss() });
  }, []);

  React.useEffect(() => {
    if (!onScreen || drawn?.signature === signature) return;
    React.startTransition(() => {
      setFailed(false);
      setDrawn({ page, document, assetUrls, signature });
    });
  }, [assetUrls, document, drawn?.signature, onScreen, page, signature]);

  const scale = width ? width / A4_WIDTH_PX : PAGE_THUMBNAIL_SCALE;
  const state = failed ? 'error' : drawn ? (drawn.signature === signature ? 'rendered' : 'stale') : 'waiting';
  return (
    <span ref={hostRef} className={['vnext-page-thumbnail', className].filter(Boolean).join(' ')} aria-hidden="true"
      data-page-thumbnail="" data-thumbnail-state={state}>
      {mount && drawn && createPortal(
        <>
          <style>{`${mount.css}\n:host{display:block}\n.vnext-thumbnail-stage{width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;transform-origin:0 0;pointer-events:none;user-select:none}\n.vnext-thumbnail-stage .editorial-page{box-shadow:none;margin:0}`}</style>
          <div className="vnext-thumbnail-stage" style={{ transform: `scale(${scale})` }}>
            <ThumbnailBoundary key={drawn.signature} onError={() => setFailed(true)}>
              <ThumbnailDrawing page={drawn.page} document={drawn.document} assetUrls={drawn.assetUrls} signature={drawn.signature} />
            </ThumbnailBoundary>
          </div>
        </>,
        mount.root
      )}
    </span>
  );
}

export const PageThumbnail = React.memo(PageThumbnailView, (previous, next) =>
  previous.signature === next.signature && previous.assetUrls === next.assetUrls && previous.className === next.className);

/** Test and measurement hook: the closed shadow root behind a thumbnail host. */
export function pageThumbnailShadowRoot(host: Element): ShadowRoot | undefined {
  return SHADOW_ROOTS.get(host);
}
