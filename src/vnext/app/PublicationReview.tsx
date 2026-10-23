import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DocumentRenderer } from '../rendering';
import { releasePublicationResources, reviewPublication, samePublicationSource, verifyPublicationForPrint, type PublicationReviewResult, type PublicationSource } from '../publication/review';
import { trapReviewTab, useReviewDialog } from './review-dialog';
import { publicationDiagnosticDetails, publicationDiagnosticLocation, publicationDiagnosticText } from './publication-diagnostic-presentation';
import { draftMarkText, pageFooterFileTitle, type Diagnostic } from '../domain';
import { draftFileTitle, draftPrintHeadline, draftPrintSummary } from './publication-draft';

/**
 * C-04: "Corrigir este item" closes the review, so the blocked status tells the real way back: fix in the editor and
 * click "Publicar / PDF" again (there is no "Verificar novamente" in the editor).
 */
export const PUBLICATION_BLOCKED_MESSAGE = 'Publicação bloqueada. Clique em “Corrigir este item” para ir até cada problema no editor. '
  + 'Depois de corrigir, clique em Publicar / PDF de novo.';
const PUBLICATION_BLOCKED_WITHOUT_LOCATE = 'Publicação bloqueada. Volte ao editor, corrija os itens abaixo e clique em Publicar / PDF de novo.';

/**
 * The browser uses the page title as its suggested PDF filename. FR-55: with a document code in the page footer the
 * file is named "<código>-<rev>_<IDIOMA>" (e.g. "MAN-PCON-XV-03_PT.pdf"); otherwise the catalog title.
 */
export function publicationFileTitle(document: Parameters<typeof pageFooterFileTitle>[0] & { title: string }): string {
  return pdfFileTitle(pageFooterFileTitle(document) ?? document.title);
}

/** Shown when "Imprimir rascunho" is clicked before the "Entendi" box is checked. */
export const DRAFT_ACKNOWLEDGE_MESSAGE = 'Para imprimir o rascunho, marque antes a caixa “Entendi”.';
const DRAFT_STALE_MESSAGE = 'O catálogo mudou depois desta verificação. Clique em Verificar novamente antes de imprimir o rascunho.';

function pdfFileTitle(title: string): string {
  return title.replace(/[<>:"/\\|?*]|\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\.pdf$/i, '').replace(/[. ]+$/, '').slice(0, 120) || 'Catálogo';
}

export function PublicationReview({ getSource, subscribe, onClose, onLocateDiagnostic, waitingMessage, simple = false }: {
  getSource: () => PublicationSource | undefined; subscribe: (listener: () => void) => () => void; onClose: () => void;
  onLocateDiagnostic?: (diagnostic: Diagnostic) => void;
  /** Plain explanation shown while the saved version is not available yet (for example, a failed save). */
  waitingMessage?: string;
  /** Simple mode (the father's editor): no "Detalhes técnicos" with internal codes and IDs under each item. */
  simple?: boolean;
}) {
  const [source, setSource] = React.useState(getSource);
  const [attempt, setAttempt] = React.useState(0);
  const [preview, setPreview] = React.useState<PublicationReviewResult>();
  const [result, setResult] = React.useState<PublicationReviewResult>();
  const [running, setRunning] = React.useState(true);
  const [printMessage, setPrintMessage] = React.useState('');
  // "Imprimir rascunho mesmo assim": the confirmation, its two boxes and the watermark drawn only while printing.
  const [draftOpen, setDraftOpen] = React.useState(false);
  const [draftAcknowledged, setDraftAcknowledged] = React.useState(false);
  const [draftMarked, setDraftMarked] = React.useState(true);
  const [draftMessage, setDraftMessage] = React.useState('');
  const [draftWatermark, setDraftWatermark] = React.useState(false);
  const draftPrinting = React.useRef(false);
  const draftTrigger = React.useRef<HTMLButtonElement>(null), draftHeading = React.useRef<HTMLHeadingElement>(null);
  const draftAcknowledge = React.useRef<HTMLInputElement>(null);
  const host = React.useRef<HTMLDivElement>(null), dialog = React.useRef<HTMLElement>(null), renderer = React.useRef<HTMLDivElement>(null);
  const generation = React.useRef(0);
  const printTitle = React.useRef<{ previous: string; suggested: string }>();
  const restoreTitle = React.useCallback(() => {
    if (printTitle.current && document.title === printTitle.current.suggested) document.title = printTitle.current.previous;
    printTitle.current = undefined;
  }, []);
  /** Ends a draft print: the watermark disappears and the next print needs a new approval. */
  const endDraftPrint = React.useCallback(() => { draftPrinting.current = false; setDraftWatermark(false); }, []);
  const isCurrent = React.useCallback(() => Boolean(source && samePublicationSource(source, getSource())), [source, getSource]);
  const current = React.useSyncExternalStore(subscribe, isCurrent, isCurrent);
  const status = !source ? 'WAITING' : !current ? 'STALE' : running ? 'CHECKING' : result?.status ?? 'BLOCKED';
  useReviewDialog(dialog, status);

  // FR-50: opened while the last edit is still being saved. Wait for the saved version instead of getting stuck.
  React.useEffect(() => {
    if (source) return;
    // Running and source change together, so the status never flashes BLOCKED before the check starts.
    const capture = () => { const next = getSource(); if (next) { setRunning(true); setSource(next); } };
    capture();
    return subscribe(capture);
  }, [source, getSource, subscribe]);

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
  }, [source, isCurrent, attempt]);

  React.useEffect(() => {
    const before = () => {
      const approval = host.current?.dataset.printApproved;
      // "true": the checked, complete catalog. "draft": a blocked catalog the person chose to print as a draft.
      const approved = isCurrent() && (approval === 'true' ? result?.status === 'READY'
        : approval === 'draft' && draftPrinting.current && result?.status === 'BLOCKED');
      if (!approved) host.current?.removeAttribute('data-print-approved');
    };
    const after = () => { host.current?.removeAttribute('data-print-approved'); restoreTitle(); endDraftPrint(); };
    window.addEventListener('beforeprint', before); window.addEventListener('afterprint', after);
    if (!current) after();
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, [current, isCurrent, result, restoreTitle, endDraftPrint]);

  React.useEffect(() => restoreTitle, [restoreTitle]);

  const draftAvailable = status === 'BLOCKED' && Boolean(result && preview);
  const draftShown = draftAvailable && draftOpen;
  React.useEffect(() => { if (draftShown) draftHeading.current?.focus(); }, [draftShown]);

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
      restoreTitle();
      const suggested = publicationFileTitle(result.document);
      printTitle.current = { previous: document.title, suggested };
      document.title = suggested;
      window.print();
    } catch {
      host.current?.removeAttribute('data-print-approved');
      restoreTitle();
      if (printingGeneration === generation.current) setPrintMessage('A versão mudou ou não pôde ser verificada. Clique em Verificar novamente antes de imprimir.');
    } finally { if (printingGeneration === generation.current) setRunning(false); }
  };

  const openDraft = () => { setDraftAcknowledged(false); setDraftMarked(true); setDraftMessage(''); setDraftOpen(true); };
  const closeDraft = () => {
    setDraftOpen(false); setDraftMessage('');
    requestAnimationFrame(() => draftTrigger.current?.focus());
  };

  /**
   * Prints the pages exactly as the preview shows them (same renderer, same print CSS), without the final publication
   * check: the catalog stays blocked, "Imprimir / salvar PDF" stays locked and nothing is recorded or saved.
   */
  const printDraft = () => {
    if (!draftAcknowledged) { setDraftMessage(DRAFT_ACKNOWLEDGE_MESSAGE); draftAcknowledge.current?.focus(); return; }
    if (running || !result || result.status !== 'BLOCKED' || !preview || !host.current || !isCurrent()) { setDraftMessage(DRAFT_STALE_MESSAGE); return; }
    setDraftMessage('');
    draftPrinting.current = true;
    flushSync(() => setDraftWatermark(draftMarked));
    host.current.dataset.printApproved = 'draft';
    restoreTitle();
    const suggested = draftFileTitle(publicationFileTitle(result.document), result.document.locale);
    printTitle.current = { previous: document.title, suggested };
    document.title = suggested;
    window.print();
  };

  /** Re-reads the saved version and runs every check again, without closing the review. */
  const recheck = () => {
    generation.current++;
    host.current?.removeAttribute('data-print-approved');
    restoreTitle(); endDraftPrint(); setDraftOpen(false); setDraftMessage('');
    setPrintMessage(''); setResult(undefined); setPreview(undefined); setRunning(true);
    setSource(getSource());
    setAttempt(value => value + 1);
  };

  const close = () => { generation.current++; host.current?.removeAttribute('data-print-approved'); restoreTitle(); endDraftPrint(); onClose(); };
  const summary = draftShown && result ? draftPrintSummary(result.diagnostics) : undefined;
  const draftWord = result ? draftMarkText(result.document.locale) : 'RASCUNHO';

  return createPortal(<div ref={host} data-publication-host="" data-publication-status={status} className="vnext-publication-backdrop">
    <section ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="publication-heading" aria-describedby="publication-description" className="vnext-publication-dialog"
      onKeyDown={event => { trapReviewTab(event); if (event.key === 'Escape') { if (draftShown) closeDraft(); else close(); } }}>
      <header><div className="vnext-dialog-heading"><p className="vnext-dialog-eyebrow">Publicação</p>
        <h2 id="publication-heading">Revisar e publicar</h2></div>
        <button type="button" className="vnext-btn-secondary" onClick={close}>Voltar ao editor</button></header>
      <div className="vnext-publication-controls">
        <p id="publication-description" className="vnext-dialog-description">Confira as páginas e a verificação do catálogo antes de gerar o PDF.</p>
        {!source ? <p role="status" className="vnext-status" data-tone={waitingMessage ? 'warning' : 'pending'} data-publication-waiting="">
            {waitingMessage ?? 'Salvando o catálogo… A verificação começa sozinha assim que o salvamento terminar.'}</p>
          : !current ? <p role="alert" className="vnext-status" data-tone="warning">O catálogo ou o acesso mudou depois desta verificação. Clique em Verificar novamente.</p>
          : <p role="status" className="vnext-status" data-tone={running ? 'pending' : result?.status === 'READY' ? 'success' : 'error'}>
            {running ? 'Verificando páginas, textos, fontes e imagens…' : result?.status === 'READY' ? 'Pronto para imprimir ou salvar PDF.'
              : onLocateDiagnostic ? PUBLICATION_BLOCKED_MESSAGE : PUBLICATION_BLOCKED_WITHOUT_LOCATE}</p>}
        {!running && <button type="button" className="vnext-btn-secondary" data-publication-action="recheck" onClick={recheck}>Verificar novamente</button>}
        {result?.diagnostics.length ? <div>
          <h3>{result.status === 'BLOCKED' ? 'Itens para corrigir' : 'Pontos para revisar'}</h3>
          <ul className="vnext-publication-diagnostics">{result.diagnostics.map((item, i) => <li key={i}
            className="vnext-publication-diagnostic" data-severity={item.severity} data-publication-diagnostic={item.code}>
            <strong className="vnext-diagnostic-location">{publicationDiagnosticLocation(result.document, item)}</strong>
            <span className="vnext-diagnostic-kind">{item.severity === 'ERROR' ? 'Correção necessária' : 'Revisar'}</span>
            <p className="vnext-diagnostic-message">{publicationDiagnosticText(item)}</p>
            {onLocateDiagnostic && item.pageId && <button type="button" className="vnext-btn-secondary" disabled={!current}
              onClick={() => { if (isCurrent()) { close(); onLocateDiagnostic(item); } }}>Corrigir este item</button>}
            {!simple && <details className="vnext-technical-details"><summary>Detalhes técnicos</summary>
              <dl>{publicationDiagnosticDetails(item).map(([label, value]) => <React.Fragment key={label}>
                <dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
            </details>}
          </li>)}</ul>
        </div> : null}
        {draftAvailable && !draftShown && <div className="vnext-publication-draft-offer">
          <button ref={draftTrigger} type="button" className="vnext-btn-secondary" data-publication-action="draft" onClick={openDraft}>Imprimir rascunho mesmo assim</button>
          <p>Serve para conferir ou mostrar a alguém antes de terminar; não é o catálogo final.</p>
        </div>}
        {summary && <section className="vnext-publication-draft" data-publication-draft-confirm="" aria-labelledby="publication-draft-heading">
          <h3 id="publication-draft-heading" ref={draftHeading} tabIndex={-1}>Imprimir um rascunho incompleto?</h3>
          <p data-publication-draft-total="">{draftPrintHeadline(summary.total)}</p>
          {summary.groups.length > 0 && <ul data-publication-draft-summary="">{summary.groups.map(group => <li key={group.key}>{group.text}</li>)}</ul>}
          {summary.technical.length > 0 && <div className="vnext-publication-draft-technical" role="note" data-publication-draft-technical="">
            <strong>Atenção: o PDF pode sair com defeito</strong>
            <ul>{summary.technical.map(group => <li key={group.key}>{group.text}</li>)}</ul>
          </div>}
          <label className="vnext-publication-draft-check">
            <input ref={draftAcknowledge} type="checkbox" data-publication-draft="acknowledge" checked={draftAcknowledged}
              aria-invalid={draftMessage === DRAFT_ACKNOWLEDGE_MESSAGE ? true : undefined}
              aria-describedby={draftMessage ? 'publication-draft-message' : undefined}
              onChange={event => { setDraftAcknowledged(event.target.checked); if (event.target.checked) setDraftMessage(''); }} />
            <span>Entendi: este PDF tem informações incompletas e não é o catálogo final</span>
          </label>
          <label className="vnext-publication-draft-check">
            <input type="checkbox" data-publication-draft="watermark" checked={draftMarked} onChange={event => setDraftMarked(event.target.checked)} />
            <span>Marcar todas as páginas como RASCUNHO{draftWord !== 'RASCUNHO' ? ` (no idioma do catálogo: “${draftWord}”)` : ''}</span>
          </label>
          {draftMessage && <p id="publication-draft-message" role="alert" className="vnext-status" data-tone="error">{draftMessage}</p>}
          <div className="vnext-publication-draft-actions">
            <button type="button" className="vnext-btn-primary" data-publication-action="print-draft" onClick={printDraft}>Imprimir rascunho</button>
            <button type="button" className="vnext-btn-secondary" data-publication-action="draft-back" onClick={closeDraft}>Voltar</button>
          </div>
        </section>}
        {printMessage && <p role="alert" className="vnext-status" data-tone="error">{printMessage}</p>}
        <p className="vnext-dialog-description">O PDF mantém o texto pesquisável e as tabelas nítidas. Confira todas as páginas na prévia abaixo.</p>
        <p className="vnext-dialog-description" data-publication-print-instruction="">Na janela que abrir, escolha <strong>Salvar como PDF</strong> (em Destino ou Impressora) e clique em <strong>Salvar</strong>.</p>
        <button type="button" className="vnext-btn-primary" data-publication-action="print" disabled={status !== 'READY' || Boolean(printMessage)} onClick={() => { void print(); }}>Imprimir / salvar PDF</button>
      </div>
      <div ref={renderer} className="vnext-publication-pages" role="region" tabIndex={0} aria-label="Prévia de todas as páginas">
        {preview && <DocumentRenderer document={preview.document} plans={preview.plans} assetUrls={preview.urls} draft={draftWatermark} />}
      </div>
    </section>
  </div>, document.body);
}
