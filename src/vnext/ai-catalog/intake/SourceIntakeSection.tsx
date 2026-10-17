import React from 'react';
import type { DocumentSession } from '../../application';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import { ColumnChooser } from './ColumnChooser';
import { tableBlocks } from './intake-model';
import { SourceDropZone } from './SourceDropZone';
import { SourceFileList } from './SourceFileList';
import { SourceReviewPanel, sourceTableName } from './SourceReviewPanel';
import { useSourceIntake, type SourceIntakeDependencies } from './useSourceIntake';
import { useSourceTableInsertion } from './useSourceTableInsertion';
import './intake.css';

export interface SourceIntakeSectionProps {
  readonly session: DocumentSession;
  /** The editor's current measurement of the catalog, so a long table can continue on the next pages (FR-35). */
  readonly measurement?: FitHeightMeasurement | null;
  readonly activePageId?: string;
  readonly onBeforeMutation?: () => boolean;
  /** Shows the inserted table in the editor. */
  readonly onShowTable?: (pageId: string, objectId: string) => void;
  /** Tests only: a slower or counting reader. */
  readonly intakeDependencies?: SourceIntakeDependencies;
}

/**
 * FR-64 in the assistant: the drop zone, one line per file with its state, "O que encontrei" grouped by file and
 * "Escolher colunas" → "Inserir como tabela". The files stay in this browser; nothing is sent to the AI here.
 */
export function SourceIntakeSection({ session, measurement, activePageId, onBeforeMutation, onShowTable, intakeDependencies }: SourceIntakeSectionProps) {
  const locale = session.getSnapshot().document.locale;
  const intake = useSourceIntake({ locale, ...intakeDependencies });
  const insertion = useSourceTableInsertion({ session, measurement, activePageId, onBeforeMutation, onShowTable });
  const [choosing, setChoosing] = React.useState<{ entryId: string; blockId: string } | null>(null);
  const working = insertion.phase !== 'idle';
  const chosenEntry = choosing ? intake.entries.find((entry) => entry.id === choosing.entryId) : undefined;
  const chosenBlock = choosing && chosenEntry?.state !== 'reading'
    ? tableBlocks(chosenEntry?.intake).find((block) => block.id === choosing.blockId) : undefined;
  // A file taken out of the list (or read again) closes its column choice.
  React.useEffect(() => {
    if (choosing && !chosenBlock) setChoosing(null);
  }, [choosing, chosenBlock]);
  // Closing the column choice puts the keyboard back where the person continues: on the message after
  // "Inserir como tabela", or on the button that opened the choice after "Voltar" (or on the drop zone).
  const section = React.useRef<HTMLElement>(null);
  const noticeRef = React.useRef<HTMLParagraphElement>(null);
  const lastChoice = React.useRef<string | null>(null);
  const focusNotice = React.useRef(false);
  React.useEffect(() => {
    if (chosenBlock) { lastChoice.current = chosenBlock.id; return; }
    const blockId = lastChoice.current;
    if (!blockId) return;
    lastChoice.current = null;
    const root = section.current;
    if (focusNotice.current && noticeRef.current) {
      focusNotice.current = false;
      noticeRef.current.focus();
      return;
    }
    (root?.querySelector<HTMLElement>(`[data-choose-columns="${CSS.escape(blockId)}"]:not(:disabled)`) ??
      root?.querySelector<HTMLElement>('.ai-intake-drop-button'))?.focus();
  }, [chosenBlock]);
  const notice = insertion.notice;
  // The message sits at the top of this panel; bring it into view whenever it changes.
  React.useEffect(() => { noticeRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [notice]);
  return (
    <section ref={section} className="ai-intake" aria-label="Arquivos para o catálogo" data-source-intake=""
      data-has-files={intake.entries.length > 0 ? 'true' : undefined} data-choosing={chosenBlock ? 'true' : undefined}>
      {notice && (
        <p ref={noticeRef} tabIndex={-1} className="ai-intake-notice" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      <SourceDropZone compact={intake.entries.length > 0} disabled={working}
        onFiles={(files) => { insertion.dismissNotice(); intake.addFiles(files); }} />
      <SourceFileList entries={intake.entries}
        onRemove={(id) => { if (choosing?.entryId === id) setChoosing(null); intake.remove(id); }} />
      {chosenBlock
        ? <ColumnChooser key={chosenBlock.id} block={chosenBlock} name={sourceTableName(chosenBlock)} busy={working}
          onCancel={() => setChoosing(null)}
          onInsert={(choice) => { if (insertion.insert(choice)) { focusNotice.current = true; setChoosing(null); } }} />
        : <SourceReviewPanel entries={intake.entries} disabled={working}
          onChooseColumns={(entryId, blockId) => { insertion.dismissNotice(); setChoosing({ entryId, blockId }); }}
          onReread={(entryId, options) => { insertion.dismissNotice(); intake.reread(entryId, options); }} />}
    </section>
  );
}
