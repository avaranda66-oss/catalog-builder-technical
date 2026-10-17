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

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/**
 * FR-35: shown only while the selected table does not fit on its page. One button takes the rows that do not fit to
 * new pages right after this one, with the header repeated; one Desfazer undoes it. When it cannot help yet (a row
 * taller than a page, a locked table…), the reason is written under the button.
 */
export function TableContinuationSection({ session, document, measurement, prepare, onMessage, tableObject }: TableContinuationSectionProps) {
  const planning = React.useMemo(
    () => planTableSplit(document, tableObject.id, measurement),
    [document, measurement, tableObject.id]
  );
  const [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  if (!planning.ok && !planning.overflows) return null;
  const headingId = `table-continuation-heading-${tableObject.id}`;
  const reasonId = `table-continuation-reason-${tableObject.id}`;

  const run = () => {
    if (busy || !prepare()) return;
    setBusy(true);
    // A long table takes a moment: let the button show the work before the catalog changes.
    globalThis.setTimeout(() => {
      const current = session.getSnapshot().document;
      const prepared = prepareTableSplit(current, tableObject.id, current === document ? measurement : null);
      const outcome = prepared.ok
        ? applyTableSplit(session, prepared.prepared, createTransactionId())
        : { ok: false as const, message: tableSplitClickMessage(prepared) };
      if (mounted.current) setBusy(false);
      onMessage(outcome.ok ? successNotice(outcome.message) : outcome.message);
    }, 0);
  };

  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-table-continuation" data-table-continuation="" aria-labelledby={headingId} aria-busy={busy || undefined}>
        <h3 id={headingId}>Tabela maior que a página</h3>
        <p>
          {planning.ok
            ? `Esta tabela não cabe inteira nesta página. As linhas que sobram vão para ${newPagesText(planning.plan.newPages)}, logo depois desta, com o cabeçalho repetido.`
            : 'Esta tabela não cabe inteira nesta página.'}
        </p>
        <button
          type="button"
          className="vnext-inspector-action"
          data-editor-action="continue-table-next-page"
          disabled={!planning.ok || busy}
          aria-describedby={planning.ok ? undefined : reasonId}
          onClick={run}
        >
          {TABLE_SPLIT_ACTION_LABEL}
        </button>
        {busy && <p data-table-continuation-busy="">Levando as linhas para a próxima página…</p>}
        {!planning.ok && <p id={reasonId} className="vnext-table-continuation-reason" data-table-continuation-reason="">{planning.message}</p>}
      </section>
    </>
  );
}
