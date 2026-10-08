import React from 'react';
import { Check } from 'lucide-react';
import { TranslationReviewCoordinator } from '../translation/review-coordinator';
import { translationReviewKey, type TranslationReviewRun } from '../translation/candidate';
import { getTranslationLanguage, VNEXT_TRANSLATION_PROFILES, type VNextTranslationTargetLocale } from '../translation/language-registry';
import { protectTechnicalTokens } from '../translation/technical-token-protector';
import { trapReviewTab, useReviewDialog } from './review-dialog';

const languageNames: Readonly<Record<string, string>> = {
  'pt-BR': 'Português', 'es-ES': 'Espanhol', 'en-US': 'Inglês',
};
const targetLocales: readonly VNextTranslationTargetLocale[] = VNEXT_TRANSLATION_PROFILES.map(profile => profile.targetLocale);

function languageLabel(locale: string) {
  const language = getTranslationLanguage(locale);
  return { name: languageNames[locale] ?? language?.displayName ?? locale, regional: language?.displayName ?? locale };
}

function groupReviewRuns(runs: readonly TranslationReviewRun[]) {
  const pages = new Map<string, { pageLabel: string; groups: Map<string, { typeLabel: string; runs: { run: TranslationReviewRun; index: number }[] }> }>();
  runs.forEach((run, index) => {
    let page = pages.get(run.pageLabel);
    if (!page) {
      page = { pageLabel: run.pageLabel, groups: new Map() };
      pages.set(run.pageLabel, page);
    }
    let group = page.groups.get(run.typeLabel);
    if (!group) {
      group = { typeLabel: run.typeLabel, runs: [] };
      page.groups.set(run.typeLabel, group);
    }
    group.runs.push({ run, index });
  });
  return [...pages.values()].map(page => ({ pageLabel: page.pageLabel, groups: [...page.groups.values()] }));
}

function ReviewRun({ run, coordinator, index, disabled, sourceLanguage, targetLanguage, reviewed, corrected, invalid, onDraftChange, onDraftCommitted }: {
  run: TranslationReviewRun; coordinator: TranslationReviewCoordinator; index: number; disabled: boolean;
  sourceLanguage: string; targetLanguage: string; reviewed: boolean; corrected: boolean; invalid: boolean;
  onDraftChange: (run: TranslationReviewRun, text: string) => void; onDraftCommitted: (run: TranslationReviewRun) => void;
}) {
  const [edit, setEdit] = React.useState<{ basis: string; text: string }>();
  const draft = edit?.basis === run.translatedText ? edit.text : run.translatedText;
  const hasDraft = draft !== run.translatedText;
  const protectedValues = [...new Set(protectTechnicalTokens(run.sourceText).tokens.map(token => token.value))];
  const errorId = `translation-run-error-${index}`;
  const commitDraft = () => {
    if ((hasDraft || invalid) && !coordinator.correct(run.unitId, run.runId, draft)) return false;
    onDraftCommitted(run); return true;
  };
  return <div className="vnext-translation-run" data-translation-run-state={invalid ? 'invalid' : hasDraft ? 'editing' : corrected ? 'corrected' : reviewed ? 'reviewed' : 'generated'}>
    <div className="vnext-translation-run-heading">
      <h5>{run.typeLabel} · trecho {index + 1}</h5>
      <span className="vnext-translation-run-status" data-tone={invalid ? 'error' : reviewed && !hasDraft ? 'success' : 'muted'}>
        {invalid ? 'Correção necessária' : hasDraft ? 'Em edição' : corrected ? 'Corrigido e revisado' : reviewed ? 'Revisado' : 'Gerado'}
      </span>
    </div>
    <div className="vnext-translation-columns">
      <p className="vnext-translation-source"><span>Original · {sourceLanguage}</span>{run.sourceText}</p>
      <div className="vnext-translation-target">
        <label htmlFor={`translation-run-${index}`}>Tradução · {targetLanguage}</label>
        <textarea id={`translation-run-${index}`} data-translation-run={index} aria-label={`Tradução ${index + 1}`}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          value={draft} disabled={disabled} onChange={event => { setEdit({ basis: run.translatedText, text: event.target.value }); onDraftChange(run, event.target.value); }}
          onBlur={commitDraft} />
        {invalid && <p id={errorId} className="vnext-translation-inline-error">Confira este trecho: preserve os códigos, números e unidades do original. Use texto simples e preencha a tradução antes de salvar.</p>}
      </div>
    </div>
    <div className="vnext-translation-run-footer">
      {protectedValues.length > 0 ? <details className="vnext-translation-protected">
        <summary tabIndex={0}>Dados técnicos protegidos ({protectedValues.length})</summary>
        <p>Mantenha estes valores exatamente como no original:</p>
        <ul>{protectedValues.map(value => <li key={value}><code>{value}</code></li>)}</ul>
      </details> : <p className="vnext-translation-run-help">Revise o sentido e a linguagem deste trecho.</p>}
      <button type="button" className={reviewed && !hasDraft ? 'vnext-btn-quiet is-reviewed' : 'vnext-btn-secondary'}
        aria-label={reviewed && !hasDraft ? `Trecho ${index + 1} revisado` : `Marcar trecho ${index + 1} como revisado`}
        disabled={disabled || invalid} onClick={() => { if (commitDraft()) coordinator.markReviewed(run.unitId, run.runId); }}>
        {reviewed && !hasDraft && <Check size={15} aria-hidden="true" />}{reviewed && !hasDraft ? 'Revisado' : 'Marcar como revisado'}
      </button>
    </div>
  </div>;
}

export function TranslationReview({ coordinator, sourceLocale, sourceTitle, onClose, onOpenCopy }: {
  coordinator: TranslationReviewCoordinator; sourceLocale: string; sourceTitle?: string;
  onClose: () => void; onOpenCopy: (catalogId: string) => void;
}) {
  const snapshot = React.useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const [selectedTarget, setSelectedTarget] = React.useState<VNextTranslationTargetLocale>(snapshot.targetLocale);
  const [reviewAttempt, setReviewAttempt] = React.useState(0);
  const [editingKeys, setEditingKeys] = React.useState<readonly string[]>([]);
  const drafts = React.useRef(new Map<string, { run: TranslationReviewRun; text: string }>());
  const onDraftChange = (run: TranslationReviewRun, text: string) => {
    const key = translationReviewKey(run.unitId, run.runId);
    if (text === run.translatedText) drafts.current.delete(key);
    else drafts.current.set(key, { run, text });
    setEditingKeys(keys => text === run.translatedText ? keys.filter(item => item !== key) : keys.includes(key) ? keys : [...keys, key]);
  };
  const onDraftCommitted = (run: TranslationReviewRun) => {
    const key = translationReviewKey(run.unitId, run.runId);
    drafts.current.delete(key); setEditingKeys(keys => keys.includes(key) ? keys.filter(item => item !== key) : keys);
  };
  const busy = snapshot.phase === 'generating' || snapshot.phase === 'creating';
  const targetLocked = busy || snapshot.pending || snapshot.runs.length > 0 || snapshot.phase === 'created';
  const targetLocale = targetLocked ? snapshot.targetLocale : selectedTarget;
  const sourceLanguage = languageLabel(sourceLocale);
  const targetLanguage = languageLabel(targetLocale);
  const targetMetadata = getTranslationLanguage(targetLocale);
  const groups = groupReviewRuns(snapshot.runs);
  const reviewedKeys = new Set(snapshot.reviewedRunKeys);
  const correctedKeys = new Set(snapshot.correctedRunKeys);
  const invalidKeys = new Set(snapshot.invalidRunKeys);
  const step = snapshot.phase === 'creating' || snapshot.phase === 'created' || snapshot.pending ? 2 : snapshot.runs.length > 0 ? 1 : 0;
  const reviewedCount = snapshot.reviewedRunKeys.filter(key => !editingKeys.includes(key)).length;
  const close = () => { if (coordinator.cancel()) onClose(); };
  const accept = () => {
    // Pending verification reconciles the already dispatched copy and cannot change its candidate.
    if (snapshot.pending) { void coordinator.accept(); return; }
    let valid = true;
    for (const { run, text } of drafts.current.values()) {
      if (!coordinator.correct(run.unitId, run.runId, text)) valid = false;
    }
    if (valid) { drafts.current.clear(); setEditingKeys([]); void coordinator.accept(); }
  };
  const dialogRef = React.useRef<HTMLElement>(null);
  useReviewDialog(dialogRef, `${snapshot.phase}:${snapshot.pending}`);
  return <div className="vnext-translation-backdrop">
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="translation-heading" aria-describedby="translation-description" data-translation-review=""
      className="vnext-translation-dialog vnext-translation-center" onKeyDown={event => {
        if (event.key === 'Escape' && !snapshot.pending && snapshot.phase !== 'creating') close();
        trapReviewTab(event);
      }}>
      <header><div className="vnext-dialog-heading"><p className="vnext-dialog-eyebrow">Catálogos em outros idiomas</p>
        <h2 id="translation-heading">Centro de Tradução</h2></div>
        <button type="button" className="vnext-btn-quiet" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Fechar</button></header>
      <p id="translation-description" className="vnext-dialog-description">Gere e revise uma cópia em outro idioma. O catálogo original será preservado.</p>
      <ol className="vnext-translation-steps" aria-label="Etapas da tradução">
        {['Idioma', 'Revisão', 'Cópia salva'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}
          data-state={step > index || snapshot.phase === 'created' ? 'complete' : step === index ? 'current' : 'waiting'}>
          <span aria-hidden="true">{index + 1}</span>{label}
        </li>)}
      </ol>
      <div className="vnext-translation-languages">
        <div className="vnext-translation-origin"><span>Catálogo original</span><strong>{sourceTitle || 'Catálogo atual'}</strong><p>{sourceLanguage.regional}</p></div>
        <label>Idioma de destino <select aria-label="Idioma de destino" value={targetLocale} disabled={targetLocked}
          onChange={event => {
            const target = targetLocales.find(locale => locale === event.target.value);
            if (target) setSelectedTarget(target);
          }}>
          {targetLocales.map(locale => <option key={locale} value={locale}>{languageLabel(locale).regional}</option>)}
        </select><span className="vnext-translation-locale-note">{targetMetadata?.nativeName}</span></label>
      </div>
      {sourceLocale !== 'pt-BR' && <p className="vnext-status" data-tone="warning">A origem precisa estar em português (Brasil). Abra o catálogo original em português na Biblioteca para gerar uma cópia em espanhol ou inglês.</p>}
      {snapshot.message && <p role="alert" className="vnext-status" data-tone={snapshot.pending ? 'warning' : 'error'}>{snapshot.message}</p>}
      {snapshot.phase === 'generating' && <div role="status" className="vnext-status" data-tone="pending">
        <p>Gerando tradução em {targetLanguage.name.toLocaleLowerCase('pt-BR')}… Você poderá revisar os textos antes de salvar a cópia.</p>
        {snapshot.batchProgress ? <>
          <p>{snapshot.batchProgress.completedBatches} de {snapshot.batchProgress.totalBatches} etapas concluídas. {snapshot.batchProgress.eligibleUnits} partes do catálogo para traduzir.</p>
          <progress aria-label="Progresso da tradução" value={snapshot.batchProgress.completedBatches} max={snapshot.batchProgress.totalBatches || 1} />
        </> : <p>Preparando os textos do catálogo…</p>}
        <p>Mantenha esta página aberta. Cancelar preserva o original; etapas já concluídas podem ser reaproveitadas nesta sessão.</p>
      </div>}
      {snapshot.phase === 'error' && !snapshot.pending && snapshot.runs.length === 0 && Boolean(snapshot.batchProgress?.completedBatches) && <p className="vnext-status" data-tone="warning">
        {snapshot.batchProgress!.completedBatches} de {snapshot.batchProgress!.totalBatches} etapas concluídas. Tentar novamente reaproveita os textos já validados nesta sessão, se o original e o idioma forem os mesmos. Recarregar ou fechar o navegador reinicia a tradução.
      </p>}
      {snapshot.phase === 'creating' && <p role="status" className="vnext-status" data-tone="pending">Salvando e verificando a cópia… Aguarde a confirmação para abrir o catálogo traduzido.</p>}
      {snapshot.runs.length > 0 && <>
        <div className="vnext-translation-review-intro"><div><h3>Revise a tradução</h3>
          <p>Compare com o original e corrija os textos se necessário. Os dados técnicos devem permanecer iguais.</p></div>
          <div className="vnext-translation-review-progress" role="status"><strong>{reviewedCount} de {snapshot.runs.length} trechos revisados</strong>
            <span>{snapshot.correctionCount} {snapshot.correctionCount === 1 ? 'correção' : 'correções'}</span></div>
        </div>
        <div className="vnext-translation-runs" role="region" aria-label="Textos para revisão" tabIndex={0}>{groups.map(page => <section className="vnext-translation-page" key={page.pageLabel}>
          <h4>{page.pageLabel}</h4>
          {page.groups.map(group => <div className="vnext-translation-type" key={group.typeLabel}>
            <p className="vnext-translation-type-heading">{group.typeLabel}<span>{group.runs.length} {group.runs.length === 1 ? 'trecho' : 'trechos'}</span></p>
            {group.runs.map(({ run, index }) => {
              const key = translationReviewKey(run.unitId, run.runId);
              return <ReviewRun key={`${reviewAttempt}:${targetLocale}:${key}`} run={run} index={index} coordinator={coordinator} sourceLanguage={sourceLanguage.name}
                targetLanguage={targetLanguage.name} disabled={busy || snapshot.pending} reviewed={reviewedKeys.has(key)} corrected={correctedKeys.has(key)} invalid={invalidKeys.has(key)}
                onDraftChange={onDraftChange} onDraftCommitted={onDraftCommitted} />;
            })}
          </div>)}
        </section>)}</div>
        <p className="vnext-translation-accept-help">Ao salvar, você confirma a revisão e cria uma cópia independente. Depois, confira se os textos cabem nas páginas antes de publicar.</p>
      </>}
      {snapshot.phase === 'created' && snapshot.copy && <p role="status" className="vnext-status" data-tone="success">Cópia em {targetLanguage.name.toLocaleLowerCase('pt-BR')} salva e aceita. Abra o catálogo para conferir as páginas antes de publicar.</p>}
      <footer>
        {snapshot.phase !== 'created' && <button type="button" className="vnext-btn-secondary" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Cancelar</button>}
        {(snapshot.phase === 'idle' || (snapshot.phase === 'error' && !snapshot.pending)) && <button type="button"
          className={snapshot.runs.length > 0 ? 'vnext-btn-secondary' : 'vnext-btn-primary'}
          data-translation-action="generate" onClick={() => { drafts.current.clear(); setEditingKeys([]); setReviewAttempt(attempt => attempt + 1); void coordinator.generate(targetLocale); }}>{snapshot.phase === 'error' && snapshot.runs.length === 0 ? 'Tentar tradução novamente' : 'Gerar tradução'}</button>}
        {snapshot.runs.length > 0 && <button type="button" className="vnext-btn-primary" data-translation-action="accept" disabled={busy || snapshot.reviewInvalid}
          onClick={accept}>{snapshot.pending ? 'Verificar cópia' : 'Salvar cópia traduzida'}</button>}
        {snapshot.phase === 'created' && snapshot.copy && <button type="button" className="vnext-btn-primary" data-translation-action="open-copy"
          onClick={() => onOpenCopy(snapshot.copy!.catalogId)}>Abrir cópia traduzida</button>}
      </footer>
    </section>
  </div>;
}
