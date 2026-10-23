import React from 'react';
import type { DocumentSession } from '../../application';
import { footerLanguageCode, PAGE_FOOTER_LIMITS, pageFooterTexts, type PageFooter } from '../../domain';
import { applyNativeAction } from '../../editor/native-element-authoring';
import {
  cleanPageFooter, DEFAULT_PAGE_FOOTER, normalizeFooterField, pageFooterAction, replaceTypedPageNumbers, todayIsoDate,
  typedPageNumbers, type TypedPageNumber,
} from '../../editor/page-footer-authoring';
import './NativeStyleSection.css';
import './PageFooterSection.css';

export interface PageFooterSectionProps {
  /** The page on screen: the preview says what this page prints. */
  pageId: string;
  session: DocumentSession;
  prepare(): boolean;
  onMessage(message: string): void;
}

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

const CHANGED = 'Rodapé alterado em todas as páginas. Para voltar, use Desfazer.';

/**
 * Onda 4 (FR-55, S21): "Rodapé de todas as páginas", shown with the page settings when nothing is selected. Code,
 * revision and date are typed once and printed on every page, with the language and "Página x de y" filled in by
 * the app. Typed page numbers left from before can be swapped for the automatic one after a preview, in one undo step.
 */
export function PageFooterSection({ pageId, session, prepare, onMessage }: PageFooterSectionProps): React.ReactElement | null {
  const { document } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const footer = document.style.pageFooter;
  const pageIndex = document.pages.findIndex((page) => page.id === pageId);
  const [code, setCode] = React.useState(footer?.documentCode ?? '');
  const [revision, setRevision] = React.useState(footer?.revision ?? '');
  const [date, setDate] = React.useState(footer?.issuedOn ?? '');
  const [review, setReview] = React.useState<readonly TypedPageNumber[] | null>(null);
  React.useEffect(() => setCode(footer?.documentCode ?? ''), [footer?.documentCode]);
  React.useEffect(() => setRevision(footer?.revision ?? ''), [footer?.revision]);
  React.useEffect(() => setDate(footer?.issuedOn ?? ''), [footer?.issuedOn]);
  const typed = React.useMemo(() => typedPageNumbers(document, footer ?? DEFAULT_PAGE_FOOTER), [document, footer]);
  React.useEffect(() => setReview(null), [document]);
  if (pageIndex < 0) return null;

  const apply = (next: PageFooter | null, message: string): void => {
    if (!prepare()) return;
    const outcome = applyNativeAction(session, pageFooterAction(session.getSnapshot().document, next), createTransactionId());
    onMessage(outcome.ok ? message : outcome.message);
  };
  const patch = (changes: Partial<PageFooter>): void => {
    const latest = session.getSnapshot().document.style.pageFooter;
    if (!latest) return;
    const next = cleanPageFooter({ ...latest, ...changes });
    if (!next) { onMessage('Data inválida. Use o calendário ou o botão “Usar a data de hoje”.'); return; }
    apply(next, CHANGED);
  };
  const commitText = (field: 'documentCode' | 'revision', value: string): void => {
    const normalized = normalizeFooterField(value, field);
    if (normalized === (footer?.[field] ?? undefined)) { (field === 'documentCode' ? setCode : setRevision)(normalized ?? ''); return; }
    patch({ [field]: normalized });
  };
  const textKeys = (field: 'documentCode' | 'revision', reset: string) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commitText(field, event.currentTarget.value); }
    if (event.key === 'Escape') { event.preventDefault(); (field === 'documentCode' ? setCode : setRevision)(reset); }
  };
  const commitDate = (value: string): void => {
    if (value === (footer?.issuedOn ?? '')) return;
    patch({ issuedOn: value || undefined });
  };
  const confirmReplace = (): void => {
    if (!review || !prepare()) return;
    const outcome = replaceTypedPageNumbers(session, footer ?? { ...DEFAULT_PAGE_FOOTER }, review, createTransactionId());
    setReview(null);
    onMessage(outcome.ok
      ? `Pronto: ${outcome.removed === 1 ? '1 número digitado foi apagado' : `${outcome.removed} números digitados foram apagados`}. O rodapé automático numera as páginas. Para voltar, use Desfazer.`
      : outcome.message);
  };

  const here = footer ? pageFooterTexts(document, pageIndex + 1, document.pages.length) : undefined;
  const language = footerLanguageCode(document.locale);
  const idBase = `vnext-page-footer-${pageId}`;
  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-native-style vnext-page-footer-section" data-page-footer-section="" aria-labelledby={`${idBase}-heading`}>
        <h3 id={`${idBase}-heading`}>Rodapé de todas as páginas</h3>
        <label className="vnext-native-field">
          <span>Mostrar rodapé com código, revisão, data, idioma e número da página</span>
          <input type="checkbox" data-page-footer-enabled="" checked={Boolean(footer)}
            onChange={(event) => apply(event.target.checked ? { ...DEFAULT_PAGE_FOOTER } : null,
              event.target.checked ? 'Rodapé ligado em todas as páginas. Para voltar, use Desfazer.' : 'Rodapé desligado. Para voltar, use Desfazer.')} />
        </label>
        {footer && <>
          <label className="vnext-page-footer-field">
            <span>Código do documento</span>
            <input type="text" data-page-footer-code="" value={code} maxLength={PAGE_FOOTER_LIMITS.documentCode} placeholder="Ex.: MAN-PCON-XV"
              onChange={(event) => setCode(event.target.value)} onBlur={(event) => commitText('documentCode', event.target.value)}
              onKeyDown={textKeys('documentCode', footer.documentCode ?? '')} />
          </label>
          <label className="vnext-page-footer-field">
            <span>Revisão</span>
            <input type="text" data-page-footer-revision="" value={revision} maxLength={PAGE_FOOTER_LIMITS.revision} placeholder="Ex.: 03"
              onChange={(event) => setRevision(event.target.value)} onBlur={(event) => commitText('revision', event.target.value)}
              onKeyDown={textKeys('revision', footer.revision ?? '')} />
          </label>
          <label className="vnext-page-footer-field">
            <span>Data</span>
            <input type="date" data-page-footer-date="" value={date} min="1900-01-01" max="2999-12-31"
              onChange={(event) => setDate(event.target.value)} onBlur={(event) => commitDate(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDate(event.currentTarget.value); } }} />
          </label>
          <div className="vnext-native-choice">
            <button type="button" data-page-footer-today="" onClick={() => patch({ issuedOn: todayIsoDate() })}>Usar a data de hoje</button>
            {footer.issuedOn && <button type="button" data-page-footer-date-clear="" onClick={() => patch({ issuedOn: undefined })}>Sem data</button>}
          </div>
          <label className="vnext-native-field">
            <span>Mostrar também na capa (página 1)</span>
            <input type="checkbox" data-page-footer-first-page="" checked={footer.showOnFirstPage}
              onChange={(event) => patch({ showOnFirstPage: event.target.checked })} />
          </label>
          <p className="vnext-text-basic-hint">Idioma: {language}, o mesmo do catálogo. O número da página é automático.</p>
          <p className="vnext-page-footer-preview" data-page-footer-preview="">
            {here ? <>Nesta página: <strong>{here.control}</strong> e <strong>{here.pageNumber}</strong></> : 'A capa não mostra o rodapé.'}
          </p>
        </>}
        {typed.length > 0 && !review && <button type="button" data-page-footer-replace-typed="" onClick={() => setReview(typed)}>
          {typed.length === 1 ? 'Trocar 1 número de página digitado pelo automático' : `Trocar ${typed.length} números de página digitados pelo automático`}
        </button>}
        {review && <div className="vnext-page-footer-review" role="group" aria-label="Prévia da troca" data-page-footer-replace-review="">
          <p>{footer ? 'Estes textos serão apagados:' : 'O rodapé automático será ligado e estes textos serão apagados:'}</p>
          <ul>{review.map((item) => <li key={item.objectId}>Página {item.pageNumber}: “{item.text}”</li>)}</ul>
          <div className="vnext-native-choice">
            <button type="button" data-page-footer-replace-confirm="" onClick={confirmReplace}>Apagar e usar o automático</button>
            <button type="button" data-page-footer-replace-cancel="" onClick={() => setReview(null)}>Cancelar</button>
          </div>
        </div>}
      </section>
    </>
  );
}
