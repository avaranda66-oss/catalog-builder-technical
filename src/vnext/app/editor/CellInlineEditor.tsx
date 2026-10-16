import React from 'react';
import { Check, X } from 'lucide-react';
import { projectEditableRichText } from '../../application';
import { resolveCellEditorKey, type CellEditorMove } from '../../editor/editor-keyboard';
import {
  CELL_TECHNICAL_SYMBOLS,
  insertIntoCellText,
  setTableCellDraftComposition,
  updateTableCellDraft,
  type TableCellDraft,
} from '../../editor/table-cell-draft';
import { useStageZoom } from './use-stage-zoom';
import './CellInlineEditor.css';

/** Size of the cell being edited, in page CSS px (before the page zoom). */
export interface CellInlineEditorCell {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

export interface CellInlineEditorProps {
  readonly draft: TableCellDraft;
  /** Always the latest draft, so IME composition ends on the newest value. */
  readonly draftRef: React.MutableRefObject<TableCellDraft | null>;
  /** The field that receives focus when the edit starts (shared with the side panel). */
  readonly fieldRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>;
  readonly cell: CellInlineEditorCell;
  onDraftChange(next: TableCellDraft): void;
  /** Saves the cell; `move` says where the selection goes next (none = stay). */
  onCommit(move?: CellEditorMove): unknown;
  /** Forgets only what was typed in this edit. */
  onCancel(): unknown;
}

/** Smallest editor on screen, so even a narrow column at a small zoom can be read and typed in. */
const MIN_EDITOR_WIDTH_PX = 220;
const MIN_EDITOR_HEIGHT_PX = 40;
const MAX_VISIBLE_LINES = 8;
const HELP_ID = 'vnext-cell-inline-help';

/** The one value typed in the cell: the text, a technical code or the number of a measurement. */
interface InlineField {
  readonly kind: 'richText' | 'technicalCode' | 'measurement';
  readonly value: string;
  /** Only text keeps line breaks (Alt+Enter) and offers the technical symbols. */
  readonly multiline: boolean;
  readonly label: string;
  readonly help: string;
  update(draft: TableCellDraft, value: string): TableCellDraft;
}

function inlineField(draft: TableCellDraft): InlineField | null {
  const original = draft.originalContent;
  if (original.type === 'marker' || original.type === 'image') return null;
  if (draft.activeType === 'richText') {
    if (original.type === 'richText' && projectEditableRichText(original.value) === null) return null;
    return {
      kind: 'richText',
      value: draft.richText,
      multiline: true,
      label: 'Conteúdo da célula',
      help: 'Enter salva e desce · Tab vai para a direita · Alt+Enter quebra a linha · Esc cancela',
      update: (current, value) => updateTableCellDraft(current, { richText: value.replace(/\r\n?/g, '\n') }),
    };
  }
  if (draft.activeType === 'technicalCode') {
    return {
      kind: 'technicalCode',
      value: draft.technicalCode,
      multiline: false,
      label: 'Código técnico da célula',
      help: 'Enter salva e desce · Tab vai para a direita · Esc cancela',
      update: (current, value) => updateTableCellDraft(current, { technicalCode: value.replace(/[\r\n]+/g, '') }),
    };
  }
  if (draft.activeType === 'measurement') {
    const unit = draft.measurement.unit.trim();
    return {
      kind: 'measurement',
      value: draft.measurement.valueText,
      multiline: false,
      label: 'Valor da medição da célula',
      help: `${unit ? `Unidade: ${unit}. ` : ''}Para mudar a unidade, use Avançado no painel ao lado. Enter salva e desce · Esc cancela`,
      update: (current, value) => updateTableCellDraft(current, { measurement: { valueText: value.replace(/[\r\n]+/g, '') } }),
    };
  }
  return null;
}

function readOnlyNote(draft: TableCellDraft): string {
  if (draft.activeType === 'richText') return 'Este texto tem formatação especial e não pode ser editado aqui.';
  if (draft.activeType === 'empty') return 'A célula ficará vazia. Para confirmar, clique em ✓.';
  return 'Este conteúdo não é editado aqui. Veja o painel ao lado.';
}

/**
 * FR-30 — edits a table cell inside the cell itself, like Excel.
 *
 * It sits over the cell being edited (the grid gives the cell position from the page tracks) but is drawn at screen
 * scale, consuming `useStageZoom()`: whatever the page zoom, the text is 16 px and the editor is at least as wide as
 * the cell on screen. Keys: Enter saves and goes down, Tab saves and goes right, Alt+Enter breaks the line, Esc
 * cancels. The draft, saving and cancelling stay in the editor workspace (the same draft as the side panel).
 */
export function CellInlineEditor({ draft, draftRef, fieldRef, cell, onDraftChange, onCommit, onCancel }: CellInlineEditorProps) {
  const { zoom, unzoom } = useStageZoom();
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [alignEnd, setAlignEnd] = React.useState(false);
  const pendingCaretRef = React.useRef<number | null>(null);
  const original = draft.originalContent;
  const field = inlineField(draft);
  const position = `linha ${cell.rowIndex + 1}, coluna ${cell.columnIndex + 1}`;
  const latest = () => draftRef.current ?? draft;

  // Like Excel: the caret starts at the end of what is already there (or of the key that started the edit).
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [field?.kind]);

  // A cell below (or beside) the visible part of the page scrolls into view, symbols and help included.
  React.useLayoutEffect(() => {
    editorRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [cell.rowIndex, cell.columnIndex]);

  // A cell on the right half of the page opens the editor towards the left, so it never runs off the screen.
  React.useLayoutEffect(() => {
    const anchor = editorRef.current?.parentElement;
    const stage = anchor?.closest('[data-vnext-page-stage]');
    if (!anchor || !stage) return;
    const cellBox = anchor.getBoundingClientRect();
    const pageBox = stage.getBoundingClientRect();
    setAlignEnd(pageBox.width > 0 && cellBox.left + cellBox.width / 2 > pageBox.left + pageBox.width / 2);
  }, [cell.rowIndex, cell.columnIndex, zoom]);

  React.useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    const textarea = textareaRef.current;
    if (caret === null || !textarea) return;
    pendingCaretRef.current = null;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(caret, caret);
  });

  const insertText = (insert: string) => {
    const textarea = textareaRef.current;
    const current = latest();
    const currentField = inlineField(current);
    if (!currentField) return;
    const next = insertIntoCellText(currentField.value, textarea?.selectionStart, textarea?.selectionEnd, insert);
    pendingCaretRef.current = next.caret;
    onDraftChange(currentField.update(current, next.text));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const command = resolveCellEditorKey({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
    }, { composing: draftRef.current?.composing });
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    if (command.type === 'newline') {
      if (field?.multiline) insertText('\n');
    } else if (command.type === 'cancel') onCancel();
    else onCommit(command.move);
  };

  const widthPx = Math.max(cell.widthPx * zoom, MIN_EDITOR_WIDTH_PX);
  const heightPx = Math.max(cell.heightPx * zoom, MIN_EDITOR_HEIGHT_PX);
  const lines = field?.multiline ? Math.min(Math.max(field.value.split('\n').length, 1), MAX_VISIBLE_LINES) : 1;
  const keepCaret = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      ref={editorRef}
      className={'vnext-cell-inline-editor' + (alignEnd ? ' is-align-end' : '')}
      data-cell-inline-editor=""
      data-keyboard-isolated=""
      // Drawn at screen scale inside the zoomed page: every size below is in screen px.
      style={{ zoom: unzoom }}
    >
      <div className="vnext-cell-inline-toolbar" role="toolbar" aria-label="Símbolos técnicos e ações da célula">
        {field?.multiline && CELL_TECHNICAL_SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            data-cell-symbol={symbol}
            aria-label={`Inserir ${symbol}`}
            // Keeps the caret in the cell: the symbol goes where the person was typing.
            onMouseDown={keepCaret}
            onClick={() => insertText(symbol)}
          >
            {symbol}
          </button>
        ))}
        {field?.multiline && <span className="vnext-cell-inline-toolbar-gap" aria-hidden="true" />}
        <button type="button" className="is-icon" aria-label="Salvar esta célula" title="Salvar (Enter)"
          disabled={original.type === 'marker' || original.type === 'image'}
          onMouseDown={keepCaret} onClick={() => onCommit()}>
          <Check size={16} aria-hidden="true" />
        </button>
        <button type="button" className="is-icon" aria-label="Cancelar esta edição" title="Cancelar (Esc)"
          onMouseDown={keepCaret} onClick={() => onCancel()}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {field ? (
        <textarea
          ref={(node) => {
            if (node) {
              textareaRef.current = node;
              fieldRef.current = node;
              return;
            }
            if (fieldRef.current === textareaRef.current) fieldRef.current = null;
            textareaRef.current = null;
          }}
          data-cell-rich-text={field.kind === 'richText' ? '' : undefined}
          data-cell-inline-field={field.kind}
          aria-label={`${field.label}, ${position}`}
          aria-describedby={HELP_ID}
          rows={lines}
          spellCheck={false}
          value={field.value}
          className={field.multiline ? undefined : 'is-single-line'}
          style={{ width: widthPx, minHeight: heightPx }}
          onChange={(event) => onDraftChange(field.update(latest(), event.target.value))}
          onKeyDown={onKeyDown}
          onCompositionStart={() => onDraftChange(setTableCellDraftComposition(latest(), true))}
          onCompositionEnd={() => onDraftChange(setTableCellDraftComposition(latest(), false))}
        />
      ) : (
        <p className="vnext-cell-inline-note" role="note" style={{ width: widthPx, minHeight: heightPx }}>{readOnlyNote(draft)}</p>
      )}
      {field && <p id={HELP_ID} className="vnext-cell-inline-help">{field.help}</p>}
    </div>
  );
}
