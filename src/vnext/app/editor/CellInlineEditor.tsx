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

function readOnlyNote(draft: TableCellDraft, editable: boolean): string | null {
  if (draft.activeType === 'richText') {
    return editable ? null : 'Este texto tem formatação especial e não pode ser editado aqui.';
  }
  if (draft.activeType === 'technicalCode' || draft.activeType === 'measurement') {
    return 'Edite este valor no painel ao lado, em Avançado.';
  }
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
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pendingCaretRef = React.useRef<number | null>(null);
  const original = draft.originalContent;
  const editable = draft.activeType === 'richText'
    && (original.type !== 'richText' || projectEditableRichText(original.value) !== null);
  const note = readOnlyNote(draft, editable);
  const position = `linha ${cell.rowIndex + 1}, coluna ${cell.columnIndex + 1}`;

  // Like Excel: the caret starts at the end of what is already there (or of the key that started the edit).
  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  }, [editable]);

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
    const current = draftRef.current ?? draft;
    const next = insertIntoCellText(current.richText, textarea?.selectionStart, textarea?.selectionEnd, insert);
    pendingCaretRef.current = next.caret;
    onDraftChange(updateTableCellDraft(current, { richText: next.text }));
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
    if (command.type === 'newline') insertText('\n');
    else if (command.type === 'cancel') onCancel();
    else onCommit(command.move);
  };

  const widthPx = Math.max(cell.widthPx * zoom, MIN_EDITOR_WIDTH_PX);
  const heightPx = Math.max(cell.heightPx * zoom, MIN_EDITOR_HEIGHT_PX);
  const lines = Math.min(Math.max(draft.richText.split('\n').length, 1), MAX_VISIBLE_LINES);
  const keepCaret = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div
      className="vnext-cell-inline-editor"
      data-cell-inline-editor=""
      data-keyboard-isolated=""
      // Drawn at screen scale inside the zoomed page: every size below is in screen px.
      style={{ zoom: unzoom }}
    >
      <div className="vnext-cell-inline-toolbar" role="toolbar" aria-label="Símbolos técnicos e ações da célula">
        {editable && CELL_TECHNICAL_SYMBOLS.map((symbol) => (
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
        <span className="vnext-cell-inline-toolbar-gap" aria-hidden="true" />
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
      {editable ? (
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
          data-cell-rich-text=""
          aria-label={`Conteúdo da célula, ${position}`}
          aria-describedby="vnext-cell-inline-help"
          rows={lines}
          spellCheck={false}
          value={draft.richText}
          style={{ width: widthPx, minHeight: heightPx }}
          onChange={(event) => onDraftChange(updateTableCellDraft(draftRef.current ?? draft, {
            richText: event.target.value.replace(/\r\n?/g, '\n'),
          }))}
          onKeyDown={onKeyDown}
          onCompositionStart={() => onDraftChange(setTableCellDraftComposition(draftRef.current ?? draft, true))}
          onCompositionEnd={() => onDraftChange(setTableCellDraftComposition(draftRef.current ?? draft, false))}
        />
      ) : (
        <p className="vnext-cell-inline-note" role="note" style={{ width: widthPx, minHeight: heightPx }}>{note}</p>
      )}
      {editable && (
        <p id="vnext-cell-inline-help" className="vnext-cell-inline-help">
          Enter salva e desce · Tab vai para a direita · Alt+Enter quebra a linha · Esc cancela
        </p>
      )}
    </div>
  );
}
