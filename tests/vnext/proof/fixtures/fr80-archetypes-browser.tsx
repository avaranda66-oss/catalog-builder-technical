import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createDocumentSession } from '@/vnext/application';
import type { AssetPersistenceBridge, AssetResolutionResult } from '@/vnext/asset';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { CatalogDocument } from '@/vnext/domain';
import { createDefaultCatalogStarterRegistry } from '@/vnext/library';
import { PRESYS_DATASHEET_STARTER_ID, PRESYS_FOLDER_STARTER_ID } from '@/vnext/library/starter-registry';
import { bindPresysPageReuse, DefaultStarterDependencyPreparer } from '@/vnext/library/starter-dependencies';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { findPlaceholder } from '@/vnext/publication/preflight';
import { reviewPublication, type PublicationReviewResult } from '@/vnext/publication/review';
import { DocumentRenderer } from '@/vnext/rendering';
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/700.css';

/**
 * FR-80 browser check for the PRESYS archetype starters (not a CI proof).
 * ?doc=ficha|folder runs the real publication review (fonts, measurement, layout preflight) on the
 * starter; &filled=1 first replaces every "A COMPLETAR" with example text. ?doc=editor opens the
 * folder in the simple editor with the page-model gallery available. Results: window.__FR80__.
 */
const params = new URL(location.href).searchParams;
const which = params.get('doc') ?? 'folder';
const filled = params.get('filled') === '1';
const registry = createDefaultCatalogStarterRegistry();
const starter = registry.get(which === 'ficha' ? PRESYS_DATASHEET_STARTER_ID : PRESYS_FOLDER_STARTER_ID);
if (!starter) throw new Error('missing starter');

function fillPlaceholders(document: CatalogDocument): CatalogDocument {
  const copy = structuredClone(document);
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.kind === 'text' && typeof record.text === 'string') {
      let text = record.text;
      for (let token = findPlaceholder(text); token; token = findPlaceholder(text)) text = text.split(token).join('Exemplo');
      record.text = text;
    }
    Object.values(record).forEach(visit);
  };
  visit(copy.pages);
  return copy;
}

declare global {
  interface Window {
    __FR80__?: { status: string; pages: number; diagnostics: { code: string; severity: string; page: number; objectId?: string }[] };
  }
}

function Review({ document }: { document: CatalogDocument }) {
  const root = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<PublicationReviewResult>();
  React.useEffect(() => {
    if (!root.current) return;
    void reviewPublication({ document, openSessionId: 'fr80', remoteRevision: 0, authLineage: 'fr80', authorityScopeId: 'fr80', assetUrls: new Map() },
      root.current, (result) => flushSync(() => setView({ ...result })), () => true).then((result) => {
      const pageIndex = new Map(result.document.pages.map((page, index) => [page.id, index + 1]));
      window.__FR80__ = { status: result.status, pages: result.document.pages.length, diagnostics: result.diagnostics.map((item) => ({
        code: item.code, severity: item.severity, page: item.pageId ? pageIndex.get(item.pageId) ?? 0 : 0, objectId: item.objectId,
      })) };
    });
  }, [document]);
  return <div ref={root} data-fr80-review="">{view && <DocumentRenderer document={view.document} plans={view.plans} assetUrls={view.urls} />}</div>;
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
if (which === 'editor') {
  const templates = createPresysPageTemplateRegistry();
  const session = createDocumentSession(starter.sourceDocument, { createId: () => crypto.randomUUID(), templateRegistry: templates });
  const offline = async (): Promise<AssetResolutionResult> => ({ ok: false, state: { status: 'offline', asset: starter.sourceDocument.assets[0] } } as AssetResolutionResult);
  const preparer = new DefaultStarterDependencyPreparer({ finalizeUpload: async () => ({ ok: false, error: { code: 'OFFLINE' } }), resolve: offline } as unknown as AssetPersistenceBridge);
  bindPresysPageReuse(session, { templates, preparer, getLineage: () => ({ authLineage: 'fr80', authorityScopeId: 'fr80', openSessionId: 'fr80', catalogId: starter.sourceDocument.id }), isCurrent: () => true, installRuntimeAsset: () => undefined });
  root.render(<React.StrictMode><VNextApp session={session} simpleByDefault /></React.StrictMode>);
} else {
  root.render(<Review document={filled ? fillPlaceholders(starter.sourceDocument) : starter.sourceDocument} />);
}
