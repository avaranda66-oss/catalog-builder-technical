import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DocumentRenderer } from '../rendering';
import { releasePublicationResources, reviewPublication, samePublicationSource, verifyPublicationForPrint, type PublicationReviewResult, type PublicationSource } from '../publication/review';
import { diagnosticMessage, W2D_DIAGNOSTIC_CODES } from './authoring-diagnostics';
import { trapReviewTab, useReviewDialog } from './review-dialog';
import { walkPageObjects, type CatalogDocument, type Diagnostic } from '../domain';

function publicationLocation(document: CatalogDocument, issue: Diagnostic): string {
  const pageIndex = document.pages.findIndex(page => page.id === issue.pageId);
  if (pageIndex < 0) return '';
  const object = walkPageObjects(document.pages[pageIndex]).find(entry => entry.object.id === issue.objectId)?.object;
  const parts = [`Página ${pageIndex + 1}`];
  if (object) {
    const objects = walkPageObjects(document.pages[pageIndex]);
    parts.push(`${object.type === 'table' ? 'tabela' : object.type === 'text' ? 'texto' : 'objeto'} ${objects.findIndex(entry => entry.object.id === object.id) + 1}`);
    if (object.type === 'table' && issue.cellId) {
      const cell = object.table.cells.find(cell => cell.id === issue.cellId);
      if (cell) parts.push(`linha ${object.table.rows.findIndex(row => row.id === cell.rowId) + 1}, coluna ${object.table.columns.findIndex(column => column.id === cell.columnId) + 1}`);
    }
  }
  return `${parts.join(' · ')}: `;
}

function publicationMessage(code: string, fallback: () => string): string {
  if (code === 'PUBLICATION_SOURCE_CHANGED') return 'O catálogo ou o acesso mudou. Feche a revisão, salve e abra novamente.';
  if (/FONT/.test(code)) return 'Não foi possível carregar as fontes do catálogo. Tente novamente com conexão.';
  if (/ASSET|IMAGE/.test(code)) return 'Não foi possível verificar uma imagem. Volte ao editor e confira as imagens antes de publicar.';
  if (W2D_DIAGNOSTIC_CODES.has(code)) return fallback();
  return 'Não foi possível verificar esta versão. Volte ao editor e tente novamente antes de publicar.';
}

export function PublicationReview({ getSource, subscribe, onClose }: {
  getSource: () => PublicationSource | undefined; subscribe: (listener: () => void) => () => void; onClose: () => void;
}) {
  const [source] = React.useState(getSource);
  const [preview, setPreview] = React.useState<PublicationReviewResult>();
  const [result, setResult] = React.useState<PublicationReviewResult>();
  const [running, setRunning] = React.useState(true);
  const [printMessage, setPrintMessage] = React.useState('');
  const host = React.useRef<HTMLDivElement>(null), dialog = React.useRef<HTMLElement>(null), renderer = React.useRef<HTMLDivElement>(null);
  const generation = React.useRef(0);
  const isCurrent = React.useCallback(() => Boolean(source && samePublicationSource(source, getSource())), [source, getSource]);
  const current = React.useSyncExternalStore(subscribe, isCurrent, isCurrent);
  const status = !current ? 'STALE' : running ? 'CHECKING' : result?.status ?? 'BLOCKED';
  useReviewDialog(dialog, status);

  React.useEffect(() => {
    const reviewGeneration = ++generation.current;
    let cancelled = false, owned: PublicationReviewResult | undefined;
    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (!source || !renderer.current) { setRunning(false); return; }
      const checked = await reviewPublication(source, renderer.current,
        value => { if (!cancelled) flushSync(() => setPreview({ ...value })); }, () => !cancelled && isCurrent());
      if (cancelled) { releasePublicationResources(checked); return; }
      owned = checked; setResult(checked); setRunning(false);
    };
    void run();
    return () => { generation.current = reviewGeneration + 1; cancelled = true; if (owned) releasePublicationResources(owned); };
  }, [source, isCurrent]);

  React.useEffect(() => {
    const before = () => {
      if (!isCurrent() || result?.status !== 'READY' || host.current?.dataset.printApproved !== 'true') host.current?.removeAttribute('data-print-approved');
    };
    const after = () => host.current?.removeAttribute('data-print-approved');
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    if (!current) after();
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [current, isCurrent, result]);

  const print = async () => {
    if (running || !result || !renderer.current) return;
    const printingGeneration = generation.current;
    const canPrint = () => printingGeneration === generation.current && Boolean(host.current?.isConnected) && isCurrent();
    setRunning(true); setPrintMessage('');
    try {
      await verifyPublicationForPrint(result, renderer.current, canPrint);
      if (!canPrint()) throw new Error('stale');
      flushSync(() => setRunning(false));
      if (host.current) host.current.dataset.printApproved = 'true';
      window.print();
    } catch {
      host.current?.removeAttribute('data-print-approved');
      if (printingGeneration === generation.current) setPrintMessage('A versão mudou ou não pôde ser verificada. Feche a revisão e confira o catálogo antes de imprimir.');
    } finally { if (printingGeneration === generation.current) setRunning(false); }
  };

  const close = () => { generation.current++; host.current?.removeAttribute('data-print-approved'); onClose(); };

  return createPortal(<div ref={host} data-publication-host="" data-publication-status={status} className="vnext-publication-backdrop">
    <section ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="publication-heading" className="vnext-publication-dialog"
      onKeyDown={event => { trapReviewTab(event); if (event.key === 'Escape') close(); }}>
      <header><h2 id="publication-heading">Revisar e publicar</h2><button type="button" onClick={close}>Voltar ao editor</button></header>
      <div className="vnext-publication-controls">
        {!source ? <p role="alert">Salve o catálogo e aguarde a confirmação antes de publicar.</p>
          : !current ? <p role="alert">O catálogo ou o acesso mudou. Feche a revisão, salve e abra novamente.</p>
          : <p role="status">{running ? 'Verificando páginas, fontes e imagens…' : result?.status === 'READY' ? 'Pronto para imprimir ou salvar PDF.' : 'Publicação bloqueada. Corrija os itens abaixo no editor e salve novamente.'}</p>}
        {result?.diagnostics.length ? <ul>{result.diagnostics.map((item, i) => <li key={i} data-publication-diagnostic={item.code}>
          {publicationLocation(result.document, item)}
          {publicationMessage(item.code, () => diagnosticMessage(item))}</li>)}</ul> : null}
        {printMessage && <p role="alert">{printMessage}</p>}
        <p>Confira o conteúdo de todas as páginas. Na janela de impressão, escolha Salvar como PDF, papel A4, sem cabeçalhos e rodapés.</p>
        <button type="button" data-publication-action="print" disabled={status !== 'READY' || Boolean(printMessage)} onClick={() => { void print(); }}>Imprimir / salvar PDF</button>
      </div>
      <div ref={renderer} className="vnext-publication-pages" role="region" tabIndex={0} aria-label="Prévia de todas as páginas">
        {preview && <DocumentRenderer document={preview.document} plans={preview.plans} assetUrls={preview.urls} />}
      </div>
    </section>
  </div>, document.body);
}
