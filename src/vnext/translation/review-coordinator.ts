import { CatalogCloneService } from '../application';
import type { CatalogDocument } from '../domain';
import { PreparedCatalogCreateCoordinator, canonicalDocumentEquivalence, parsePersistenceEnvelope, type CatalogPersistenceEnvelope, type CatalogRepository } from '../persistence';
import { TranslationFoundationError, resolveTranslationProfile, type TranslationFoundationResult } from './contracts';
import type { VNextTranslationTargetLocale } from './language-registry';
import { TranslationFoundationService, type TranslationBatchProgress } from './service';
import { materializeTranslationCandidate, requireReviewText, translationReviewKey, type TranslationReviewRun } from './candidate';

export interface TranslationSource {
  readonly document: CatalogDocument;
  readonly remoteRevision: number;
  readonly openSessionId: string;
  readonly authLineage: string;
  readonly authorityScopeId: string;
}

export interface TranslationReviewSnapshot {
  readonly phase: 'idle' | 'generating' | 'review' | 'creating' | 'created' | 'error';
  readonly runs: readonly TranslationReviewRun[];
  readonly message?: string;
  readonly copy?: CatalogPersistenceEnvelope;
  readonly pending: boolean;
  readonly reviewInvalid?: boolean;
  readonly targetLocale: VNextTranslationTargetLocale;
  readonly reviewedRunKeys: readonly string[];
  readonly correctedRunKeys: readonly string[];
  readonly invalidRunKeys: readonly string[];
  readonly correctionCount: number;
  readonly batchProgress?: TranslationBatchProgress;
}

export interface TranslationReviewOptions {
  readonly foundation: TranslationFoundationService;
  readonly repository: CatalogRepository;
  readonly getSource: () => TranslationSource | undefined;
  readonly authLineage: () => string;
  readonly authorityScopeId: () => string;
  readonly createId: () => string;
  readonly createMutationId: () => string;
}

function message(error: unknown): string {
  const code = error instanceof TranslationFoundationError ? error.code : String(error);
  if (code === 'STALE_RESULT') return 'O catálogo de origem mudou. Gere a tradução novamente.';
  if (code === 'TECHNICAL_TOKEN_MISMATCH') return 'Mantenha os códigos e valores técnicos da origem ao revisar.';
  if (code === 'UNSUPPORTED_LANGUAGE') return 'Escolha um catálogo em português (Brasil) para traduzir para espanhol ou inglês.';
  if (code === 'CREDENTIAL_UNAVAILABLE') return 'O serviço de tradução ainda não está configurado. Contate o administrador.';
  if (code === 'PAYLOAD_TOO_LARGE') return 'Esta etapa excede o limite atual do serviço de tradução. Contate o administrador; o original foi preservado.';
  if (code === 'PROVIDER_RATE_LIMIT') return 'O serviço de tradução está ocupado. Aguarde um pouco e tente novamente; o original foi preservado.';
  if (code === 'PROVIDER_UNAVAILABLE') return 'A conexão com o serviço de tradução falhou. Confira sua conexão e tente novamente; o original foi preservado.';
  if (code === 'INVALID_PROVIDER_RESPONSE') return 'Não foi possível validar todos os textos recebidos. Tente novamente; nenhuma cópia incompleta foi criada.';
  if (code === 'UNCLASSIFIED_TEXT_SURFACE') return 'Há conteúdo neste catálogo que o serviço ainda não consegue traduzir. Contate o administrador; o original foi preservado.';
  if (code === 'ABORTED') return 'Tradução cancelada. O catálogo original foi preservado.';
  if (code === 'AMBIGUOUS_COMMIT_OUTCOME') return 'Não foi possível confirmar a cópia. Tente verificar novamente; nenhuma nova cópia será preparada.';
  return 'Não foi possível concluir a tradução. Tente novamente; o original foi preservado.';
}

/** Ephemeral review composition over W5.A, canonical clone and the existing W3 verified CREATE. */
export class TranslationReviewCoordinator {
  private snapshot: TranslationReviewSnapshot = { phase: 'idle', runs: [], pending: false, targetLocale: 'es-ES',
    reviewedRunKeys: [], correctedRunKeys: [], invalidRunKeys: [], correctionCount: 0 };
  private readonly listeners = new Set<() => void>();
  private readonly create: PreparedCatalogCreateCoordinator;
  private readonly clone: CatalogCloneService;
  private source?: TranslationSource;
  private result?: TranslationFoundationResult;
  private abort?: AbortController;
  private generation = 0;
  private accepting?: Promise<void>;
  private readonly corrections = new Map<string, string>();
  private readonly invalidCorrections = new Set<string>();
  private readonly reviewed = new Set<string>();

  constructor(private readonly options: TranslationReviewOptions) {
    this.create = new PreparedCatalogCreateCoordinator(options);
    this.clone = new CatalogCloneService(options.createId);
  }
  getSnapshot = (): TranslationReviewSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(snapshot: TranslationReviewSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }
  private progress() {
    return { targetLocale: this.snapshot.targetLocale, reviewedRunKeys: [...this.reviewed],
      correctedRunKeys: [...this.corrections.keys()], invalidRunKeys: [...this.invalidCorrections], correctionCount: this.corrections.size };
  }
  private current(): boolean {
    const source = this.source;
    const live = this.options.getSource();
    return Boolean(source && live && source.openSessionId === live.openSessionId && source.remoteRevision === live.remoteRevision
      && source.authLineage === this.options.authLineage() && source.authorityScopeId === this.options.authorityScopeId()
      && canonicalDocumentEquivalence(source.document) === canonicalDocumentEquivalence(live.document));
  }
  private requireCurrent(): void {
    if (!this.current()) throw new TranslationFoundationError('STALE_RESULT', 'Source changed');
  }
  cancel(): boolean {
    if (this.accepting || this.create.getState() === 'pending-verification') return false;
    this.abort?.abort(); this.generation += 1;
    this.source = undefined; this.result = undefined; this.corrections.clear(); this.invalidCorrections.clear(); this.reviewed.clear();
    this.publish({ ...this.progress(), phase: 'idle', runs: [], pending: false });
    return true;
  }
  async generate(targetLocale: VNextTranslationTargetLocale = 'es-ES'): Promise<void> {
    if (this.accepting || this.snapshot.phase === 'generating' || this.create.getState() === 'pending-verification') return;
    this.cancel();
    const source = this.options.getSource();
    if (!source) {
      this.publish({ ...this.progress(), phase: 'error', runs: [], pending: false, message: 'Salve o catálogo e conclua as edições antes de traduzir.' });
      return;
    }
    try { resolveTranslationProfile(source.document.locale, targetLocale); }
    catch (error) { this.publish({ ...this.progress(), phase: 'error', runs: [], pending: false, message: message(error) }); return; }
    this.source = { ...source, document: structuredClone(source.document) };
    const generation = this.generation;
    this.abort = new AbortController();
    this.publish({ ...this.progress(), targetLocale, phase: 'generating', runs: [], pending: false });
    try {
      const result = await this.options.foundation.translateCatalog(this.source.document, targetLocale, this.abort.signal, batchProgress => {
        if (generation === this.generation) this.publish({ ...this.snapshot, batchProgress });
      });
      if (generation !== this.generation) return;
      if (result.targetLocale !== targetLocale) throw new TranslationFoundationError('INVALID_PROVIDER_RESPONSE', 'Translation target changed during generation');
      this.requireCurrent();
      const candidate = await materializeTranslationCandidate(this.source.document, result);
      if (generation !== this.generation) return;
      this.requireCurrent(); this.result = result;
      this.publish({ ...this.progress(), batchProgress: this.snapshot.batchProgress, phase: 'review', runs: candidate.runs, pending: false });
    } catch (error) {
      if (generation === this.generation) this.publish({ ...this.progress(), batchProgress: this.snapshot.batchProgress,
        phase: 'error', runs: [], pending: false, message: message(error) });
    }
  }
  correct(unitId: string, runId: string, text: string): boolean {
    if (this.snapshot.phase !== 'review' && !(this.snapshot.phase === 'error' && !this.snapshot.pending)) return false;
    const run = this.snapshot.runs.find(item => item.unitId === unitId && item.runId === runId);
    if (!run) return false;
    const key = translationReviewKey(unitId, runId);
    try { this.requireCurrent(); requireReviewText(run.sourceText, text); }
    catch (error) {
      this.invalidCorrections.add(key);
      this.reviewed.delete(key);
      this.publish({ ...this.snapshot, ...this.progress(), reviewInvalid: true, message: message(error) }); return false;
    }
    this.invalidCorrections.delete(key);
    const generated = this.result?.units.find(unit => unit.unitId === unitId)?.runs.find(item => item.runId === runId)?.translatedText;
    if (text === generated) this.corrections.delete(key); else this.corrections.set(key, text);
    this.reviewed.add(key);
    const reviewInvalid = this.invalidCorrections.size > 0;
    this.publish({ ...this.progress(), phase: 'review', pending: false, reviewInvalid,
      ...(reviewInvalid ? { message: 'Corrija todos os textos sinalizados antes de salvar a cópia.' } : {}),
      runs: this.snapshot.runs.map(item => item === run ? { ...item, translatedText: text } : item) });
    return true;
  }
  markReviewed(unitId: string, runId: string): boolean {
    if (this.snapshot.phase !== 'review' || this.snapshot.pending) return false;
    const key = translationReviewKey(unitId, runId);
    if (this.invalidCorrections.has(key) || !this.snapshot.runs.some(run => run.unitId === unitId && run.runId === runId)) return false;
    try { this.requireCurrent(); } catch (error) {
      this.publish({ ...this.snapshot, phase: 'error', message: message(error) }); return false;
    }
    this.reviewed.add(key);
    this.publish({ ...this.snapshot, ...this.progress() });
    return true;
  }
  accept(): Promise<void> {
    if (this.accepting) return this.accepting;
    if (this.invalidCorrections.size > 0) return Promise.resolve();
    if (this.snapshot.phase === 'created' || !this.source || !this.result) return Promise.resolve();
    this.accepting = this.acceptOnce().finally(() => { this.accepting = undefined; });
    return this.accepting;
  }
  private async acceptOnce(): Promise<void> {
    this.publish({ ...this.snapshot, phase: 'creating', message: undefined });
    try {
      // Reconcile the exact previously dispatched copy before any new preparation or freshness gate.
      let created = await this.create.continuePending();
      if (!created) {
        this.requireCurrent();
        const source = this.source!;
        const read = await this.options.repository.getCatalog(source.document.id);
        this.requireCurrent();
        if (!read.ok) throw read.error.code;
        const remote = parsePersistenceEnvelope(read.value);
        if (remote.archivedAt !== null || remote.remoteRevision !== source.remoteRevision
          || canonicalDocumentEquivalence(remote.documentSnapshot) !== canonicalDocumentEquivalence(source.document)) {
          throw new TranslationFoundationError('STALE_RESULT', 'Remote source changed');
        }
        const candidate = await materializeTranslationCandidate(source.document, this.result!, this.corrections);
        this.requireCurrent();
        const copy = this.clone.clone(candidate.document);
        created = await this.create.create(copy, { originKind: 'translation', originId: source.document.id, originRevision: source.remoteRevision });
      }
      if (!created.ok) throw created.error.code;
      this.publish({ ...this.progress(), phase: 'created', runs: [], pending: false, copy: created.value });
    } catch (error) {
      this.publish({ ...this.snapshot, phase: 'error', pending: this.create.getState() === 'pending-verification', message: message(error) });
    }
  }
}
