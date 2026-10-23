import React from 'react';
import type { CatalogDocument, EditorialObject, Page } from '../domain';
import { TO_FILL } from '../library/presys-archetypes';
import { ChatCard } from './chat/ChatCard';
import { PendingFactsPanel } from './PendingFactsPanel';
import { openPendingCount, pendingFacts } from './draft-compiler';
import type { PlanField, PlanLiteralUse, PlanPage, PlanPageReview } from './catalog-plan';
import { draftPreview } from './spec-table/draft-preview';
import { pageListText } from './intake/intake-model';
import {
  CATALOG_DRAFT_STEPS, UNDO_WINDOW_MS, compileCatalogDraft,
  type CatalogDraftController, type CatalogDraftStage, type CatalogDraftStep,
} from './useCatalogDraft';
import type { SpecTableFile } from './spec-table/useSpecTableDraft';
import './draft-preview.css';

/**
 * FR-70: the cards of "Montar catálogo a partir destes arquivos" in the conversation. The preview shows every page
 * the plan will create — a thumbnail made from the very page Aplicar inserts, what goes in each field, where each
 * value came from, and what stays for the person ("A COMPLETAR", photos, text that may not fit) — and the pending
 * facts of the specification table BEFORE anything changes. Pages can be left out or moved; the AI's questions and
 * the person's notes go back with "Ajustar". "Aplicar" inserts everything in one transaction; "Desfazer" stays on
 * the card for 30 seconds (and in the conversation and the editor after that).
 */
interface Props {
  readonly controller: CatalogDraftController;
  readonly document: CatalogDocument;
  readonly activePageId?: string;
}

export const CATALOG_SEND_NOTICE = 'Ao clicar em “Montar o catálogo”, o PDF vai para o servidor da empresa e para a IA do Google: '
  + 'ela lê as páginas de especificações e o texto do arquivo e propõe as páginas. Cada número volta conferido com o texto do próprio PDF; '
  + 'o que não bater fica em branco para você. Nada muda no catálogo antes de você clicar em “Aplicar”.';

function Bubble({ children, role }: { readonly children: React.ReactNode; readonly role?: 'status' | 'alert' }) {
  return <div className="ai-chat-msg ai-chat-assistant"><div className="ai-chat-bubble" role={role}>{children}</div></div>;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Thumbnail: the page Aplicar inserts, drawn small                                                           */
/* ---------------------------------------------------------------------------------------------------------- */

const plainLines = (object: Extract<EditorialObject, { type: 'text' }>) =>
  object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join(''));
function ThumbObject({ object }: { readonly object: EditorialObject }) {
  const { xMm: x, yMm: y, widthMm: w, heightMm: h } = object.frame;
  if (object.type === 'shape') {
    const stroke = object.style.stroke && 'color' in object.style.stroke ? object.style.stroke.color : undefined;
    return <rect x={x} y={y} width={w} height={h} fill={object.style.fill ?? 'none'} stroke={stroke ?? 'none'} strokeWidth={stroke ? 0.4 : 0} />;
  }
  if (object.type === 'line') return <line x1={x} y1={y} x2={x + w} y2={y} stroke={object.color} strokeWidth={0.6} />;
  if (object.type === 'polygon') {
    const fill = object.style.fill?.kind === 'linear' ? object.style.fill.from : object.style.fill?.kind === 'solid' ? object.style.fill.color : 'none';
    return <polygon points={object.points.map(point => `${x + point.x * w},${y + point.y * h}`).join(' ')} fill={fill}
      opacity={object.style.fill?.kind === 'pattern' ? 0 : 1} />;
  }
  if (object.type === 'image') {
    return <g><rect x={x} y={y} width={w} height={h} fill="#dfe8f1" />
      <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="#b9cce3" strokeWidth={0.6} />
      <line x1={x + w} y1={y} x2={x} y2={y + h} stroke="#b9cce3" strokeWidth={0.6} /></g>;
  }
  if (object.type === 'table') {
    const rows = Math.max(1, object.table.rows.length);
    const step = h / rows;
    return <g><rect x={x} y={y} width={w} height={h} fill="#fff" stroke="#9fb3c8" strokeWidth={0.4} />
      <rect x={x} y={y} width={w} height={Math.min(step, 8)} fill="#003f78" opacity={object.table.rows[0]?.role === 'header' ? 1 : 0} />
      {Array.from({ length: rows - 1 }, (_, index) =>
        <line key={index} x1={x} y1={y + step * (index + 1)} x2={x + w} y2={y + step * (index + 1)} stroke="#c9d6e3" strokeWidth={0.3} />)}</g>;
  }
  if (object.type === 'text') {
    const size = Math.max(2.2, (object.style.fontSizePt ?? 10) * 0.3528);
    const perLine = Math.max(4, Math.floor(w / (size * 0.52)));
    const lines = plainLines(object).flatMap(line => line ? line.match(new RegExp(`.{1,${perLine}}`, 'gu')) ?? [] : ['']);
    const fits = Math.max(1, Math.floor(h / (size * 1.2)));
    const pending = lines.some(line => line.includes(TO_FILL));
    return <text x={x} y={y + size} fontSize={size} fill={pending ? '#a15c00' : object.style.color ?? '#1d2d3d'}
      fontWeight={object.style.fontWeight === 700 ? 700 : 400}>
      {lines.slice(0, Math.min(fits, 6)).map((line, index) => <tspan key={index} x={x} dy={index ? size * 1.2 : 0}>{line}</tspan>)}
    </text>;
  }
  return null;
}
export function PageThumbnail({ page, label }: { readonly page: Page; readonly label: string }) {
  const objects = [...page.objects].sort((a, b) => a.zIndex - b.zIndex);
  return <svg className="ai-plan-thumb" viewBox={`0 0 ${page.widthMm} ${page.heightMm}`} role="img" aria-label={label}
    preserveAspectRatio="xMidYMid meet">
    <rect x={0} y={0} width={page.widthMm} height={page.heightMm} fill="#fff" />
    {objects.map(object => <ThumbObject key={object.id} object={object} />)}
  </svg>;
}
function TableThumbnail({ rows, title, label }: { readonly rows: number; readonly title: string; readonly label: string }) {
  const height = Math.min(240, 14 + rows * 9);
  return <svg className="ai-plan-thumb" viewBox="0 0 210 297" role="img" aria-label={label}>
    <rect x={0} y={0} width={210} height={297} fill="#fff" />
    <text x={12} y={20} fontSize={6} fontWeight={700} fill="#122c49">{title.slice(0, 48)}</text>
    <rect x={12} y={26} width={186} height={height} fill="#fff" stroke="#9fb3c8" strokeWidth={0.5} />
    <rect x={12} y={26} width={186} height={9} fill="#003f78" />
    {Array.from({ length: rows }, (_, index) =>
      <line key={index} x1={12} y1={35 + index * 9} x2={198} y2={35 + index * 9} stroke="#c9d6e3" strokeWidth={0.4} />)}
  </svg>;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Steps, setup                                                                                               */
/* ---------------------------------------------------------------------------------------------------------- */

export function DraftSteps({ step }: { readonly step: CatalogDraftStep }) {
  const at = CATALOG_DRAFT_STEPS.findIndex(item => item.id === step);
  return <ol className="ai-plan-steps" aria-label="Etapas">
    {CATALOG_DRAFT_STEPS.map((item, index) => <li key={item.id} data-step-state={index < at ? 'done' : index === at ? 'current' : 'waiting'}
      aria-current={index === at ? 'step' : undefined}>
      <span aria-hidden="true">{index < at ? '✓' : index + 1}</span>{item.label}{index === at ? '…' : ''}
    </li>)}
  </ol>;
}

function PagesChoice({ file, onChange }: { readonly file: SpecTableFile; readonly onChange: (first: number, last: number) => void }) {
  const number = (text: string) => (/^\d{1,4}$/u.test(text.trim()) ? Number(text) : Number.NaN);
  const pages = pageListText(Array.from({ length: Math.max(0, file.guess.lastPage - file.guess.firstPage + 1) }, (_, index) => file.guess.firstPage + index));
  return <fieldset className="ai-spec-pages" data-plan-file={file.fileName}>
    <legend>{`${file.fileName} (${file.pdf.pageCount} ${file.pdf.pageCount === 1 ? 'página' : 'páginas'})`}</legend>
    <p className="ai-spec-guess">{file.guess.found
      ? `As especificações parecem estar ${file.guess.firstPage === file.guess.lastPage ? `na página ${pages}` : `nas páginas ${pages}`}. Se não for, mude abaixo.`
      : 'Não achei sozinho a página das especificações. Diga quais páginas têm a tabela.'}</p>
    <label>Da página <input type="number" inputMode="numeric" min={1} max={file.pdf.pageCount} value={Number.isNaN(file.firstPage) ? '' : file.firstPage}
      onChange={(event) => onChange(number(event.target.value), file.lastPage)} /></label>
    <label>até a página <input type="number" inputMode="numeric" min={1} max={file.pdf.pageCount} value={Number.isNaN(file.lastPage) ? '' : file.lastPage}
      onChange={(event) => onChange(file.firstPage, number(event.target.value))} /></label>
  </fieldset>;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Preview                                                                                                    */
/* ---------------------------------------------------------------------------------------------------------- */

const STATUS_TEXT: Readonly<Record<PlanField['status'], string>> = { ok: 'Conferido', pending: 'Para conferir', rejected: 'Não entrou' };
const shortText = (text: string, max = 160) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
function fieldSummary(field: PlanField): string {
  if (field.kind === 'text') return field.text ?? '';
  const rows = field.table?.rows ?? [];
  const body = rows.filter(row => !('section' in row)).length;
  return `Tabela com ${body} ${body === 1 ? 'linha' : 'linhas'}${field.table?.header?.length ? ` (${field.table.header.filter(Boolean).join(' · ')})` : ''}`;
}
function Values({ uses }: { readonly uses: readonly PlanLiteralUse[] }) {
  const values = uses.filter(use => !use.plain);
  if (!values.length) return null;
  const missing = values.filter(use => !use.ok).length;
  return <details className="ai-plan-values" open={missing > 0}>
    <summary>{`De onde veio cada valor (${values.length})`}</summary>
    <ul>{values.map((use, index) => <li key={`${use.n}-${index}`} data-value-ok={use.ok ? 'sim' : 'nao'}>
      {use.ok ? <><b>{use.text}</b>{` — ${use.where}`}</> : <><b>{use.copied || 'valor'}</b>{` — não achado${use.where ? ` em ${use.where}` : ''}: fica “${TO_FILL}”`}</>}
    </li>)}</ul>
  </details>;
}

function PlanPageItem({ page, index, review, kept, first, last, thumbnail, controller }: {
  readonly page: PlanPage; readonly index: number; readonly review?: PlanPageReview; readonly kept: boolean;
  readonly first: boolean; readonly last: boolean; readonly thumbnail: React.ReactNode; readonly controller: CatalogDraftController;
}) {
  const title = kept ? `${index + 1}. ${page.label}` : page.label;
  const stays = [...(review?.toComplete ?? []).map(item => `${item}: escreva na página (fica “${TO_FILL}”)`),
    ...(review?.photos.length ? [`Fotos para escolher na página: ${review.photos.join(', ')}`] : []),
    ...(review?.mayOverflow ?? []).map(item => `${item}: o texto pode não caber; confira na página`)];
  return <li className="ai-plan-page" data-plan-page={page.key} data-plan-kept={kept ? 'sim' : 'nao'}>
    <div className="ai-plan-thumb-wrap">{thumbnail}</div>
    <div className="ai-plan-page-body">
      <h5>{title}{page.addedByApp ? ' (para você completar)' : ''}</h5>
      {page.purpose && <p className="ai-plan-purpose">{page.purpose}</p>}
      {page.specTable && <p className="ai-plan-purpose">Tabela montada só com os valores conferidos no PDF.</p>}
      {page.sources.length > 0 && <p className="ai-plan-source">{`Base: ${page.sources.join('; ')}`}</p>}
      {kept && page.fields.length > 0 && <ul className="ai-plan-fields">{page.fields.map(field =>
        <li key={field.slot} data-field-status={field.status}>
          <span className="ai-plan-field-label">{field.label}</span>
          <span className="ai-plan-chip" data-field-status={field.status}>{STATUS_TEXT[field.status]}</span>
          {field.status !== 'rejected' && <span className="ai-plan-field-text">{shortText(fieldSummary(field))}</span>}
          {field.message && <span className="ai-plan-field-message">{field.message}</span>}
          <Values uses={field.uses} />
        </li>)}</ul>}
      {kept && stays.length > 0 && <ul className="ai-plan-stays" aria-label="Fica para você">{stays.map(item => <li key={item}>{item}</li>)}</ul>}
      <div className="ai-plan-page-actions">
        {kept ? <>
          <button type="button" onClick={() => controller.move(page.key, -1)} disabled={first} aria-label={`Subir ${page.label}`}>Subir</button>
          <button type="button" onClick={() => controller.move(page.key, 1)} disabled={last} aria-label={`Descer ${page.label}`}>Descer</button>
          <button type="button" onClick={() => controller.toggle(page.key)} aria-label={`Tirar ${page.label} do catálogo`}>Tirar do catálogo</button>
        </> : <button type="button" onClick={() => controller.toggle(page.key)} aria-label={`Pôr ${page.label} de volta`}>Pôr de volta</button>}
      </div>
    </div>
  </li>;
}

export function DraftPreview({ controller, document, activePageId, stage }: Props & { readonly stage: Extract<CatalogDraftStage, { kind: 'preview' }> }) {
  const measured = React.useMemo(() => compileCatalogDraft(stage, document, activePageId), [stage, document, activePageId]);
  const byKey = new Map(stage.plan.pages.map(page => [page.key, page]));
  const kept = stage.selection.flatMap(key => byKey.get(key) ? [byKey.get(key)!] : []);
  const left = stage.plan.pages.filter(page => !stage.selection.includes(page.key));
  const reviews = new Map(measured.ok ? measured.reviews.map(review => [review.key, review]) : []);
  const refsOf = new Map(measured.ok ? measured.compiled.pageRefs.map(entry => [entry.key, entry.refs]) : []);
  const pendingSpec = stage.set ? openPendingCount(pendingFacts(stage.set)) : 0;
  const totalPages = measured.ok ? measured.compiled.pageRefs.reduce((total, entry) => total + entry.refs.length, 0) : 0;
  const thumbnail = (page: PlanPage, index: number) => {
    const label = `Miniatura da página ${index + 1}: ${page.label}`;
    const draft = measured.ok ? measured.compiled.drafts[page.key] : undefined;
    if (draft) {
      const part = draftPreview(draft).parts[0];
      return <TableThumbnail rows={part?.rows.length ?? 1} title={part?.title ?? page.label} label={label} />;
    }
    const ref = refsOf.get(page.key)?.[0];
    const preview = ref && measured.ok ? measured.compiled.previews[ref] : undefined;
    return preview ? <PageThumbnail page={preview} label={label} /> : null;
  };
  const where = !measured.ok ? '' : measured.compiled.replacesEmptyPage
    ? 'As páginas entram no lugar da página vazia.'
    : `As páginas entram depois da página ${document.pages.findIndex(page => page.id === measured.compiled.anchorPageId) + 1}.`;
  const counts = stage.plan.counts;
  return <>
    {stage.set && pendingSpec > 0 && <ChatCard label="Pendências da tabela de especificações" title="Confira antes de aplicar" actions={null}>
      <PendingFactsPanel factSet={stage.set} onChange={controller.choose} />
    </ChatCard>}
    <ChatCard label="Prévia do catálogo" title="Prévia do catálogo"
      actions={<>
        <button type="button" className="vnext-btn-primary" disabled={!measured.ok || !kept.length} onClick={controller.apply}>Aplicar</button>
        <button type="button" onClick={() => { void controller.adjust(); }}>Ajustar</button>
        <button type="button" onClick={controller.discard}>Descartar</button>
      </>}>
      <div data-catalog-draft="preview">
        <p>{`${totalPages || kept.length} ${totalPages === 1 ? 'página' : 'páginas'}. ${counts.checked} ${counts.checked === 1 ? 'valor conferido' : 'valores conferidos'} no PDF.`
          + (counts.notFound ? ` ${counts.notFound} ${counts.notFound === 1 ? 'valor não foi achado e fica' : 'valores não foram achados e ficam'} “${TO_FILL}”.` : '')
          + (counts.rejected ? ` ${counts.rejected} ${counts.rejected === 1 ? 'campo não entrou' : 'campos não entraram'} (número sem origem).` : '')
          + (pendingSpec ? ` A tabela de especificações tem ${pendingSpec} ${pendingSpec === 1 ? 'pendência' : 'pendências'} (acima).` : '')}</p>
        <p className="ai-chat-note">{where} Ao aplicar, tudo entra de uma vez; um Desfazer tira o catálogo inteiro.</p>
        <ol className="ai-plan-pages">{kept.map((page, index) => <PlanPageItem key={page.key} page={page} index={index} review={reviews.get(page.key)}
          kept first={index === 0} last={index === kept.length - 1} thumbnail={thumbnail(page, index)} controller={controller} />)}</ol>
        {left.length > 0 && <>
          <p className="ai-plan-left-title">Fora do catálogo</p>
          <ul className="ai-plan-pages ai-plan-left">{left.map((page, index) => <PlanPageItem key={page.key} page={page} index={index} kept={false}
            first last thumbnail={null} controller={controller} />)}</ul>
        </>}
        <div className="ai-plan-adjust">
          {stage.plan.questions.map((question, index) => <label key={question} className="ai-spec-models">
            <span>{question}</span>
            <input type="text" maxLength={300} value={stage.answers[index] ?? ''} onChange={(event) => controller.setAnswer(index, event.target.value)} />
          </label>)}
          <label className="ai-spec-models">
            <span>O que mudar? (opcional)</span>
            <textarea rows={2} maxLength={500} value={stage.notes} placeholder="Ex.: destaque o TA-50N na capa; não precisa da página de insertos."
              onChange={(event) => controller.setNotes(event.target.value)} />
            <small>Use “Ajustar” para a IA refazer as páginas com as suas respostas. O PDF não é lido de novo.</small>
          </label>
        </div>
        {!measured.ok && <p className="ai-spec-problem" role="alert">{measured.message}</p>}
        {stage.problem && <p className="ai-spec-problem" role="alert">{stage.problem}</p>}
      </div>
    </ChatCard>
  </>;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* All the cards, by stage                                                                                    */
/* ---------------------------------------------------------------------------------------------------------- */

function AppliedCard({ controller, stage, document }: { readonly controller: CatalogDraftController;
  readonly stage: Extract<CatalogDraftStage, { kind: 'applied' }>; readonly document: CatalogDocument }) {
  const [, tick] = React.useState(0);
  const left = UNDO_WINDOW_MS - (Date.now() - stage.at);
  React.useEffect(() => {
    if (left <= 0 || stage.undone) return undefined;
    const timer = setTimeout(() => tick(value => value + 1), Math.min(left, 1_000) + 20);
    return () => clearTimeout(timer);
  });
  const stillThere = stage.applied.pageIds.some(id => document.pages.some(page => page.id === id));
  return <ChatCard label="Catálogo montado" title={stage.undone ? 'Catálogo desfeito' : 'Catálogo montado'}
    actions={<>
      {!stage.undone && left > 0 && stillThere && <button type="button" className="vnext-btn-primary" onClick={() => { controller.undo(); }}>
        {`Desfazer (${Math.ceil(left / 1_000)} s)`}</button>}
      <button type="button" onClick={controller.discard}>Fechar</button>
    </>}>
    <p role="status" data-catalog-draft="applied">{stage.undone ? 'O catálogo voltou ao que era antes.' : stage.applied.message}</p>
    {!stage.undone && stage.planned.set && openPendingCount(pendingFacts(stage.planned.set)) > 0 &&
      <PendingFactsPanel factSet={stage.planned.set} onChange={() => undefined} readOnly />}
  </ChatCard>;
}

/** The messages and cards of "Montar catálogo a partir destes arquivos", in order. */
export function CatalogDraftMessages({ controller, document, activePageId }: Props) {
  const stage = controller.flow?.stage;
  if (!controller.flow || !stage) return null;
  if (stage.kind === 'checking') {
    return <Bubble role="status"><p className="ai-chat-typing"><span className="ai-chat-dots" aria-hidden="true"><i /><i /><i /></span>
      Verificando se a IA pode montar o catálogo…</p></Bubble>;
  }
  if (stage.kind === 'blocked') {
    return <div className="ai-chat-msg ai-chat-system" role="alert" data-catalog-draft="blocked">
      <p>{stage.message}</p>
      <button type="button" className="ai-chat-link" onClick={controller.retry}>Tentar de novo</button>
      <button type="button" className="ai-chat-link" onClick={controller.discard}>Fechar</button>
    </div>;
  }
  if (stage.kind === 'setup') {
    return <ChatCard label="Montar catálogo a partir dos arquivos" title="Montar o catálogo a partir destes arquivos"
      actions={<>
        <button type="button" className="vnext-btn-primary" onClick={() => { void controller.run(); }}>Montar o catálogo</button>
        <button type="button" onClick={controller.cancel}>Cancelar</button>
      </>}>
      <div data-catalog-draft="setup">
        <p>A IA propõe as páginas no padrão PRESYS (capa, visão geral, recursos, especificações, código de pedido, fornecimento, contracapa). Você vê tudo antes de aplicar.</p>
        <label className="ai-spec-models">
          <span>Modelos que você quer no catálogo (opcional)</span>
          <input type="text" value={controller.flow.models} maxLength={300} placeholder="Ex.: TA-25N, TA-35N, TA-50N"
            onChange={(event) => controller.setModels(event.target.value)} />
          <small>Se o PDF tiver vários produtos, escreva os modelos como aparecem no PDF, separados por vírgula.</small>
        </label>
        {stage.files.map(file => <PagesChoice key={file.entryId} file={file} onChange={(first, last) => controller.setPages(file.entryId, first, last)} />)}
        {stage.photos.length > 0 && <p className="ai-chat-note">{`Fotos desta mensagem: ${stage.photos.map(photo => photo.fileName).join(', ')}. `
          + 'Elas não vão para a IA; você escolhe onde cada uma entra depois.'}</p>}
        <p className="ai-chat-note">{CATALOG_SEND_NOTICE}</p>
        {stage.problem && <p className="ai-spec-problem" role="alert">{stage.problem}</p>}
      </div>
    </ChatCard>;
  }
  if (stage.kind === 'working') {
    return <Bubble role="status">
      <div data-catalog-draft="working">
        <p>Montando o catálogo. Pode levar de 1 a 2 minutos.</p>
        <DraftSteps step={stage.step} />
        <button type="button" className="ai-chat-link" onClick={controller.cancel}>Cancelar</button>
      </div>
    </Bubble>;
  }
  if (stage.kind === 'failed') {
    return <div className="ai-chat-msg ai-chat-system" role="alert" data-catalog-draft="failed">
      <p>{stage.message}</p>
      <button type="button" className="ai-chat-link" onClick={() => { void controller.run(); }}>Tentar de novo</button>
      <button type="button" className="ai-chat-link" onClick={controller.discard}>Fechar</button>
    </div>;
  }
  if (stage.kind === 'applied') return <AppliedCard controller={controller} stage={stage} document={document} />;
  return <DraftPreview controller={controller} document={document} activePageId={activePageId} stage={stage} />;
}
