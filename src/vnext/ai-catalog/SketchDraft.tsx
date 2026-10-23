import React from 'react';
import type { CatalogDocument } from '../domain';
import { TO_FILL } from '../library/presys-archetypes';
import { ChatCard } from './chat/ChatCard';
import { PageThumbnail } from './DraftPreview';
import type { SketchRegion } from './sketch-plan';
import {
  LEAVE_TO_FILL, SKETCH_KIND_COLORS, SKETCH_KIND_LABELS, compileSketchPages, sketchDigits, sketchRegionNotes,
  sketchRegionNumbers, sketchSourcesFor, sketchTextState, type SketchField, type SketchTableSource,
} from './sketch-review';
import { sketchTemplate, type SketchTemplateId } from './sketch-snap';
import {
  SKETCH_STEPS, SKETCH_UNDO_WINDOW_MS, isReadySketchPage, sketchOutcomes,
  type ReadySketchPage, type SketchDraftController, type SketchPage, type SketchStage,
} from './useSketchDraft';
import './draft-preview.css';
import './sketch-draft.css';

/**
 * Modo rascunho in the conversation: the photo of each page with the areas the AI understood drawn over it
 * (numbered, one colour per kind), the page type (the suggestion and two alternatives), what each area becomes,
 * every digit of the drawing highlighted until the person confirms it, where each table's data comes from (a file
 * already checked here, or "deixar para preencher"), and how the page will look. Nothing changes in the catalog
 * before "Aplicar"; all the pages go in at once and one Desfazer takes them all out.
 */
interface Props {
  readonly controller: SketchDraftController;
  readonly document: CatalogDocument;
  readonly activePageId?: string;
  /** Files already checked in this conversation that can fill a drawn table. */
  readonly sources: readonly SketchTableSource[];
}

export const SKETCH_SEND_NOTICE = 'Ao clicar em “Ler o rascunho”, cada foto vai para o servidor da empresa e para a IA do Google, '
  + 'que só entende o desenho: onde fica cada parte da página. Nenhum número do desenho entra sem você conferir, e as tabelas '
  + 'só recebem dados de arquivos já conferidos. Nada muda no catálogo antes de você clicar em “Aplicar”.';

function Bubble({ children, role }: { readonly children: React.ReactNode; readonly role?: 'status' | 'alert' }) {
  return <div className="ai-chat-msg ai-chat-assistant"><div className="ai-chat-bubble" role={role}>{children}</div></div>;
}

/** The text with each run of digits marked, as the person must confirm them. */
export function DigitsText({ text }: { readonly text: string }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const digit of sketchDigits(text)) {
    if (digit.start > at) parts.push(text.slice(at, digit.start));
    parts.push(<mark key={digit.start} className="ai-sketch-digit">{digit.value}</mark>);
    at = digit.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function Badges({ ids, numbers, regions }: { readonly ids: readonly string[]; readonly numbers: ReadonlyMap<string, number>;
  readonly regions: ReadonlyMap<string, SketchRegion> }) {
  return <span className="ai-sketch-badges">{ids.map(id => {
    const region = regions.get(id);
    return <span key={id} className="ai-sketch-badge" style={{ background: SKETCH_KIND_COLORS[region?.kind ?? 'note'] }}
      aria-label={`Área ${numbers.get(id) ?? '?'} (${SKETCH_KIND_LABELS[region?.kind ?? 'note'].toLocaleLowerCase('pt-BR')})`}
      title={SKETCH_KIND_LABELS[region?.kind ?? 'note']}>{numbers.get(id) ?? '?'}</span>;
  })}</span>;
}

/** The photo as the AI read it, with every area it understood drawn over it. */
function SketchPhoto({ page, active }: { readonly page: ReadySketchPage; readonly active: readonly string[] }) {
  const { plan } = page.interpretation;
  const numbers = sketchRegionNumbers(plan);
  const assigned = new Set(page.snap.assignments.flatMap(item => item.regionIds));
  const unused = new Set(page.snap.unassignedRegionIds);
  return <figure className="ai-sketch-photo" data-sketch-photo={page.fileName}>
    <div className="ai-sketch-photo-frame" style={{ aspectRatio: `${page.image.width} / ${page.image.height}` }}>
      {page.image.url
        ? <img src={page.image.url} alt={`Foto do rascunho ${page.fileName}, com ${plan.regions.length} áreas marcadas`} />
        : <div className="ai-sketch-photo-missing" role="img" aria-label={`Foto do rascunho ${page.fileName}`} />}
      {plan.regions.map(region => {
        const [top, left, bottom, right] = region.normalizedBox;
        return <span key={region.id} className="ai-sketch-box" aria-hidden="true" data-sketch-region={region.id}
          data-region-kind={region.kind} data-region-use={assigned.has(region.id) ? 'campo' : unused.has(region.id) ? 'fora' : 'modelo'}
          data-active={active.includes(region.id) ? 'sim' : undefined}
          style={{ top: `${top * 100}%`, left: `${left * 100}%`, height: `${(bottom - top) * 100}%`, width: `${(right - left) * 100}%`,
            borderColor: SKETCH_KIND_COLORS[region.kind], ['--ai-sketch-color' as string]: SKETCH_KIND_COLORS[region.kind] }}>
          <b style={{ background: SKETCH_KIND_COLORS[region.kind] }}>{numbers.get(region.id)}</b>
        </span>;
      })}
    </div>
    <figcaption>{`${plan.regions.length} áreas entendidas pela IA. Os números na foto são os mesmos da lista abaixo.`}</figcaption>
  </figure>;
}

function sourceHint(field: SketchField, offered: readonly SketchTableSource[]): string {
  const said = field.suggestedSource === 'pdf' ? 'O rascunho diz que os dados vêm do PDF.'
    : field.suggestedSource === 'planilha' ? 'O rascunho diz que os dados vêm de uma planilha.'
      : field.suggestedSource === 'manual' ? 'O rascunho diz que você vai digitar os dados.' : '';
  const wanted = field.suggestedSource === 'pdf' ? 'pdf' : field.suggestedSource === 'planilha' ? 'planilha' : null;
  const missing = wanted && !offered.some(source => source.kind === wanted)
    ? wanted === 'pdf'
      ? field.key === 'P4.specs'
        ? ' Para usar o PDF, leia antes a tabela com “Montar tabela de especificações” nesta conversa; por enquanto ela pode entrar vazia.'
        : ' Os dados do PDF entram depois, na própria página.'
      : ' Anexe a planilha nesta conversa para usá-la aqui; por enquanto a tabela pode entrar vazia.'
    : '';
  return `${said}${missing}`.trim();
}

function FieldItem({ page, field, controller, sources, numbers, regions, onFocus }: {
  readonly page: ReadySketchPage; readonly field: SketchField; readonly controller: SketchDraftController;
  readonly sources: readonly SketchTableSource[]; readonly numbers: ReadonlyMap<string, number>;
  readonly regions: ReadonlyMap<string, SketchRegion>; readonly onFocus: (ids: readonly string[]) => void;
}) {
  const head = (chip: string, status: string) => <div className="ai-sketch-field-head">
    <Badges ids={field.regionIds} numbers={numbers} regions={regions} />
    <span className="ai-plan-field-label">{field.label}</span>
    <span className="ai-plan-chip" data-field-status={status}>{chip}</span>
  </div>;
  const focus = { onMouseEnter: () => onFocus(field.regionIds), onFocus: () => onFocus(field.regionIds) };
  if (field.kind === 'brand') {
    return <li className="ai-sketch-field" data-sketch-field={field.key} data-field-state="modelo" {...focus}>
      {head('Do modelo', 'ok')}<p className="ai-sketch-help">O logotipo PRESYS já faz parte do modelo.</p>
    </li>;
  }
  if (field.kind === 'image') {
    return <li className="ai-sketch-field" data-sketch-field={field.key} data-field-state="foto" {...focus}>
      {head('Foto depois', 'pending')}
      <p className="ai-sketch-help">{`Escolha a foto na página, depois de aplicar.${field.instruction ? ` O rascunho pede: ${field.instruction}.` : ''}`}</p>
    </li>;
  }
  if (field.kind === 'table') {
    const offered = sketchSourcesFor(field.key, sources);
    const chosen = page.choices.tables[field.key] ?? LEAVE_TO_FILL;
    const source = offered.find(item => item.id === chosen);
    const name = `fonte-${page.key}-${field.key}`;
    const hint = sourceHint(field, offered);
    return <li className="ai-sketch-field" data-sketch-field={field.key} data-field-state={source ? 'fonte' : 'vazia'} {...focus}>
      {head(source ? (source.kind === 'pdf' ? 'Do PDF conferido' : 'Da planilha') : 'Entra vazia', source ? 'ok' : 'pending')}
      <fieldset className="ai-sketch-source">
        <legend>{`De onde vêm os dados da “${field.label}”?`}</legend>
        <label><input type="radio" name={name} checked={!source} onChange={() => controller.setSource(page.key, field.key, LEAVE_TO_FILL)} />
          {`Deixar para preencher (a tabela entra vazia, com “${TO_FILL}”)`}</label>
        {offered.map(item => <label key={item.id} data-source-problem={item.kind === 'planilha' && item.problem ? 'sim' : undefined}>
          <input type="radio" name={name} checked={source?.id === item.id} disabled={item.kind === 'planilha' && Boolean(item.problem)}
            onChange={() => controller.setSource(page.key, field.key, item.id)} />
          {item.label}{item.kind === 'planilha' && item.problem ? ` — ${item.problem}` : ''}
        </label>)}
      </fieldset>
      {hint && <p className="ai-sketch-help">{hint}</p>}
      {source?.kind === 'pdf' && <p className="ai-sketch-help">A página vira a tabela conferida do PDF; o título escrito no rascunho vira o título da tabela.</p>}
      <p className="ai-sketch-help">O desenho nunca preenche a tabela: os valores vêm só do arquivo escolhido.</p>
    </li>;
  }
  const choice = page.choices.texts[field.key] ?? { text: '' };
  const state = sketchTextState(choice);
  const digits = sketchDigits(choice.text).length > 0;
  const inputId = `sketch-${page.key}-${field.key}`;
  return <li className="ai-sketch-field" data-sketch-field={field.key} data-field-state={state} {...focus}>
    {head(state === 'ok' ? (digits ? 'Conferido por você' : 'Entra assim') : state === 'to-confirm' ? 'Conferir números' : 'Para preencher',
      state === 'ok' ? 'ok' : 'pending')}
    <input id={inputId} className="ai-sketch-text" type="text" maxLength={200} value={choice.text} placeholder={`Fica “${TO_FILL}”`}
      aria-label={`Texto de ${field.label}`} onChange={(event) => controller.setText(page.key, field.key, event.target.value)} />
    {digits && <div className="ai-sketch-confirm" data-sketch-confirm={state === 'ok' ? 'conferido' : 'conferir'}>
      <p>{state === 'ok' ? 'Números conferidos: ' : 'Números lidos do rascunho: '}<DigitsText text={choice.text} /></p>
      <button type="button" aria-pressed={state === 'ok'} onClick={() => controller.confirmDigits(page.key, field.key)}
        aria-label={state === 'ok' ? `Voltar a conferir os números de ${field.label}` : `Os números de ${field.label} estão certos`}>
        {state === 'ok' ? 'Conferir de novo' : 'Os números estão certos'}</button>
      {state !== 'ok' && <small>Sem conferir, este campo entra como “{TO_FILL}”.</small>}
    </div>}
    {state === 'empty' && <p className="ai-sketch-help">{`Fica “${TO_FILL}” para você escrever na página.`}
      {field.instruction ? ` O rascunho pede: ${field.instruction}.` : ''}</p>}
  </li>;
}

function TemplateChoice({ page, controller }: { readonly page: ReadySketchPage; readonly controller: SketchDraftController }) {
  const suggested = page.snap.suggestedArchetypeId;
  const options: SketchTemplateId[] = [...new Set([suggested, page.choices.template, ...page.snap.alternatives])].slice(0, 3);
  return <fieldset className="ai-sketch-template">
    <legend>Tipo de página</legend>
    {options.map(id => <label key={id}>
      <input type="radio" name={`tipo-${page.key}`} checked={page.choices.template === id} onChange={() => controller.chooseTemplate(page.key, id)} />
      {sketchTemplate(id).label}{id === suggested ? ' (sugestão da IA)' : ''}
    </label>)}
  </fieldset>;
}

function PageCard({ page, index, total, controller, sources, thumbnail }: {
  readonly page: SketchPage; readonly index: number; readonly total: number; readonly controller: SketchDraftController;
  readonly sources: readonly SketchTableSource[]; readonly thumbnail: React.ReactNode;
}) {
  const [active, setActive] = React.useState<readonly string[]>([]);
  const title = `Página ${index + 1} de ${total}: ${page.fileName}`;
  if (!isReadySketchPage(page)) {
    return <ChatCard label={`Rascunho ${index + 1}: ${page.fileName}`} title={title} actions={<>
      {page.state === 'failed' && <button type="button" className="vnext-btn-primary" onClick={() => { void controller.retryPage(page.key); }}>Tentar de novo esta foto</button>}
      {page.state === 'failed' && <button type="button" onClick={() => controller.include(page.key, !page.included)}>
        {page.included ? 'Não criar esta página' : 'Criar esta página'}</button>}
    </>}>
      <p role={page.state === 'failed' ? 'alert' : 'status'} data-sketch-page={page.key} data-sketch-state={page.state}>
        {page.state === 'failed' ? page.message : 'Aguardando a leitura.'}</p>
    </ChatCard>;
  }
  const { plan } = page.interpretation;
  const numbers = sketchRegionNumbers(plan);
  const regions = new Map(plan.regions.map(region => [region.id, region]));
  const notes = sketchRegionNotes(plan, page.snap);
  const doubts = page.snap.questions.filter(question => question.kind === 'layout');
  const fields = [...page.fields].sort((left, right) => Math.min(...left.regionIds.map(id => numbers.get(id) ?? 99))
    - Math.min(...right.regionIds.map(id => numbers.get(id) ?? 99)));
  return <ChatCard label={`Rascunho ${index + 1}: ${page.fileName}`} title={title} actions={
    <button type="button" onClick={() => controller.include(page.key, !page.included)} aria-pressed={!page.included}>
      {page.included ? 'Não criar esta página' : 'Criar esta página'}</button>}>
    <div className="ai-sketch-page" data-sketch-page={page.key} data-sketch-state="ready" data-sketch-included={page.included ? 'sim' : 'nao'}
      onMouseLeave={() => setActive([])}>
      {!page.included && <p className="ai-chat-note">Esta página não será criada.</p>}
      <div className="ai-sketch-compare">
        <SketchPhoto page={page} active={active} />
        {page.included && thumbnail && <div className="ai-sketch-result"><span>Como vai ficar</span>{thumbnail}</div>}
      </div>
      <TemplateChoice page={page} controller={controller} />
      {page.snap.warnings.map(warning => <p key={warning} className="ai-sketch-warning">{warning}</p>)}
      {doubts.length > 0 && <div className="ai-sketch-doubts"><p>A IA ficou em dúvida:</p>
        <ul>{doubts.map(question => <li key={question.id}><DigitsText text={question.text} /></li>)}</ul>
        <small>Se precisar, troque o tipo de página acima ou ajuste na página depois de aplicar.</small></div>}
      <ul className="ai-sketch-fields" aria-label={`O que a IA entendeu no rascunho ${index + 1}`}>
        {fields.map(field => <FieldItem key={field.key} page={page} field={field} controller={controller} sources={sources}
          numbers={numbers} regions={regions} onFocus={setActive} />)}
        {notes.map(note => <li key={note.regionId} className="ai-sketch-field" data-sketch-note={note.kind}
          onMouseEnter={() => setActive([note.regionId])}>
          <div className="ai-sketch-field-head"><Badges ids={[note.regionId]} numbers={numbers} regions={regions} />
            <span className="ai-sketch-help">{note.text}</span></div>
        </li>)}
      </ul>
      <p className="ai-sketch-help">{`Os outros campos do modelo ficam com “${TO_FILL}”.`}</p>
    </div>
  </ChatCard>;
}

function plural(count: number, one: string, many: string) { return `${count} ${count === 1 ? one : many}`; }

function Review({ controller, document, activePageId, sources, stage }: Props & {
  readonly stage: Extract<SketchStage, { kind: 'review' }> }) {
  const outcomes = React.useMemo(() => sketchOutcomes(stage.pages, sources), [stage.pages, sources]);
  const measured = React.useMemo(() => compileSketchPages(document, outcomes, activePageId), [document, outcomes, activePageId]);
  const refs = new Map(measured.ok ? measured.compiled.pageRefs.map(entry => [entry.key, entry.refs]) : []);
  const thumbnail = (page: SketchPage, index: number) => {
    const ref = refs.get(page.key)?.[0];
    const preview = ref && measured.ok ? measured.compiled.previews[ref] : undefined;
    if (preview) return <PageThumbnail page={preview} label={`Miniatura da página ${index + 1} como vai ficar`} />;
    return measured.ok && ref ? <p className="ai-sketch-help">A tabela conferida do PDF, como na “Montar tabela de especificações”.</p> : null;
  };
  const totals = outcomes.reduce((sum, item) => ({ filled: sum.filled + item.filled.length, toConfirm: sum.toConfirm + item.toConfirm.length,
    toFill: sum.toFill + item.toFill.length, photos: sum.photos + item.photos.length,
    empty: sum.empty + item.tables.filter(table => !table.source).length, sourced: sum.sourced + item.tables.filter(table => table.source).length,
    missing: sum.missing + item.missingSources.length }),
  { filled: 0, toConfirm: 0, toFill: 0, photos: 0, empty: 0, sourced: 0, missing: 0 });
  const created = measured.ok ? measured.compiled.pageRefs.reduce((total, entry) => total + entry.refs.length, 0) : outcomes.length;
  const where = !measured.ok ? '' : measured.compiled.replacesEmptyPage
    ? 'As páginas entram no lugar da página vazia.'
    : `As páginas entram depois da página ${document.pages.findIndex(page => page.id === measured.compiled.anchorPageId) + 1}.`;
  const summary = [
    `${plural(created, 'página', 'páginas')} para criar.`,
    totals.filled ? `${plural(totals.filled, 'campo entra', 'campos entram')} com o texto do rascunho.` : '',
    totals.toConfirm ? `${plural(totals.toConfirm, 'campo tem números', 'campos têm números')} para conferir; sem conferir, ${totals.toConfirm === 1 ? 'entra' : 'entram'} como “${TO_FILL}”.` : '',
    totals.empty ? `${plural(totals.empty, 'tabela entra vazia', 'tabelas entram vazias')}, para preencher.` : '',
    totals.sourced ? `${plural(totals.sourced, 'tabela vem', 'tabelas vêm')} de arquivo conferido.` : '',
    totals.photos ? `${plural(totals.photos, 'foto fica', 'fotos ficam')} para escolher na página.` : '',
    totals.missing ? `${plural(totals.missing, 'arquivo escolhido saiu', 'arquivos escolhidos saíram')} da conversa: a tabela entra vazia.` : '',
  ].filter(Boolean).join(' ');
  const ready = stage.pages.filter(isReadySketchPage);
  return <>
    {stage.pages.map((page, index) => <PageCard key={page.key} page={page} index={index} total={stage.pages.length}
      controller={controller} sources={sources} thumbnail={thumbnail(page, index)} />)}
    <ChatCard label="Prévia das páginas do rascunho" title="Prévia das páginas do rascunho" actions={<>
      <button type="button" className="vnext-btn-primary" disabled={!measured.ok || !outcomes.length} onClick={() => controller.apply(sources)}>Aplicar</button>
      <button type="button" onClick={controller.discard}>Descartar</button>
    </>}>
      <div data-sketch-draft="review">
        {ready.length ? <p>{summary}</p> : <p>Nenhuma foto foi lida. Tente de novo as fotos acima ou descarte.</p>}
        {ready.length > 0 && <p className="ai-chat-note">{where} Ao aplicar, tudo entra de uma vez; um Desfazer tira todas as páginas.</p>}
        {!measured.ok && ready.length > 0 && <p className="ai-spec-problem" role="alert">{measured.message}</p>}
        {stage.problem && <p className="ai-spec-problem" role="alert">{stage.problem}</p>}
      </div>
    </ChatCard>
  </>;
}

function AppliedCard({ controller, stage, document }: { readonly controller: SketchDraftController;
  readonly stage: Extract<SketchStage, { kind: 'applied' }>; readonly document: CatalogDocument }) {
  const [, tick] = React.useState(0);
  const left = SKETCH_UNDO_WINDOW_MS - (Date.now() - stage.at);
  React.useEffect(() => {
    if (left <= 0 || stage.undone) return undefined;
    const timer = setTimeout(() => tick(value => value + 1), Math.min(left, 1_000) + 20);
    return () => clearTimeout(timer);
  });
  const stillThere = stage.applied.pageIds.some(id => document.pages.some(page => page.id === id));
  return <ChatCard label="Páginas do rascunho criadas" title={stage.undone ? 'Páginas desfeitas' : 'Páginas do rascunho criadas'}
    actions={<>
      {!stage.undone && left > 0 && stillThere && <button type="button" className="vnext-btn-primary" onClick={() => { controller.undo(); }}>
        {`Desfazer (${Math.ceil(left / 1_000)} s)`}</button>}
      <button type="button" onClick={controller.discard}>Fechar</button>
    </>}>
    <p role="status" data-sketch-draft="applied">{stage.undone ? 'O catálogo voltou ao que era antes.' : stage.message}</p>
  </ChatCard>;
}

function Working({ controller, pages }: { readonly controller: SketchDraftController; readonly pages: readonly SketchPage[] }) {
  const current = pages.find(page => page.state === 'reading');
  const index = current ? pages.indexOf(current) : -1;
  const at = current?.step ? SKETCH_STEPS.findIndex(step => step.id === current.step) : -1;
  return <Bubble role="status">
    <div data-sketch-draft="working">
      <p>{current ? `Lendo o rascunho ${index + 1} de ${pages.length}: ${current.fileName}. Cada foto leva de 15 a 30 segundos.` : 'Lendo o rascunho…'}</p>
      {current && <ol className="ai-plan-steps" aria-label="Etapas">
        {SKETCH_STEPS.map((step, position) => <li key={step.id}
          data-step-state={position < at ? 'done' : position === at ? 'current' : 'waiting'} aria-current={position === at ? 'step' : undefined}>
          <span aria-hidden="true">{position < at ? '✓' : position + 1}</span>{step.label}{position === at ? '…' : ''}
        </li>)}
      </ol>}
      {pages.length > 1 && <ul className="ai-sketch-progress">{pages.map(page => <li key={page.key} data-sketch-state={page.state}>
        {`${page.fileName}: ${page.state === 'ready' ? 'lido' : page.state === 'failed' ? 'não deu para ler' : page.state === 'reading' ? 'lendo…' : 'na fila'}`}
      </li>)}</ul>}
      <button type="button" className="ai-chat-link" onClick={controller.cancel}>Cancelar</button>
    </div>
  </Bubble>;
}

/** The messages and cards of "Criar páginas a partir do rascunho", in order. */
export function SketchDraftMessages({ controller, document, activePageId, sources }: Props) {
  const stage = controller.flow?.stage;
  if (!controller.flow || !stage) return null;
  if (stage.kind === 'checking') {
    return <Bubble role="status"><p className="ai-chat-typing"><span className="ai-chat-dots" aria-hidden="true"><i /><i /><i /></span>
      Verificando se a IA pode ler o rascunho…</p></Bubble>;
  }
  if (stage.kind === 'blocked') {
    return <div className="ai-chat-msg ai-chat-system" role="alert" data-sketch-draft="blocked">
      <p>{stage.message}</p>
      <button type="button" className="ai-chat-link" onClick={controller.retry}>Tentar de novo</button>
      <button type="button" className="ai-chat-link" onClick={controller.discard}>Fechar</button>
    </div>;
  }
  if (stage.kind === 'setup') {
    return <ChatCard label="Criar páginas a partir do rascunho" title="Criar páginas a partir do rascunho" actions={<>
      <button type="button" className="vnext-btn-primary" onClick={() => { void controller.run(); }}>Ler o rascunho</button>
      <button type="button" onClick={controller.cancel}>Cancelar</button>
    </>}>
      <div data-sketch-draft="setup">
        <p>{stage.photos.length === 1 ? 'Uma foto, uma página:' : `${stage.photos.length} fotos, uma página para cada foto:`}</p>
        <ol className="ai-sketch-photos">{stage.photos.map(photo => <li key={photo.key}>{photo.file.name}</li>)}</ol>
        <p>A IA mostra o que entendeu em cada foto e propõe o tipo de página PRESYS. Você confere tudo antes de aplicar.</p>
        {stage.notice && <p className="ai-chat-note">{stage.notice}</p>}
        <p className="ai-chat-note">{SKETCH_SEND_NOTICE}</p>
      </div>
    </ChatCard>;
  }
  if (stage.kind === 'working') return <Working controller={controller} pages={stage.pages} />;
  if (stage.kind === 'applied') return <AppliedCard controller={controller} stage={stage} document={document} />;
  return <Review controller={controller} document={document} activePageId={activePageId} sources={sources} stage={stage} />;
}
