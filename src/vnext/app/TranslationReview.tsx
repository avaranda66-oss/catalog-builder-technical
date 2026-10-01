import React from 'react';
import { TranslationReviewCoordinator } from '../translation/review-coordinator';
import { translationReviewKey, type TranslationReviewRun } from '../translation/candidate';

const labels: Readonly<Record<string, string>> = {
  catalogTitle: 'Nome do catálogo', textObject: 'Texto', tableCell: 'Célula da tabela',
  tableTitle: 'Título da tabela', tableAnnotation: 'Nota da tabela', tableLegend: 'Legenda',
};

function ReviewRun({ run, coordinator, index, disabled }: {
  run: TranslationReviewRun; coordinator: TranslationReviewCoordinator; index: number; disabled: boolean;
}) {
  const [draft, setDraft] = React.useState(run.translatedText);
  return <div className="vnext-translation-run">
    <label htmlFor={`translation-run-${index}`}>{labels[run.kind] ?? 'Texto'} {index + 1}</label>
    <p className="vnext-translation-source"><span>Original</span>{run.sourceText}</p>
    <textarea id={`translation-run-${index}`} data-translation-run={index} aria-label={`Tradução ${index + 1}`}
      value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)}
      onBlur={() => { coordinator.correct(run.unitId, run.runId, draft); }} />
  </div>;
}

export function TranslationReview({ coordinator, onClose, onOpenCopy }: {
  coordinator: TranslationReviewCoordinator; onClose: () => void; onOpenCopy: (catalogId: string) => void;
}) {
  const snapshot = React.useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const close = () => { if (coordinator.cancel()) onClose(); };
  const busy = snapshot.phase === 'generating' || snapshot.phase === 'creating';
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { closeRef.current?.focus(); }, []);
  return <div className="vnext-translation-backdrop">
    <section role="dialog" aria-modal="true" aria-labelledby="translation-heading" data-translation-review=""
      className="vnext-translation-dialog" onKeyDown={event => {
        if (event.key === 'Escape' && !snapshot.pending && snapshot.phase !== 'creating') close();
        if (event.key === 'Tab') {
          const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
          const first = elements[0], last = elements.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header><h2 id="translation-heading">Traduzir catálogo</h2>
        <button ref={closeRef} type="button" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Fechar</button></header>
      <p>Crie uma cópia em espanhol. O catálogo original será preservado.</p>
      <label>Idioma de destino <select aria-label="Idioma de destino" disabled={busy || snapshot.pending}><option value="es-ES">Espanhol</option></select></label>
      {snapshot.message && <p role="alert">{snapshot.message}</p>}
      {snapshot.phase === 'generating' && <p role="status">Gerando tradução…</p>}
      {snapshot.phase === 'creating' && <p role="status">Salvando e verificando a cópia…</p>}
      {snapshot.runs.length > 0 && <>
        <p>Compare com o original e corrija os textos se necessário. Mantenha os códigos e valores técnicos.</p>
        <div className="vnext-translation-runs">{snapshot.runs.map((run, index) => <ReviewRun
          key={translationReviewKey(run.unitId, run.runId)} run={run} index={index} coordinator={coordinator} disabled={busy || snapshot.pending} />)}</div>
        <p>A cópia precisará de revisão de layout antes da publicação.</p>
      </>}
      {snapshot.phase === 'created' && snapshot.copy && <div>
        <p role="status">Cópia em espanhol salva. Revise o layout antes de publicar.</p>
        <button type="button" data-translation-action="open-copy" onClick={() => onOpenCopy(snapshot.copy!.catalogId)}>Abrir cópia traduzida</button>
      </div>}
      <footer>
        {snapshot.phase !== 'created' && <button type="button" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Cancelar</button>}
        {(snapshot.phase === 'idle' || (snapshot.phase === 'error' && !snapshot.pending)) && <button type="button"
          data-translation-action="generate" onClick={() => { void coordinator.generate(); }}>Gerar tradução</button>}
        {snapshot.runs.length > 0 && <button type="button" data-translation-action="accept" disabled={busy || snapshot.reviewInvalid}
          onClick={() => { void coordinator.accept(); }}>{snapshot.pending ? 'Verificar cópia' : 'Salvar cópia traduzida'}</button>}
      </footer>
    </section>
  </div>;
}
