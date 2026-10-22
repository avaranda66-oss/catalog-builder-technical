import React from 'react';
import { findObjectInTree, type CatalogDocument } from '../../domain';
import type { DraftCellTarget } from '../draft-compiler';
import { ChatCard } from '../chat/ChatCard';
import { pageListText } from '../intake/intake-model';
import { PendingFactsPanel } from '../PendingFactsPanel';
import { draftPreview } from './draft-preview';
import { compileSpecTable, type SpecTableController, type SpecTableFile, type SpecTableRead } from './useSpecTableDraft';
import './spec-table.css';

interface Props {
  readonly controller: SpecTableController;
  readonly document: CatalogDocument;
  readonly activePageId?: string;
  /** "Mostrar na tabela" in the pending list after the table went in. */
  readonly onShowTable?: (pageId: string, objectId: string) => void;
  readonly previewRef?: React.Ref<HTMLDivElement>;
}

const pageRange = (first: number, last: number) => pageListText(Array.from({ length: last - first + 1 }, (_, index) => first + index));
/** "a página 9" / "as páginas 9 e 10". */
const pagesWord = (first: number, last: number) => first === last ? `a página ${first}` : `as páginas ${pageRange(first, last)}`;
/** "na página 9" / "nas páginas 9 e 10". */
const inPages = (first: number, last: number) => first === last ? `na página ${first}` : `nas páginas ${pageRange(first, last)}`;
export const SEND_NOTICE = 'Ao clicar em “Ler estas páginas”, o PDF vai para o servidor da empresa e para a IA do Google, '
  + 'que lê só as páginas escolhidas. Cada valor volta conferido com o texto do próprio PDF; o que não bater fica em branco para você.';

function Bubble({ children, role }: { readonly children: React.ReactNode; readonly role?: 'status' | 'alert' }) {
  return <div className="ai-chat-msg ai-chat-assistant"><div className="ai-chat-bubble" role={role}>{children}</div></div>;
}
function Typing({ text, onCancel }: { readonly text: string; readonly onCancel?: () => void }) {
  return <div className="ai-chat-msg ai-chat-assistant">
    <div className="ai-chat-bubble">
      <p className="ai-chat-typing" role="status"><span className="ai-chat-dots" aria-hidden="true"><i /><i /><i /></span>{text}</p>
      {onCancel && <button type="button" className="ai-chat-link" onClick={onCancel}>Cancelar</button>}
    </div>
  </div>;
}

function PageChoice({ file, onChange }: { readonly file: SpecTableFile; readonly onChange: (first: number, last: number) => void }) {
  const number = (text: string) => (/^\d{1,4}$/u.test(text.trim()) ? Number(text) : Number.NaN);
  return <fieldset className="ai-spec-pages" data-spec-file={file.fileName}>
    <legend>{`${file.fileName} (${file.pdf.pageCount} ${file.pdf.pageCount === 1 ? 'página' : 'páginas'})`}</legend>
    <p className="ai-spec-guess">{file.guess.found
      ? `Achei especificações ${inPages(file.guess.firstPage, file.guess.lastPage)}. Se não for, mude abaixo.`
      : 'Não achei sozinho a página das especificações. Diga quais páginas ler.'}</p>
    <label>Da página <input type="number" inputMode="numeric" min={1} max={file.pdf.pageCount} value={Number.isNaN(file.firstPage) ? '' : file.firstPage}
      onChange={(event) => onChange(number(event.target.value), file.lastPage)} /></label>
    <label>até a página <input type="number" inputMode="numeric" min={1} max={file.pdf.pageCount} value={Number.isNaN(file.lastPage) ? '' : file.lastPage}
      onChange={(event) => onChange(file.firstPage, number(event.target.value))} /></label>
  </fieldset>;
}

function ReadSummaries({ reads }: { readonly reads: readonly SpecTableRead[] }) {
  return <>{reads.map((item) => item.review
    ? <Bubble key={item.fileName}>
      <p>{item.review.summary}</p>
      {item.review.pages.filter(page => !page.values).length > 0 && <ul className="ai-spec-page-notes">
        {item.review.pages.filter(page => !page.values).map(page => <li key={page.page}>{`Página ${page.page}: ${page.message}`}</li>)}
      </ul>}
    </Bubble>
    : <Bubble key={item.fileName} role="alert"><p>{`Não consegui ler ${item.fileName}. ${item.error ?? ''}`}</p></Bubble>)}</>;
}

/** The J2-lite messages and cards of the conversation, in order. */
export function SpecTableMessages({ controller, document, activePageId, onShowTable, previewRef }: Props) {
  const { flow } = controller;
  const stage = flow?.stage;
  const set = stage?.kind === 'review' ? stage.set : undefined;
  const compiled = React.useMemo(() => set ? compileSpecTable(set, document, activePageId) : undefined, [set, document, activePageId]);
  if (!flow || !stage) return null;

  if (stage.kind === 'checking') return <Typing text="Verificando se a leitura de PDFs pela IA está disponível…" />;
  if (stage.kind === 'blocked') {
    return <div className="ai-chat-msg ai-chat-system" role="alert" data-spec-table="blocked">
      <p>{stage.message}</p>
      <button type="button" className="ai-chat-link" onClick={controller.retry}>Tentar de novo</button>
      <button type="button" className="ai-chat-link" onClick={controller.discard}>Fechar</button>
    </div>;
  }
  if (stage.kind === 'pages') {
    return <ChatCard label="Páginas do PDF para a IA ler" title="Quais páginas têm as especificações?"
      actions={<>
        <button type="button" className="vnext-btn-primary" onClick={() => { void controller.read(); }}>Ler estas páginas</button>
        <button type="button" onClick={controller.cancel}>Cancelar</button>
      </>}>
      <div data-spec-table="pages">
        {stage.files.map(file => <PageChoice key={file.entryId} file={file}
          onChange={(first, last) => controller.setPages(file.entryId, first, last)} />)}
        <p className="ai-chat-note">{SEND_NOTICE}</p>
        {stage.problem && <p className="ai-spec-problem" role="alert">{stage.problem}</p>}
      </div>
    </ChatCard>;
  }
  if (stage.kind === 'reading') {
    const [file] = stage.files;
    const text = stage.files.length === 1 && file
      ? `A IA está lendo ${pagesWord(file.firstPage, file.lastPage)} de ${file.fileName}… Pode levar até 1 minuto.`
      : `A IA está lendo ${stage.files.length} PDFs… Pode levar até 1 minuto por arquivo.`;
    return <Typing text={text} onCancel={controller.cancel} />;
  }
  if (stage.kind === 'failed') {
    return <div className="ai-chat-msg ai-chat-system" role="alert" data-spec-table="failed">
      <p>{stage.message}</p>
      <button type="button" className="ai-chat-link" onClick={() => { void controller.read(); }}>Tentar de novo</button>
      <button type="button" className="ai-chat-link" onClick={controller.choosePages}>Escolher outras páginas</button>
    </div>;
  }

  if (stage.kind === 'applied') {
    const exists = (target: DraftCellTarget) => Boolean(findObjectInTree(document, target.objectId));
    const cells = new Map([...stage.applied.cells].filter(([, target]) => exists(target)));
    return <>
      <ReadSummaries reads={stage.reads} />
      <ChatCard label="Pendências da tabela inserida" title="O que ficou para conferir"
        actions={<button type="button" onClick={controller.discard}>Fechar</button>}>
        <PendingFactsPanel factSet={stage.set} onChange={() => undefined} readOnly cells={cells}
          onSelectCell={(target) => onShowTable?.(target.pageId, target.objectId)} />
      </ChatCard>
    </>;
  }

  // review
  const preview = compiled?.ok ? draftPreview(compiled.draft) : undefined;
  const anchor = compiled?.ok ? document.pages.findIndex(page => page.id === compiled.draft.anchorPageId) + 1 : 0;
  const where = !compiled?.ok ? '' : compiled.draft.onPageId
    ? `Ela entra na página ${anchor}, que está vazia.`
    : `Ela entra numa página nova, depois da página ${anchor}.`;
  return <>
    <ReadSummaries reads={stage.reads} />
    <ChatCard label="Pendências antes de inserir" title="Confira antes de inserir" actions={null}>
      <PendingFactsPanel factSet={stage.set} onChange={controller.choose} />
    </ChatCard>
    <ChatCard label="Prévia da tabela de especificações" title="Prévia da tabela" cardRef={previewRef}
      actions={<>
        <button type="button" className="vnext-btn-primary" disabled={!compiled?.ok} onClick={controller.apply}>Aplicar</button>
        <button type="button" onClick={controller.choosePages}>Escolher outras páginas</button>
        <button type="button" onClick={controller.discard}>Descartar</button>
      </>}>
      {preview && compiled?.ok ? <div data-spec-table="preview">
        <p>{`${preview.filled} ${preview.filled === 1 ? 'valor conferido' : 'valores conferidos'} no PDF ${preview.filled === 1 ? 'entra' : 'entram'} na tabela.`
          + (preview.blank ? ` ${preview.blank} ${preview.blank === 1 ? 'fica' : 'ficam'} em branco para você conferir.` : '')}</p>
        <p className="ai-chat-note">{where}{compiled.draft.parts > 1 ? ` A tabela é longa e continua em ${compiled.draft.parts} páginas.` : ''}</p>
        {preview.parts.map(part => <div key={part.part} className="ai-spec-preview-wrap">
          <table className="ai-spec-preview">
            <caption>{part.title || 'Continuação'}</caption>
            <tbody>{part.rows.map((row, rowIndex) => <tr key={rowIndex} data-row-role={row.role}>
              {row.cells.map((cell, cellIndex) => {
                const Tag = row.role === 'header' ? 'th' : 'td';
                const empty = cell.state && cell.state !== 'verified' && cell.state !== 'chosen';
                return <Tag key={cellIndex} data-cell-state={cell.state}>
                  {empty ? <span className="ai-spec-blank">em branco</span> : cell.text}
                </Tag>;
              })}
            </tr>)}</tbody>
          </table>
          {part.notes.length > 0 && <ul className="ai-spec-notes">{part.notes.map(note => <li key={note}>{note}</li>)}</ul>}
        </div>)}
        <p className="ai-chat-note">Ao aplicar, tudo entra de uma vez; um Desfazer tira a tabela inteira.</p>
      </div> : <p role="alert">{compiled && !compiled.ok ? compiled.message : ''}</p>}
      {stage.problem && <p className="ai-spec-problem" role="alert">{stage.problem}</p>}
    </ChatCard>
  </>;
}
