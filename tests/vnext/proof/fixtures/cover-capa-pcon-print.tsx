// Prova da capa nativa "Capa de produto — PCON" (Onda 3.5, S3): roda a REVISÃO DE PUBLICAÇÃO real (fontes, medição,
// preflight de layout) sobre docs/examples/presys-capa-pcon-hibrido.catalog.json e desenha o resultado com o mesmo
// DocumentRenderer que a publicação imprime (window.print). A prova tira a captura de tela e imprime o PDF deste DOM.
//   ?src=/docs/examples/presys-capa-pcon-hibrido.catalog.json   resultado em window.__CAPA__ e window.__READY__
import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { CatalogDocumentSchema, type CatalogDocument } from '@/vnext/domain';
import { reviewPublication, type PublicationReviewResult } from '@/vnext/publication/review';
import { DocumentRenderer } from '@/vnext/rendering';
import '@/vnext/rendering/styles.css';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

declare global {
  interface Window {
    __CAPA__?: { status: string; diagnostics: { code: string; severity: string; objectId?: string; details: string }[] };
    __READY__?: boolean;
  }
}

const params = new URLSearchParams(window.location.search);
const src = params.get('src') ?? '/docs/examples/presys-capa-pcon-hibrido.catalog.json';
const assetDir = src.slice(0, src.lastIndexOf('/')) + '/assets';

function Review({ document, urls }: { document: CatalogDocument; urls: ReadonlyMap<string, string> }) {
  const root = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<PublicationReviewResult>();
  React.useEffect(() => {
    const host = root.current;
    if (!host) return;
    // Started after the commit, so the review's synchronous renders (flushSync) never run inside React's own render.
    const timer = setTimeout(() => void reviewPublication({ document, openSessionId: 'capa', remoteRevision: 1, authLineage: 'capa', authorityScopeId: 'capa', assetUrls: urls },
      host, (result) => flushSync(() => setView({ ...result })), () => true).then(async (result) => {
      window.__CAPA__ = { status: result.status, diagnostics: result.diagnostics.map((item) => ({
        code: item.code, severity: item.severity, objectId: item.objectId, details: item.details })) };
      await window.document.fonts.ready;
      await Promise.all([...window.document.images].map((image) => image.decode().catch(() => undefined)));
      await new Promise((resolve) => setTimeout(resolve, 300));
      window.__READY__ = true;
    }), 0);
    return () => clearTimeout(timer);
  }, [document, urls]);
  return <div ref={root} data-capa-review="">{view && <DocumentRenderer document={view.document} plans={view.plans} assetUrls={view.urls} />}</div>;
}

async function boot() {
  const document = CatalogDocumentSchema.parse(await (await fetch(src)).json());
  const urls = new Map(document.assets.map((asset) => [asset.id, `${assetDir}/${asset.name}`]));
  ReactDOM.createRoot(window.document.getElementById('root')!).render(<Review document={document} urls={urls} />);
}
void boot();
