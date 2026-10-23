import React from 'react';
import type { CatalogDocument } from '../../../domain';
import {
  ARSENAL_CATEGORY_LABELS,
  ARSENAL_KIND_CATEGORIES,
  ARSENAL_LIMITS,
  ARSENAL_PAYLOAD_SCHEMA_VERSION,
  parseArsenalPresetDraft,
  type ArsenalCaptureResult,
  type ArsenalCaptureSource,
  type ArsenalCategory,
  type ArsenalPreset,
  type ArsenalPresetDraft,
} from '../../../arsenal';
import type { PageThumbnailDocument } from '../PageThumbnail';
import { ArsenalModal } from './ArsenalModal';
import { ArsenalPresetThumbnail } from './ArsenalThumbnail';
import {
  arsenalPayloadHasTables,
  arsenalRandomId,
  arsenalRepositoryErrorMessage,
  parseArsenalTags,
  type ArsenalEditorRuntime,
  type ArsenalSaveRequest,
} from './arsenal-runtime';
import './Arsenal.css';

export interface ArsenalSaveDialogProps {
  readonly runtime: ArsenalEditorRuntime;
  /** The catalog as it is when the dialog opens. */
  readonly document: CatalogDocument;
  readonly request: ArsenalSaveRequest;
  readonly assetUrls: ReadonlyMap<string, string>;
  /** Where the focus goes back (the button or menu that opened the dialog). */
  readonly returnFocus?: HTMLElement | null;
  readonly onClose: () => void;
  readonly onSaved: (preset: ArsenalPreset, message: string) => void;
}

type What = 'content' | 'style';

const CAPTURE_PROBLEMS: Readonly<Record<string, string>> = Object.freeze({
  SOURCE_NOT_FOUND: 'O que estava selecionado mudou. Feche e tente de novo.',
  SOURCE_EMPTY: 'Não há nada visível para guardar (objetos escondidos não entram).',
  SOURCE_UNSUPPORTED: 'Este objeto não pode ser guardado no arsenal.',
  TOO_LARGE: 'É grande demais para o arsenal (mais de 400 objetos ou de 768 KB). Guarde uma parte menor.',
  INVALID_PAYLOAD: 'Não foi possível preparar este conteúdo para o arsenal.',
});

const DRAFT_PREVIEW_ID = '00000000-0000-4000-8000-000000000000';

function previewPreset(draft: Pick<ArsenalPresetDraft, 'kind' | 'payload' | 'name' | 'category'>): ArsenalPreset {
  return {
    id: DRAFT_PREVIEW_ID, scope: 'team', origin: 'person', kind: draft.kind, name: draft.name || 'Prévia', category: draft.category,
    tags: [], synonyms: [], payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION, revision: 1, createdBy: null, createdByName: null,
    createdAt: null, updatedAt: null, useCount: 0, lastUsedAt: null, payload: draft.payload,
  } as ArsenalPreset;
}

function captureSafely(runtime: ArsenalEditorRuntime, document: CatalogDocument, source: ArsenalCaptureSource,
  origin: 'person' | 'ai', keepValues: boolean): ArsenalCaptureResult {
  try {
    return runtime.capture.capture({ document, source, origin, tableValues: keepValues ? 'generic-values' : 'structure-only' });
  } catch (error) {
    return { ok: false, error: { code: 'INVALID_PAYLOAD', details: error instanceof Error ? error.message : String(error) } };
  }
}

/**
 * "Guardar no arsenal": a short form — a suggested name, the category, optional tags — with the picture of what will
 * be saved. A table goes WITHOUT its values by default (structure and style only; the values come from the PDF);
 * keeping them is an explicit choice for generic content. Nothing here calls the AI.
 */
export function ArsenalSaveDialog({ runtime, document, request, assetUrls, returnFocus, onClose, onSaved }: ArsenalSaveDialogProps) {
  const titleId = React.useId();
  const fieldId = React.useId();
  const origin = request.origin ?? 'person';
  const [what, setWhat] = React.useState<What>('content');
  const [keepValues, setKeepValues] = React.useState(false);
  const [name, setName] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState<ArsenalCategory | null>(null);
  const [tagsText, setTagsText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const attempt = React.useRef<{ key: string; presetId: string; mutationId: string } | null>(null);
  const alive = React.useRef(true);
  // Set again on every mount: StrictMode (dev) unmounts and remounts once, and a flag left false would keep the
  // dialog on "Guardando…" forever after a successful save.
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const source: ArsenalCaptureSource = what === 'style' && request.styleObjectId
    ? { kind: 'style', objectId: request.styleObjectId }
    : request.source;
  const captured = React.useMemo(() => captureSafely(runtime, document, source, origin, keepValues),
    // `source` is rebuilt every render from `what` and the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime, document, what, request, origin, keepValues]);
  const content = captured.ok ? captured.content : null;
  const allowed = content ? ARSENAL_KIND_CATEGORIES[content.kind] : [];
  const defaultCategory = content
    ? (request.suggestedCategory && allowed.includes(request.suggestedCategory) ? request.suggestedCategory : content.suggestedCategory)
    : null;
  const shownCategory = category && allowed.includes(category) ? category : defaultCategory;
  const suggestedName = (what === 'content' ? request.suggestedName : undefined) ?? content?.suggestedName ?? '';
  const shownName = name ?? suggestedName.slice(0, ARSENAL_LIMITS.nameMaxChars);
  const cleanName = shownName.replace(/\s+/g, ' ').trim();
  const tags = parseArsenalTags(tagsText);
  const tagProblem = tags.length > ARSENAL_LIMITS.tagsMax ? `Use até ${ARSENAL_LIMITS.tagsMax} etiquetas.`
    : tags.some((tag) => tag.length > ARSENAL_LIMITS.tagMaxChars) ? `Cada etiqueta pode ter até ${ARSENAL_LIMITS.tagMaxChars} letras.`
      : null;
  const hasTables = content ? arsenalPayloadHasTables(content.payload) : false;
  const hiddenSkipped = captured.ok && captured.notes.some((note) => note.code === 'HIDDEN_OBJECTS_SKIPPED');
  const photoFrames = captured.ok ? captured.notes.filter((note) => note.code === 'IMAGE_PLACEHOLDER').flatMap((note) => note.objectIds).length : 0;
  const preview = React.useMemo(() => content && shownCategory
    ? previewPreset({ kind: content.kind, payload: content.payload, name: cleanName, category: shownCategory })
    : null,
  // The picture does not depend on the name: it is redrawn only when the content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [content, shownCategory]);
  const thumbnailDocument: PageThumbnailDocument = document;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !content || !shownCategory) return;
    if (!cleanName) { setProblem('Escreva um nome para o modelo.'); return; }
    if (tagProblem) { setProblem(tagProblem); return; }
    const draft: ArsenalPresetDraft = {
      kind: content.kind,
      origin: content.origin,
      name: cleanName,
      category: shownCategory,
      tags,
      synonyms: [],
      payloadSchemaVersion: ARSENAL_PAYLOAD_SCHEMA_VERSION,
      payload: content.payload,
    };
    const parsed = parseArsenalPresetDraft(draft);
    if (!parsed.ok) {
      setProblem(parsed.code === 'TOO_LARGE'
        ? arsenalRepositoryErrorMessage('TOO_LARGE', 'guardar')
        : 'O arsenal não aceitou este conteúdo. Nada foi guardado.');
      return;
    }
    // The same request after "não deu para confirmar" keeps its ids, so a retry never saves twice.
    const key = JSON.stringify(parsed.value);
    if (attempt.current?.key !== key) {
      attempt.current = { key, presetId: arsenalRandomId(runtime), mutationId: arsenalRandomId(runtime) };
    }
    setBusy(true);
    setProblem(null);
    try {
      const result = await runtime.repository.create({
        presetId: attempt.current.presetId, mutationId: attempt.current.mutationId, draft: parsed.value,
      });
      if (!alive.current) return;
      if (!result.ok) {
        if (result.error.code === 'DUPLICATE' || result.error.code === 'MUTATION_REUSE') attempt.current = null;
        setProblem(arsenalRepositoryErrorMessage(result.error.code, 'guardar'));
        return;
      }
      const where = ARSENAL_CATEGORY_LABELS[result.value.category];
      const values = hasTables && !keepValues ? ' A tabela foi sem valores.' : '';
      onSaved(result.value, `“${result.value.name}” guardado no arsenal, em ${where}. Toda a equipe já pode usar.${values}`);
    } catch {
      if (alive.current) setProblem(arsenalRepositoryErrorMessage('REMOTE_FAILURE', 'guardar'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <ArsenalModal titleId={titleId} descriptionId={`${fieldId}-intro`} title="Guardar no arsenal" phase={busy ? 'busy' : 'edit'}
      onClose={onClose} returnFocus={returnFocus} onSubmit={(event) => { void submit(event); }} className="vnext-arsenal-save">
      <p id={`${fieldId}-intro`} className="vnext-arsenal-dialog-intro">
        Fica guardado para toda a equipe usar em qualquer catálogo{origin === 'ai' ? '. A IA sugeriu; você confirma o nome e a categoria' : ''}.
      </p>
      {!content ? (
        <>
          <p className="vnext-arsenal-dialog-problem" role="alert" data-arsenal-capture-problem={captured.ok ? '' : captured.error.code}>
            {captured.ok ? '' : CAPTURE_PROBLEMS[captured.error.code] ?? CAPTURE_PROBLEMS.INVALID_PAYLOAD}
          </p>
          <div className="vnext-arsenal-dialog-actions">
            <button type="button" className="is-primary" onClick={onClose}>Fechar</button>
          </div>
        </>
      ) : (
        <div className="vnext-arsenal-save-body">
          <div className="vnext-arsenal-save-picture">
            {preview && <ArsenalPresetThumbnail preset={preview} document={thumbnailDocument} assetUrls={assetUrls} builder={runtime.previewBuilder} />}
          </div>
          <div className="vnext-arsenal-save-fields">
            {request.styleObjectId && (
              <fieldset className="vnext-arsenal-choice">
                <legend>O que guardar</legend>
                <label>
                  <input type="radio" name={`${fieldId}-what`} checked={what === 'content'} onChange={() => setWhat('content')} />
                  <span>{request.source.kind === 'table' ? 'A tabela (colunas, linhas e aparência)' : 'O conteúdo, como está na página'}</span>
                </label>
                <label>
                  <input type="radio" name={`${fieldId}-what`} checked={what === 'style'} onChange={() => setWhat('style')}
                    data-arsenal-save-what="style" />
                  <span>Só a aparência (cores, letras, bordas)</span>
                </label>
              </fieldset>
            )}
            <label className="vnext-arsenal-field">
              <span>Nome</span>
              <input autoFocus value={shownName} maxLength={ARSENAL_LIMITS.nameMaxChars} data-arsenal-save-name=""
                aria-invalid={!cleanName || undefined} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="vnext-arsenal-field">
              <span>Categoria</span>
              <select value={shownCategory ?? ''} data-arsenal-save-category="" disabled={allowed.length < 2}
                onChange={(event) => setCategory(event.target.value as ArsenalCategory)}>
                {allowed.map((entry) => <option key={entry} value={entry}>{ARSENAL_CATEGORY_LABELS[entry]}</option>)}
              </select>
            </label>
            <div className="vnext-arsenal-field">
              <label htmlFor={`${fieldId}-tags`}>Etiquetas (opcional)</label>
              <input id={`${fieldId}-tags`} value={tagsText} data-arsenal-save-tags="" aria-describedby={`${fieldId}-tags-help`}
                aria-invalid={tagProblem ? true : undefined} onChange={(event) => setTagsText(event.target.value)} />
              <small id={`${fieldId}-tags-help`}>Separe por vírgula. Ajudam a achar depois. Ex.: azul, PCON</small>
            </div>
            {hasTables && (
              <div className="vnext-arsenal-values" data-arsenal-table-values={keepValues ? 'generic-values' : 'structure-only'}>
                <p id={`${fieldId}-values`}>
                  {keepValues
                    ? 'Os textos das células vão junto. Use só para conteúdo genérico: medidas, códigos e faixas devem vir do PDF ou da planilha conferida.'
                    : 'A tabela vai sem valores: ficam as colunas, as linhas, o cabeçalho e a aparência. Os valores vêm do PDF ou da planilha conferida.'}
                </p>
                <label>
                  <input type="checkbox" checked={keepValues} data-arsenal-keep-values="" aria-describedby={`${fieldId}-values`}
                    onChange={(event) => setKeepValues(event.target.checked)} />
                  <span>Manter os valores (só conteúdo genérico, como “Fornecimento padrão”)</span>
                </label>
              </div>
            )}
            {(hiddenSkipped || photoFrames > 0) && (
              <ul className="vnext-arsenal-notes">
                {hiddenSkipped && <li>Objetos escondidos em Camadas não entram.</li>}
                {photoFrames > 0 && <li>{photoFrames === 1 ? 'Uma foto vai' : `${photoFrames} fotos vão`} como “Foto a escolher (A COMPLETAR)”.</li>}
              </ul>
            )}
            {problem && <p className="vnext-arsenal-dialog-problem" role="alert" data-arsenal-save-problem="">{problem}</p>}
            <div className="vnext-arsenal-dialog-actions">
              <button type="button" onClick={onClose}>Cancelar</button>
              <button type="submit" className="is-primary" data-arsenal-save-submit="" disabled={busy || !cleanName}>
                {busy ? 'Guardando…' : 'Guardar no arsenal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ArsenalModal>
  );
}
