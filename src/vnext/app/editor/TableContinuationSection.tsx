import React from 'react';
import type { DocumentSession } from '../../application';
import type { CatalogDocument, TableObject } from '../../domain';
import { successNotice, type EditorNoticeInput } from '../../editor/editor-notices';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import {
  applyTableSplit,
  newPagesText,
  planTableSplit,
  prepareTableSplit,
  TABLE_SPLIT_ACTION_LABEL,
  tableSplitClickMessage,
} from '../../editor/table-split-authoring';
import './TableContinuationSection.css';

/** What the editor gives the table panel so "Continuar na próxima página" can run (FR-35). */
export interface TableContinuationControl {
  readonly session: DocumentSession;
  readonly document: CatalogDocument;
  /** The editor's current measurement of the page; the cut is measured, never guessed. */
  readonly measurement: FitHeightMeasurement | null;
  /** Finishes any open text or cell edit first; false leaves everything as it is. */
  readonly prepare: () => boolean;
  readonly onMessage: (message: EditorNoticeInput) => void;
}

export interface TableContinuationSectionProps extends TableContinuationControl {
  readonly tableObject: TableObject;
}

const SUMMARY_DOES_NOT_FIT = 'Esta tabela não cabe inteira nesta página.';
const UNDO_HINT = 'Se precisar, use Desfazer para voltar como estava.';
const BUSY_TEXT = 'Levando as linhas para a próxima página…';

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/**
 * Runs the callback once the browser has painted, so "Levando as linhas…" is on screen before the long work blocks
 * the page. A page in the background does not paint: then a timer runs it anyway.
 */
function afterNextPaint(callback: () => void): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    callback();
  };
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => { globalThis.setTimeout(once, 0); });
    globalThis.setTimeout(once, 250);
  } else {
    globalThis.setTimeout(once, 0);
  }
}

/** What the section showed the last time it knew the table does not fit, kept while the page is measured again. */
interface ShownSection {
  readonly tableId: string;
  readonly summary: string;
}

/**
 * FR-35: shown only while the selected table does not fit on its page. One button takes the rows that do not fit to
 * new pages right after this one, with the header repeated; one Desfazer undoes it. When it cannot help yet (a row
 * taller than a page, a locked table…), the reason is written under the button.
 *
 * After any edit the editor measures the page again, which takes a moment. Meanwhile the section stays where it is
 * (button off, "Medindo a tabela…"), so the controls below it do not jump under the mouse.
 */
export function TableContinuationSection({ session, document, measurement, prepare, onMessage, tableObject }: TableContinuationSectionProps) {
  const planning = React.useMemo(
    () => planTableSplit(document, tableObject.id, measurement),
    [document, measurement, tableObject.id]
  );
  const [busy, setBusy] = React.useState(false);
  const [shown, setShown] = React.useState<ShownSection | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const overflows = planning.ok || planning.overflows;
  const remeasuring = !planning.ok && (planning.reason === 'MEASURING' || planning.reason === 'UNSTABLE');
  const summary = planning.ok
    ? `${SUMMARY_DOES_NOT_FIT} As linhas que sobram vão para ${newPagesText(planning.plan.newPages)}, logo depois desta${
      planning.plan.pagination.slices[0].headerRowIds.length > 0 ? ', com o cabeçalho repetido' : ''}.`
    : SUMMARY_DOES_NOT_FIT;
  // Kept for the same table only; a table that fits (or another table) clears it.
  const nextShown: ShownSection | null = overflows
    ? { tableId: tableObject.id, summary }
    : remeasuring && shown?.tableId === tableObject.id ? shown : null;
  if (nextShown?.tableId !== shown?.tableId || nextShown?.summary !== shown?.summary) setShown(nextShown);

  if (!nextShown) return null;
  const headingId = `table-continuation-heading-${tableObject.id}`;
  const noteId = `table-continuation-note-${tableObject.id}`;

  const run = () => {
    if (busy || !planning.ok || !prepare()) return;
    setBusy(true);
    // A long table takes a moment: let the panel show the work before the catalog changes.
    afterNextPaint(() => {
      const current = session.getSnapshot().document;
      const prepared = prepareTableSplit(current, tableObject.id, current === document ? measurement : null);
      const outcome = prepared.ok
        ? applyTableSplit(session, prepared.prepared, createTransactionId())
        : { ok: false as const, message: tableSplitClickMessage(prepared) };
      if (mounted.current) {
        setBusy(false);
        // Done: the section goes away now instead of waiting for the new measurement.
        if (outcome.ok) setShown(null);
      }
      onMessage(outcome.ok ? successNotice(outcome.message) : outcome.message);
      // The keyboard stays on the table that was cut.
      if (outcome.ok) globalThis.document.querySelector<HTMLElement>(`[data-editor-object-id="${CSS.escape(tableObject.id)}"]`)?.focus();
    });
  };

  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-table-continuation" data-table-continuation="" aria-labelledby={headingId} aria-busy={busy || undefined}>
        <h3 id={headingId}>Tabela maior que a página</h3>
        <p>{nextShown.summary}</p>
        <button
          type="button"
          className="vnext-inspector-action"
          data-editor-action="continue-table-next-page"
          disabled={!planning.ok}
          aria-disabled={busy || undefined}
          aria-describedby={noteId}
          onClick={run}
        >
          {TABLE_SPLIT_ACTION_LABEL}
        </button>
        {/* One line under the button, always there: the undo hint, or why the button is off. */}
        <p id={noteId} className="vnext-table-continuation-reason"
          data-table-continuation-reason={planning.ok ? undefined : ''} data-table-continuation-hint={planning.ok ? '' : undefined}>
          {planning.ok ? UNDO_HINT : planning.message}
        </p>
        <p role="status" className="vnext-table-continuation-status" data-table-continuation-busy={busy ? '' : undefined}>
          {busy ? BUSY_TEXT : ''}
        </p>
      </section>
    </>
  );
}
