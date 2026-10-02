import React from 'react';
import { TranslationReviewCoordinator } from '../translation/review-coordinator';
import { translationReviewKey, type TranslationReviewRun } from '../translation/candidate';
import { trapReviewTab, useReviewDialog } from './review-dialog';

const labels: Readonly<Record<string, string>> = {
  catalogTitle: 'Nome do catálogo', textObject: 'Texto', tableCell: 'Célula da tabela',
  tableTitle: 'Título da tabela', tableAnnotation: 'Nota da tabela', tableLegend: 'Legenda',
};

function ReviewRun({ run, coordinator, index, disabled, sourceLanguage }: {
  run: TranslationReviewRun; coordinator: TranslationReviewCoordinator; index: number; disabled: boolean; sourceLanguage: string;
}) {
  const [draft, setDraft] = React.useState(run.translatedText);
  return <div className="vnext-translation-run">
    <h4>{labels[run.kind] ?? 'Texto'} {index + 1}</h4>
    <div className="vnext-translation-columns">
      <p className="vnext-translation-source"><span>Original · {sourceLanguage}</span>{run.sourceText}</p>
      <div className="vnext-translation-target">
        <label htmlFor={`translation-run-${index}`}>Tradução · Espanhol</label>
        <textarea id={`translation-run-${index}`} data-translation-run={index} aria-label={`Tradução ${index + 1}`}
          value={draft} disabled={disabled} onChange={event => setDraft(event.target.value)}
          onBlur={() => { coordinator.correct(run.unitId, run.runId, draft); }} />
      </div>
    </div>
  </div>;
}

export function TranslationReview({ coordinator, sourceLocale, onClose, onOpenCopy }: {
  coordinator: TranslationReviewCoordinator; sourceLocale: string; onClose: () => void; onOpenCopy: (catalogId: string) => void;
}) {
  const snapshot = React.useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const sourceLanguage = sourceLocale === 'pt-BR' ? 'Português' : sourceLocale === 'es-ES' ? 'Espanhol' : sourceLocale;
  const close = () => { if (coordinator.cancel()) onClose(); };
  const busy = snapshot.phase === 'generating' || snapshot.phase === 'creating';
  const dialogRef = React.useRef<HTMLElement>(null);
  useReviewDialog(dialogRef, `${snapshot.phase}:${snapshot.pending}`);
  return <div className="vnext-translation-backdrop">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="translation-heading" aria-describedby="translation-description" data-translation-review=""
      className="vnext-translation-dialog" onKeyDown={event => {
        if (event.key === 'Escape' && !snapshot.pending && snapshot.phase !== 'creating') close();
        trapReviewTab(event);
      }}>
      <header><div className="vnext-dialog-heading"><p className="vnext-dialog-eyebrow">Cópia em outro idioma</p>
        <h2 id="translation-heading">Traduzir catálogo</h2></div>
        <button type="button" className="vnext-btn-quiet" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Fechar</button></header>
      <p id="translation-description" className="vnext-dialog-description">Crie uma cópia em espanhol. O catálogo original será preservado.</p>
      <div className="vnext-translation-languages">
        <div><span>Idioma original</span><strong>{sourceLanguage}</strong></div>
        <label>Idioma de destino <select aria-label="Idioma de destino" disabled={busy || snapshot.pending}><option value="es-ES">Espanhol</option></select></label>
      </div>
      {sourceLocale !== 'pt-BR' && <p className="vnext-status" data-tone="warning">Nesta etapa, a tradução é de português para espanhol. Abra um catálogo em português na Biblioteca para traduzir.</p>}
      {snapshot.message && <p role="alert" className="vnext-status" data-tone={snapshot.pending ? 'warning' : 'error'}>{snapshot.message}</p>}
      {snapshot.phase === 'generating' && <p role="status" className="vnext-status" data-tone="pending">Gerando tradução… Você poderá revisar os textos antes de salvar a cópia.</p>}
      {snapshot.phase === 'creating' && <p role="status" className="vnext-status" data-tone="pending">Salvando e verificando a cópia… Aguarde a confirmação para abrir o catálogo traduzido.</p>}
      {snapshot.runs.length > 0 && <>
        <div className="vnext-translation-review-intro"><h3>Revise a tradução</h3>
          <p>Compare com o original e corrija os textos se necessário. Mantenha os códigos e valores técnicos.</p></div>
        <div className="vnext-translation-runs">{snapshot.runs.map((run, index) => <ReviewRun
          key={translationReviewKey(run.unitId, run.runId)} run={run} index={index} coordinator={coordinator}
          sourceLanguage={sourceLanguage} disabled={busy || snapshot.pending} />)}</div>
        <p className="vnext-dialog-description">Depois de salvar a cópia, confira se os textos cabem nas páginas antes de publicar.</p>
      </>}
      {snapshot.phase === 'created' && snapshot.copy && <p role="status" className="vnext-status" data-tone="success">Cópia em espanhol salva. Confira as páginas antes de publicar.</p>}
      <footer>
        {snapshot.phase !== 'created' && <button type="button" className="vnext-btn-secondary" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Cancelar</button>}
        {(snapshot.phase === 'idle' || (snapshot.phase === 'error' && !snapshot.pending)) && <button type="button"
          className={snapshot.runs.length > 0 ? 'vnext-btn-secondary' : 'vnext-btn-primary'}
          data-translation-action="generate" onClick={() => { void coordinator.generate(); }}>Gerar tradução</button>}
        {snapshot.runs.length > 0 && <button type="button" className="vnext-btn-primary" data-translation-action="accept" disabled={busy || snapshot.reviewInvalid}
          onClick={() => { void coordinator.accept(); }}>{snapshot.pending ? 'Verificar cópia' : 'Salvar cópia traduzida'}</button>}
        {snapshot.phase === 'created' && snapshot.copy && <button type="button" className="vnext-btn-primary" data-translation-action="open-copy"
          onClick={() => onOpenCopy(snapshot.copy!.catalogId)}>Abrir cópia traduzida</button>}
      </footer>
    </section>
  </div>;
}
