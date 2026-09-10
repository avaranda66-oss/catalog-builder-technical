import React from 'react';
import { FileText, Plus, Redo2, Undo2 } from 'lucide-react';
import {
  createCatalogDocument,
  createDocumentSession,
  type DocumentSession,
} from '../application';
import { compilePlans, DocumentRenderer } from '../rendering';
import './styles.css';

const emptyAssetUrls = new Map<string, string>();

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function useDocumentSession(session: DocumentSession) {
  return React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

export function VNextApp() {
  const sessionRef = React.useRef<DocumentSession | null>(null);
  if (!sessionRef.current) {
    const document = createCatalogDocument(createBrowserId, 'Catálogo PRESYS');
    sessionRef.current = createDocumentSession(document, { createId: createBrowserId });
  }
  const session = sessionRef.current;
  const snapshot = useDocumentSession(session);
  const { document, canUndo, canRedo } = snapshot;
  const [selectedPageId, setSelectedPageId] = React.useState(document.pages[0].id);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const selectedPage = document.pages.find((page) => page.id === selectedPageId) ?? document.pages[0];
  const selectedPageIndex = document.pages.findIndex((page) => page.id === selectedPage.id);
  const previewDocument = React.useMemo(
    () => ({ ...document, pages: [selectedPage] }),
    [document, selectedPage]
  );
  const { plans } = React.useMemo(() => compilePlans(previewDocument), [previewDocument]);

  React.useEffect(() => {
    if (!document.pages.some((page) => page.id === selectedPageId)) setSelectedPageId(document.pages[0].id);
  }, [document, selectedPageId]);

  const addPage = () => {
    const result = session.execute({ type: 'page.add', afterPageId: selectedPage.id });
    if (!result.ok) {
      setStatusMessage('Não foi possível adicionar a página.');
      return;
    }
    const createdPageId = result.metadata.createdIds[0];
    if (createdPageId) setSelectedPageId(createdPageId);
    setStatusMessage('Página adicionada.');
  };

  const undo = () => {
    const result = session.undo();
    setStatusMessage(result.ok ? 'Alteração desfeita.' : 'Não há alterações para desfazer.');
  };

  const redo = () => {
    const result = session.redo();
    setStatusMessage(result.ok ? 'Alteração refeita.' : 'Não há alterações para refazer.');
  };

  return (
    <div className="vnext-shell" data-vnext-shell="">
      <header className="vnext-topbar">
        <div className="vnext-brand">
          <div className="vnext-brand-mark" aria-hidden="true">P</div>
          <div>
            <div className="vnext-product-line">PRESYS · Catalog Builder</div>
            <div className="vnext-title-row">
              <h1>{document.title}</h1>
              <span className="vnext-badge">VNext</span>
            </div>
          </div>
        </div>
        <div className="vnext-actions" aria-label="Histórico do documento">
          <button type="button" onClick={undo} disabled={!canUndo} aria-label="Desfazer última alteração">
            <Undo2 size={17} aria-hidden="true" />
            <span>Desfazer</span>
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} aria-label="Refazer última alteração">
            <Redo2 size={17} aria-hidden="true" />
            <span>Refazer</span>
          </button>
        </div>
      </header>

      <div className="vnext-workspace">
        <aside className="vnext-pages" aria-label="Páginas do catálogo">
          <div className="vnext-panel-heading">
            <span>Páginas</span>
            <span>{document.pages.length}</span>
          </div>
          <nav className="vnext-page-list" aria-label="Navegação de páginas">
            {document.pages.map((page, index) => (
              <button
                key={page.id}
                type="button"
                className={page.id === selectedPage.id ? 'is-current' : undefined}
                aria-current={page.id === selectedPage.id ? 'page' : undefined}
                onClick={() => setSelectedPageId(page.id)}
              >
                <span className="vnext-page-icon" aria-hidden="true"><FileText size={16} /></span>
                <span>Página {index + 1}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="vnext-add-page" onClick={addPage} aria-label="Adicionar nova página após a página atual">
            <Plus size={17} aria-hidden="true" />
            Adicionar página
          </button>
        </aside>

        <main className="vnext-canvas-area">
          <div className="vnext-canvas-meta">
            <div>
              <strong>Página {selectedPageIndex + 1} de {document.pages.length}</strong>
              <span>A4 · 210 × 297 mm</span>
            </div>
            <span className="vnext-memory-status">Rascunho nesta aba</span>
          </div>
          <div className="vnext-document-preview" aria-label={`Visualização da página ${selectedPageIndex + 1}`}>
            <DocumentRenderer document={previewDocument} plans={plans} assetUrls={emptyAssetUrls} />
          </div>
        </main>

        <aside className="vnext-info" aria-label="Informações desta versão">
          <span className="vnext-info-kicker">Primeira versão VNext</span>
          <h2>Base pronta para editar com segurança</h2>
          <p>As páginas já usam o novo documento A4 e um histórico previsível de alterações.</p>
          <div className="vnext-divider" />
          <h3>Salvamento</h3>
          <p>Por enquanto, este rascunho fica somente nesta aba. O salvamento chega em uma próxima etapa.</p>
          {statusMessage && <p className="vnext-live-status" role="status">{statusMessage}</p>}
        </aside>
      </div>
    </div>
  );
}
