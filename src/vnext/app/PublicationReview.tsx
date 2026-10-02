import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DocumentRenderer } from '../rendering';
import { releasePublicationResources, reviewPublication, samePublicationSource, verifyPublicationForPrint, type PublicationReviewResult, type PublicationSource } from '../publication/review';
import { trapReviewTab, useReviewDialog } from './review-dialog';
import { publicationDiagnosticDetails, publicationDiagnosticLocation, publicationDiagnosticMessage } from './publication-diagnostic-presentation';

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
    <section ref={dialog} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="publication-heading" aria-describedby="publication-description" className="vnext-publication-dialog"
      onKeyDown={event => { trapReviewTab(event); if (event.key === 'Escape') close(); }}>
      <header><div className="vnext-dialog-heading"><p className="vnext-dialog-eyebrow">Publicação</p>
        <h2 id="publication-heading">Revisar e publicar</h2></div>
        <button type="button" className="vnext-btn-secondary" onClick={close}>Voltar ao editor</button></header>
      <div className="vnext-publication-controls">
        <p id="publication-description" className="vnext-dialog-description">Confira as páginas e a verificação do catálogo antes de gerar o PDF.</p>
        {!source ? <p role="alert" className="vnext-status" data-tone="warning">Salve o catálogo e aguarde a confirmação antes de publicar.</p>
          : !current ? <p role="alert" className="vnext-status" data-tone="warning">O catálogo ou o acesso mudou. Feche a revisão, salve e abra novamente.</p>
          : <p role="status" className="vnext-status" data-tone={running ? 'pending' : result?.status === 'READY' ? 'success' : 'error'}>
            {running ? 'Verificando páginas, fontes e imagens…' : result?.status === 'READY' ? 'Pronto para imprimir ou salvar PDF.' : 'Publicação bloqueada. Corrija os itens abaixo no editor e salve novamente.'}</p>}
        {result?.diagnostics.length ? <div>
          <h3>{result.status === 'BLOCKED' ? 'Itens para corrigir' : 'Pontos para revisar'}</h3>
          <ul className="vnext-publication-diagnostics">{result.diagnostics.map((item, i) => <li key={i}
            className="vnext-publication-diagnostic" data-severity={item.severity} data-publication-diagnostic={item.code}>
            <strong className="vnext-diagnostic-location">{publicationDiagnosticLocation(result.document, item)}</strong>
            <span className="vnext-diagnostic-kind">{item.severity === 'ERROR' ? 'Correção necessária' : 'Revisar'}</span>
            <p className="vnext-diagnostic-message">{publicationDiagnosticMessage(item.code)}</p>
            <details className="vnext-technical-details"><summary>Detalhes técnicos</summary>
              <dl>{publicationDiagnosticDetails(item).map(([label, value]) => <React.Fragment key={label}>
                <dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
            </details>
          </li>)}</ul>
        </div> : null}
        {printMessage && <p role="alert" className="vnext-status" data-tone="error">{printMessage}</p>}
        <p className="vnext-dialog-description">Confira o conteúdo de todas as páginas. Na janela de impressão, escolha Salvar como PDF, papel A4, sem cabeçalhos e rodapés.</p>
        <button type="button" className="vnext-btn-primary" data-publication-action="print" disabled={status !== 'READY' || Boolean(printMessage)} onClick={() => { void print(); }}>Imprimir / salvar PDF</button>
      </div>
      <div ref={renderer} className="vnext-publication-pages" role="region" tabIndex={0} aria-label="Prévia de todas as páginas">
        {preview && <DocumentRenderer document={preview.document} plans={preview.plans} assetUrls={preview.urls} />}
      </div>
    </section>
  </div>, document.body);
}
