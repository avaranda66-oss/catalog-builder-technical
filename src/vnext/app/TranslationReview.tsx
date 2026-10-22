import React from 'react';
import { Check } from 'lucide-react';
import { TranslationReviewCoordinator } from '../translation/review-coordinator';
import { translationReviewKey, type TranslationReviewRun } from '../translation/candidate';
import { getTranslationLanguage, VNEXT_TRANSLATION_PROFILES, type VNextTranslationTargetLocale } from '../translation/language-registry';
import { protectTechnicalTokens } from '../translation/technical-token-protector';
import { reviewSuggestions, type NumberReadingQuestion, type ReviewSuggestions } from '../translation/review-suggestions';
import type { LocaleFormatConfirmationOption } from '../translation/locale-number-format';
import type { ManualSaveResult } from '../persistence/save-coordinator';
import { trapReviewTab, useReviewDialog } from './review-dialog';
import './translation-review-locale.css';

/** E-01: what "Gerar tradução" says when the automatic save before translating did not work. */
export const TRANSLATION_SAVE_NEEDED_MESSAGE = 'Para traduzir, o catálogo precisa estar salvo, e não foi possível salvar agora. '
  + 'Feche esta janela, confira o aviso de salvamento acima da página e clique em Traduzir novamente.';

const languageNames: Readonly<Record<string, string>> = {
  'pt-BR': 'Português', 'es-ES': 'Espanhol', 'en-US': 'Inglês',
};
const targetLocales: readonly VNextTranslationTargetLocale[] = VNEXT_TRANSLATION_PROFILES.map(profile => profile.targetLocale);
const NO_READINGS: readonly string[] = [];

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

/** FR-85/FR-87: avisos com botão. Nada muda no texto até a pessoa clicar. */
function RunSuggestions({ suggestions, index, disabled, targetLanguage, onApply, onApplyNumbers, onChooseReading }: {
  suggestions: ReviewSuggestions; index: number; disabled: boolean; targetLanguage: string;
  onApply: (text: string) => void; onApplyNumbers: () => void;
  onChooseReading: (question: NumberReadingQuestion, option: LocaleFormatConfirmationOption) => void;
}) {
  if (suggestions.total === 0) return null;
  return <div className="vnext-translation-suggestions" role="group" aria-label={`Sugestões para o trecho ${index + 1}`}>
    {suggestions.numberFix !== undefined && <div className="vnext-translation-suggestion" data-suggestion="numbers">
      <p>Números e abreviações no formato do {targetLanguage.toLocaleLowerCase('pt-BR')}: <code>{suggestions.numberSummary}</code></p>
      <div className="vnext-translation-suggestion-actions">
        <button type="button" className="vnext-btn-secondary" disabled={disabled} onClick={onApplyNumbers}>
          Aplicar ajuste de números ({suggestions.format.changes.length})
        </button>
      </div>
    </div>}
    {suggestions.questions.map((question, questionIndex) => {
      const questionId = `translation-confirm-${index}-${questionIndex}`;
      return <div key={question.token} className="vnext-translation-suggestion" data-suggestion="confirm">
        <p id={questionId}>{`Confirme: '${question.token}' é ${question.options.map(option => option.label).join(' ou ')}?`}</p>
        <div className="vnext-translation-suggestion-actions">
          {question.options.map(option => <button key={option.reading} type="button" className="vnext-btn-secondary" disabled={disabled}
            aria-describedby={questionId} onClick={() => onChooseReading(question, option)}>{option.label} ({option.value})</button>)}
        </div>
      </div>;
    })}
    {suggestions.glossary.map(item => <div key={item.hint.expected} className="vnext-translation-suggestion" data-suggestion="glossary">
      <p>{`Glossário PRESYS: use '${item.hint.expected}'${item.hint.found ? ` no lugar de '${item.hint.found}'` : ''}.`}</p>
      {item.replacement !== undefined && <div className="vnext-translation-suggestion-actions">
        <button type="button" className="vnext-btn-secondary" disabled={disabled} onClick={() => onApply(item.replacement!)}>{`Usar '${item.hint.expected}'`}</button>
      </div>}
    </div>)}
    {suggestions.spelling.map(item => <div key={item.misspelling.wrong.toLocaleLowerCase('en-US')} className="vnext-translation-suggestion" data-suggestion="spelling">
      <p>{`Grafia a corrigir: '${item.misspelling.wrong}' → '${item.misspelling.right}'`}</p>
      <div className="vnext-translation-suggestion-actions">
        <button type="button" className="vnext-btn-secondary" disabled={disabled} onClick={() => onApply(item.replacement)}>{`Corrigir grafia (${item.misspelling.right})`}</button>
      </div>
    </div>)}
  </div>;
}

const ReviewRun = React.memo(function ReviewRun({ run, coordinator, index, disabled, sourceLocale, targetLocale, sourceLanguage, targetLanguage, reviewed, corrected, invalid, confirmedReadings, onDraftChange, onDraftCommitted }: {
  run: TranslationReviewRun; coordinator: TranslationReviewCoordinator; index: number; disabled: boolean;
  sourceLocale: string; targetLocale: VNextTranslationTargetLocale;
  sourceLanguage: string; targetLanguage: string; reviewed: boolean; corrected: boolean; invalid: boolean;
  /** Leituras de números ambíguos já confirmadas neste trecho (vivem no coordenador, não aqui). */
  confirmedReadings: readonly string[];
  onDraftChange: (run: TranslationReviewRun, text: string) => void; onDraftCommitted: (run: TranslationReviewRun) => void;
}) {
  const [edit, setEdit] = React.useState<{ basis: string; text: string }>();
  const draft = edit?.basis === run.translatedText ? edit.text : run.translatedText;
  const hasDraft = draft !== run.translatedText;
  const protectedValues = React.useMemo(() => [...new Set(protectTechnicalTokens(run.sourceText).tokens.map(token => token.value))], [run.sourceText]);
  const suggestions = React.useMemo(() => reviewSuggestions(run.sourceText, draft, sourceLocale, targetLocale, confirmedReadings),
    [run.sourceText, draft, sourceLocale, targetLocale, confirmedReadings]);
  const textareaId = `translation-run-${index}`;
  const errorId = `translation-run-error-${index}`;
  const commitDraft = () => {
    if ((hasDraft || invalid) && !coordinator.correct(run.unitId, run.runId, draft)) return false;
    onDraftCommitted(run); return true;
  };
  // Uma sugestão aceita vira rascunho e é enviada ao coordenador na hora; se ele recusar, o trecho fica sinalizado como hoje.
  // O botão desaparece ao ser aceito, então o foco volta ao texto do trecho.
  const applySuggestion = (text: string) => {
    if (text === draft) return;
    setEdit({ basis: run.translatedText, text });
    onDraftChange(run, text);
    if (coordinator.correct(run.unitId, run.runId, text)) onDraftCommitted(run);
    document.getElementById(textareaId)?.focus();
  };
  const applyNumbers = () => {
    if (!suggestions || suggestions.numberFix === undefined) return;
    // Decimais que acabaram de ser decididos ("1,500 mm" → "1.500 mm") não podem virar pergunta depois.
    for (const value of suggestions.format.settled) coordinator.confirmReading(run.unitId, run.runId, value);
    applySuggestion(suggestions.numberFix);
  };
  const chooseReading = (question: NumberReadingQuestion, option: LocaleFormatConfirmationOption) => {
    coordinator.confirmReading(run.unitId, run.runId, option.value);
    applySuggestion(question.apply(option));
  };
  return <div className="vnext-translation-run" data-translation-run-state={invalid ? 'invalid' : hasDraft ? 'editing' : corrected ? 'corrected' : reviewed ? 'reviewed' : 'generated'}>
    <div className="vnext-translation-run-heading">
      <h5>{run.typeLabel} · trecho {index + 1}</h5>
      <span className="vnext-translation-run-status" aria-live="polite" data-tone={invalid ? 'error' : reviewed && !hasDraft ? 'success' : 'muted'}>
        {invalid ? 'Correção necessária' : hasDraft ? 'Em edição' : corrected ? 'Corrigido e revisado' : reviewed ? 'Revisado' : 'Gerado'}
      </span>
    </div>
    <div className="vnext-translation-columns">
      <p className="vnext-translation-source"><span>Original · {sourceLanguage}</span>{run.sourceText}</p>
      <div className="vnext-translation-target">
        <label htmlFor={textareaId}>Tradução · {targetLanguage}</label>
        <textarea id={textareaId} data-translation-run={index} aria-label={`Tradução ${index + 1}`}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
          value={draft} disabled={disabled} onChange={event => { setEdit({ basis: run.translatedText, text: event.target.value }); onDraftChange(run, event.target.value); }}
          onBlur={commitDraft} />
        {invalid && <p id={errorId} className="vnext-translation-inline-error">Confira este trecho: preserve os códigos, números e unidades do original. Use texto simples e preencha a tradução antes de salvar.</p>}
      </div>
    </div>
    {suggestions && <RunSuggestions suggestions={suggestions} index={index} disabled={disabled} targetLanguage={targetLanguage}
      onApply={applySuggestion} onApplyNumbers={applyNumbers} onChooseReading={chooseReading} />}
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
});

export function TranslationReview({ coordinator, sourceLocale, sourceTitle, onClose, onOpenCopy, save }: {
  coordinator: TranslationReviewCoordinator; sourceLocale: string; sourceTitle?: string;
  onClose: () => void; onOpenCopy: (catalogId: string) => void;
  /**
   * E-01: present for saved catalogs. The translation only reads the saved version, so "Gerar tradução" saves first
   * (like "Publicar / PDF") instead of asking the person to save and try again.
   */
  save?: () => Promise<ManualSaveResult>;
}) {
  const snapshot = React.useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, coordinator.getSnapshot);
  const [saving, setSaving] = React.useState(false);
  const [saveProblem, setSaveProblem] = React.useState('');
  const savingRef = React.useRef(false);
  const mounted = React.useRef(true);
  // Set on every mount: React.StrictMode mounts, unmounts and mounts again.
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  /** E-02: closing with corrections waits for this confirmation. */
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const discardReturnFocus = React.useRef<HTMLElement | null>(null);
  const keepReviewing = React.useRef<HTMLButtonElement>(null);
  const [selectedTarget, setSelectedTarget] = React.useState<VNextTranslationTargetLocale>(snapshot.targetLocale);
  const [reviewAttempt, setReviewAttempt] = React.useState(0);
  const [editingKeys, setEditingKeys] = React.useState<readonly string[]>([]);
  const drafts = React.useRef(new Map<string, { run: TranslationReviewRun; text: string }>());
  const onDraftChange = React.useCallback((run: TranslationReviewRun, text: string) => {
    const key = translationReviewKey(run.unitId, run.runId);
    if (text === run.translatedText) drafts.current.delete(key);
    else drafts.current.set(key, { run, text });
    setEditingKeys(keys => text === run.translatedText ? keys.filter(item => item !== key) : keys.includes(key) ? keys : [...keys, key]);
  }, []);
  const onDraftCommitted = React.useCallback((run: TranslationReviewRun) => {
    const key = translationReviewKey(run.unitId, run.runId);
    drafts.current.delete(key); setEditingKeys(keys => keys.includes(key) ? keys.filter(item => item !== key) : keys);
  }, []);
  const busy = snapshot.phase === 'generating' || snapshot.phase === 'creating';
  const targetLocked = busy || saving || snapshot.pending || snapshot.runs.length > 0 || snapshot.phase === 'created';
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
  // E-02: corrections typed or applied, and trechos marked as reviewed, are the person's work on this translation.
  const hasReviewWork = snapshot.runs.length > 0 && !snapshot.pending && snapshot.phase !== 'creating'
    && (snapshot.correctionCount > 0 || editingKeys.length > 0 || snapshot.invalidRunKeys.length > 0 || snapshot.reviewedRunKeys.length > 0);
  const discardAndClose = () => { setConfirmDiscard(false); if (coordinator.cancel()) onClose(); };
  const close = () => {
    if (confirmDiscard) return;
    if (!hasReviewWork) { discardAndClose(); return; }
    discardReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmDiscard(true);
  };
  const continueReviewing = () => {
    setConfirmDiscard(false);
    const back = discardReturnFocus.current;
    discardReturnFocus.current = null;
    if (back?.isConnected) queueMicrotask(() => { if (back.isConnected) back.focus(); });
  };
  React.useEffect(() => { if (confirmDiscard) keepReviewing.current?.focus(); }, [confirmDiscard]);
  // A confirmation for work that is no longer there (the copy was saved, or the review ended) goes away.
  if (confirmDiscard && !hasReviewWork) setConfirmDiscard(false);
  const generate = async () => {
    if (savingRef.current) return;
    const target = targetLocale;
    drafts.current.clear(); setEditingKeys([]); setReviewAttempt(attempt => attempt + 1); setSaveProblem('');
    if (!save) { void coordinator.generate(target); return; }
    savingRef.current = true; setSaving(true);
    try {
      const result = await save();
      if (!mounted.current) return;
      if (!result.ok && result.error.code !== 'SAVE_IN_FLIGHT_NEWER_WORK') { setSaveProblem(TRANSLATION_SAVE_NEEDED_MESSAGE); return; }
      void coordinator.generate(target);
    } catch {
      if (mounted.current) setSaveProblem(TRANSLATION_SAVE_NEEDED_MESSAGE);
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  // F-09 (usabilidade 2026-10-17): a caixa dos trechos tem pouca altura; na revisão o cabeçalho encolhe e o contador
  // diz quantos avisos existem dentro dela (os mesmos que cada trecho mostra; o texto em edição conta como está).
  const compact = snapshot.runs.length > 0;
  const suggestionTotals = React.useMemo(() => {
    const totals = { numbers: 0, questions: 0, glossary: 0 };
    for (const run of snapshot.runs) {
      const key = translationReviewKey(run.unitId, run.runId);
      const suggestions = reviewSuggestions(run.sourceText, drafts.current.get(key)?.text ?? run.translatedText, sourceLocale, targetLocale,
        snapshot.confirmedReadings[key] ?? NO_READINGS);
      if (!suggestions) continue;
      if (suggestions.numberFix !== undefined) totals.numbers += 1;
      totals.questions += suggestions.questions.length;
      totals.glossary += suggestions.glossary.length;
    }
    return totals;
  // editingKeys muda a cada rascunho e é o que torna os rascunhos (em ref) visíveis a este cálculo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.runs, snapshot.confirmedReadings, editingKeys, sourceLocale, targetLocale]);
  const suggestionSummary = [
    `${suggestionTotals.numbers} ${suggestionTotals.numbers === 1 ? 'ajuste' : 'ajustes'} de números`,
    `${suggestionTotals.questions} ${suggestionTotals.questions === 1 ? 'pergunta' : 'perguntas'}`,
    `${suggestionTotals.glossary} ${suggestionTotals.glossary === 1 ? 'termo' : 'termos'} do glossário`,
  ].join(' · ');
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
        if (event.key === 'Escape' && confirmDiscard) continueReviewing();
        else if (event.key === 'Escape' && !snapshot.pending && snapshot.phase !== 'creating') close();
        trapReviewTab(event);
      }}>
      <header><div className="vnext-dialog-heading"><p className="vnext-dialog-eyebrow">Catálogos em outros idiomas</p>
        <h2 id="translation-heading">Centro de Tradução</h2></div>
        <button type="button" className="vnext-btn-quiet" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Fechar</button></header>
      <p id="translation-description" className={compact ? 'vnext-dialog-description vnext-translation-description-compact' : 'vnext-dialog-description'}>Gere e revise uma cópia em outro idioma. O catálogo original será preservado.</p>
      <ol className="vnext-translation-steps" aria-label="Etapas da tradução">
        {['Idioma', 'Revisão', 'Cópia salva'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}
          data-state={step > index || snapshot.phase === 'created' ? 'complete' : step === index ? 'current' : 'waiting'}>
          <span aria-hidden="true">{index + 1}</span>{label}
        </li>)}
      </ol>
      {compact ? <p className="vnext-translation-languages-compact" data-translation-languages="compact">
        <strong>{sourceTitle || 'Catálogo atual'}</strong><span aria-hidden="true">·</span>
        <span>{sourceLanguage.regional} <span aria-hidden="true">→</span><span className="vnext-translation-description-compact"> para </span>{targetLanguage.regional}</span>
      </p> : <div className="vnext-translation-languages">
        <div className="vnext-translation-origin"><span>Catálogo original</span><strong>{sourceTitle || 'Catálogo atual'}</strong><p>{sourceLanguage.regional}</p></div>
        <label>Idioma de destino <select aria-label="Idioma de destino" value={targetLocale} disabled={targetLocked}
          onChange={event => {
            const target = targetLocales.find(locale => locale === event.target.value);
            if (target) setSelectedTarget(target);
          }}>
          {targetLocales.map(locale => <option key={locale} value={locale}>{languageLabel(locale).regional}</option>)}
        </select><span className="vnext-translation-locale-note">{targetMetadata?.nativeName}</span></label>
      </div>}
      {sourceLocale !== 'pt-BR' && <p className="vnext-status" data-tone="warning">A origem precisa estar em português (Brasil). Abra o catálogo original em português na Biblioteca para gerar uma cópia em espanhol ou inglês.</p>}
      {saveProblem && <p role="alert" className="vnext-status" data-tone="error" data-translation-save-problem="">{saveProblem}</p>}
      {snapshot.message && <p role="alert" className="vnext-status" data-tone={snapshot.pending ? 'warning' : 'error'}>{snapshot.message}</p>}
      {saving && <p role="status" className="vnext-status" data-tone="pending">Salvando o catálogo antes de traduzir…</p>}
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
            <span>{snapshot.correctionCount} {snapshot.correctionCount === 1 ? 'correção' : 'correções'}</span>
            <span className="vnext-translation-review-suggestions-summary" data-translation-suggestions-summary="">{suggestionSummary}</span></div>
        </div>
        <div className="vnext-translation-runs" role="region" aria-label="Textos para revisão" tabIndex={0}>{groups.map(page => <section className="vnext-translation-page" key={page.pageLabel}>
          <h4>{page.pageLabel}</h4>
          {page.groups.map(group => <div className="vnext-translation-type" key={group.typeLabel}>
            <p className="vnext-translation-type-heading">{group.typeLabel}<span>{group.runs.length} {group.runs.length === 1 ? 'trecho' : 'trechos'}</span></p>
            {group.runs.map(({ run, index }) => {
              const key = translationReviewKey(run.unitId, run.runId);
              return <ReviewRun key={`${reviewAttempt}:${targetLocale}:${key}`} run={run} index={index} coordinator={coordinator} sourceLanguage={sourceLanguage.name}
                sourceLocale={sourceLocale} targetLocale={targetLocale}
                targetLanguage={targetLanguage.name} disabled={busy || snapshot.pending} reviewed={reviewedKeys.has(key)} corrected={correctedKeys.has(key)} invalid={invalidKeys.has(key)}
                confirmedReadings={snapshot.confirmedReadings[key] ?? NO_READINGS}
                onDraftChange={onDraftChange} onDraftCommitted={onDraftCommitted} />;
            })}
          </div>)}
        </section>)}</div>
        <p className="vnext-translation-accept-help">Ao salvar, você confirma a revisão e cria uma cópia independente. Depois, confira se os textos cabem nas páginas antes de publicar.</p>
      </>}
      {snapshot.phase === 'created' && snapshot.copy && <p role="status" className="vnext-status" data-tone="success">Cópia em {targetLanguage.name.toLocaleLowerCase('pt-BR')} salva e aceita. Abra o catálogo para conferir as páginas antes de publicar.</p>}
      {confirmDiscard ? <footer className="vnext-translation-discard-footer">
        <div className="vnext-translation-discard" role="alertdialog" aria-modal="false" data-translation-discard=""
          aria-labelledby="translation-discard-title" aria-describedby="translation-discard-text">
          <h3 id="translation-discard-title">Descartar as correções da tradução?</h3>
          <p id="translation-discard-text">Se fechar agora, a tradução gerada e o que você corrigiu ou marcou como revisado nesta tela
            serão perdidos. Para guardar a tradução, continue revisando e clique em Salvar cópia traduzida. O catálogo original não muda.</p>
          <div className="vnext-translation-discard-actions">
            <button ref={keepReviewing} type="button" className="vnext-btn-primary" data-translation-action="keep-reviewing"
              onClick={continueReviewing}>Continuar revisando</button>
            <button type="button" className="vnext-btn-secondary" data-translation-action="discard"
              onClick={discardAndClose}>Descartar correções e fechar</button>
          </div>
        </div>
      </footer> : <footer>
        {snapshot.phase !== 'created' && <button type="button" className="vnext-btn-secondary" onClick={close} disabled={snapshot.phase === 'creating' || snapshot.pending}>Cancelar</button>}
        {(snapshot.phase === 'idle' || (snapshot.phase === 'error' && !snapshot.pending)) && <button type="button"
          className={snapshot.runs.length > 0 ? 'vnext-btn-secondary' : 'vnext-btn-primary'} aria-busy={saving || undefined}
          data-translation-action="generate" onClick={() => { void generate(); }}>{saving ? 'Salvando…' : snapshot.phase === 'error' && snapshot.runs.length === 0 ? 'Tentar tradução novamente' : 'Gerar tradução'}</button>}
        {snapshot.runs.length > 0 && <button type="button" className="vnext-btn-primary" data-translation-action="accept" disabled={busy || snapshot.reviewInvalid}
          onClick={accept}>{snapshot.pending ? 'Verificar cópia' : 'Salvar cópia traduzida'}</button>}
        {snapshot.phase === 'created' && snapshot.copy && <button type="button" className="vnext-btn-primary" data-translation-action="open-copy"
          onClick={() => onOpenCopy(snapshot.copy!.catalogId)}>Abrir cópia traduzida</button>}
      </footer>}
    </section>
  </div>;
}
