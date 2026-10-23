import React from 'react';
import { ChatCard } from './chat/ChatCard';
import { describeLocalAction, type LocalChoice } from '../arsenal/local-router';
import { ARSENAL_CATEGORY_LABELS, ARSENAL_LIMITS, type ArsenalPresetSummary } from '../arsenal/contracts';

/**
 * Onda 4.5 — the arsenal inside the assistant's conversation.
 * - `ArsenalChoiceCard`: what the router without AI found ("Achei no arsenal, sem usar IA" / "Posso fazer isto sem usar
 *   IA"), or the preset the AI pointed at ("A IA achou no arsenal"). Usar / Ver outros / Pedir à IA. Using never calls
 *   the AI and enters as one Desfazer.
 * - `SaveToArsenalCard`: "Guardar no arsenal?" after the AI built a page; the person confirms name and category.
 */

export const ARSENAL_CARD_LABEL = 'Arsenal, sem usar IA';
export const SAVE_TO_ARSENAL_LABEL = 'Guardar no arsenal';

export function localChoiceTitle(choice: LocalChoice, presets: readonly ArsenalPresetSummary[] = []): string {
  if (choice.kind === 'action') return describeLocalAction(choice.action);
  const preset = presets.find(entry => entry.id === choice.presetId);
  return preset?.name ?? choice.name;
}

function choiceDetail(choice: LocalChoice, presets: readonly ArsenalPresetSummary[]): string {
  if (choice.kind === 'action') {
    return choice.action.type === 'page.template' ? 'Modelo PRESYS, página nova depois da página aberta'
      : choice.action.type === 'page.blank' ? 'Página nova depois da página aberta'
      : choice.action.type === 'table.new' ? 'Tabela vazia na página aberta' : 'Na página aberta';
  }
  const preset = presets.find(entry => entry.id === choice.presetId);
  const author = (preset?.scope ?? choice.scope) === 'builtin' ? 'modelo PRESYS (só leitura)'
    : preset?.createdByName ? `guardado por ${preset.createdByName}` : undefined;
  return [ARSENAL_CATEGORY_LABELS[choice.category], author].filter(Boolean).join(' · ');
}

/** The sentence the assistant says when the card appears. */
export function localChoiceIntro(choice: LocalChoice, presets: readonly ArsenalPresetSummary[] = []): string {
  return choice.kind === 'preset'
    ? `Achei no arsenal, sem usar IA: “${localChoiceTitle(choice, presets)}” (${ARSENAL_CATEGORY_LABELS[choice.category]}). Confira e use “Usar”.`
    : `Posso fazer isto sem usar IA: ${localChoiceTitle(choice)}. Confira e aplique.`;
}

interface ChoiceCardProps {
  readonly primary: LocalChoice;
  readonly others: readonly LocalChoice[];
  /** `local`: found here without the AI. `ai`: the AI pointed at this preset. */
  readonly source: 'local' | 'ai';
  readonly presets?: readonly ArsenalPresetSummary[];
  readonly renderThumbnail?: (preset: ArsenalPresetSummary) => React.ReactNode;
  readonly busy?: boolean;
  readonly onUse: (choice: LocalChoice) => void;
  /** Sends the same request to the AI (only for what was found without it). */
  readonly onAskAi?: () => void;
  /** Opens the arsenal gallery (shown under "Ver outros"). */
  readonly onOpenGallery?: () => void;
  readonly onDiscard: () => void;
  readonly cardRef?: React.Ref<HTMLDivElement>;
}

function ChoiceLine({ choice, presets, renderThumbnail }: {
  readonly choice: LocalChoice;
  readonly presets: readonly ArsenalPresetSummary[];
  readonly renderThumbnail?: (preset: ArsenalPresetSummary) => React.ReactNode;
}) {
  const preset = choice.kind === 'preset' ? presets.find(entry => entry.id === choice.presetId) : undefined;
  return <span className="ai-chat-arsenal-choice">
    {preset && renderThumbnail ? <span className="ai-chat-arsenal-thumb" aria-hidden="true">{renderThumbnail(preset)}</span> : null}
    <span><strong>{localChoiceTitle(choice, presets)}</strong><br /><small>{choiceDetail(choice, presets)}</small></span>
  </span>;
}

export function ArsenalChoiceCard({ primary, others, source, presets = [], renderThumbnail, busy, onUse, onAskAi,
  onOpenGallery, onDiscard, cardRef }: ChoiceCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const verb = (choice: LocalChoice) => choice.kind === 'preset' ? 'Usar' : 'Aplicar';
  const title = source === 'ai' ? 'A IA achou no arsenal'
    : primary.kind === 'preset' ? 'Achei no arsenal, sem usar IA' : 'Posso fazer isto sem usar IA';
  const canSeeMore = others.length > 0 || Boolean(onOpenGallery);
  return (
    <ChatCard label={ARSENAL_CARD_LABEL} title={title} cardRef={cardRef}
      actions={<>
        <button type="button" className="vnext-btn-primary" disabled={busy} onClick={() => onUse(primary)}>{verb(primary)}</button>
        {canSeeMore && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>Ver outros</button>}
        {onAskAi && <button type="button" disabled={busy} onClick={onAskAi}>Pedir à IA</button>}
        <button type="button" onClick={onDiscard}>Descartar</button>
      </>}>
      <p data-arsenal-primary=""><ChoiceLine choice={primary} presets={presets} renderThumbnail={renderThumbnail} /></p>
      {expanded && <div data-arsenal-others="">
        {others.length > 0 ? <ul className="ai-chat-arsenal-others">{others.map((choice, index) => <li key={index}>
          <ChoiceLine choice={choice} presets={presets} renderThumbnail={renderThumbnail} />
          <button type="button" disabled={busy} onClick={() => onUse(choice)}
            aria-label={`${verb(choice)} ${localChoiceTitle(choice, presets)}`}>{verb(choice)}</button>
        </li>)}</ul> : <p>Não achei outro parecido.</p>}
        {onOpenGallery && <button type="button" className="ai-chat-link" onClick={onOpenGallery}>Abrir o arsenal</button>}
      </div>}
      <small>{primary.kind === 'preset' || source === 'ai'
        ? 'Usar não gasta IA. Entra como um passo só: um Desfazer volta ao que era.'
        : 'Feito aqui, sem gastar IA. Entra como um passo só: um Desfazer volta ao que era.'}</small>
    </ChatCard>
  );
}

export interface SaveToArsenalPage {
  readonly pageId: string;
  /** What the AI called the page (its heading): the suggested name. */
  readonly heading: string;
  readonly type: 'cover' | 'section' | 'comparison';
}

interface SaveCardProps {
  readonly pages: readonly SaveToArsenalPage[];
  readonly busy?: boolean;
  readonly error?: string;
  readonly onSave: (pageId: string, name: string, category: 'capas' | 'paginas') => void;
  readonly onDismiss: () => void;
}

const suggestedName = (page: SaveToArsenalPage | undefined) => (page?.heading ?? '').replace(/\s+/g, ' ').trim()
  .slice(0, ARSENAL_LIMITS.nameMaxChars).trim();
const suggestedCategory = (page: SaveToArsenalPage | undefined): 'capas' | 'paginas' => page?.type === 'cover' ? 'capas' : 'paginas';

/** "Guardar no arsenal?": the AI built something new; the person keeps it for the whole team with a name and category. */
export function SaveToArsenalCard({ pages, busy, error, onSave, onDismiss }: SaveCardProps) {
  const [pageId, setPageId] = React.useState(pages[0]?.pageId ?? '');
  const page = pages.find(entry => entry.pageId === pageId) ?? pages[0];
  const [name, setName] = React.useState(() => suggestedName(page));
  const [category, setCategory] = React.useState<'capas' | 'paginas'>(() => suggestedCategory(page));
  const choosePage = (next: string) => {
    const chosen = pages.find(entry => entry.pageId === next);
    setPageId(next);
    setName(suggestedName(chosen));
    setCategory(suggestedCategory(chosen));
  };
  const trimmed = name.trim();
  return (
    <ChatCard label={SAVE_TO_ARSENAL_LABEL} title="Guardar no arsenal?"
      actions={<>
        <button type="button" className="vnext-btn-primary" disabled={busy || !trimmed || !page}
          onClick={() => page && onSave(page.pageId, trimmed, category)}>Guardar no arsenal</button>
        <button type="button" onClick={onDismiss}>Agora não</button>
      </>}>
      <p>A IA montou {pages.length > 1 ? 'estas páginas' : 'esta página'}. Guarde no arsenal para a equipe usar de novo, sem gastar IA.</p>
      <div className="ai-chat-arsenal-form">
        {pages.length > 1 && <label>Página
          <select value={page?.pageId} onChange={event => choosePage(event.target.value)}>
            {pages.map((entry, index) => <option key={entry.pageId} value={entry.pageId}>{`Página ${index + 1}: ${entry.heading}`}</option>)}
          </select>
        </label>}
        <label>Nome
          <input type="text" value={name} maxLength={ARSENAL_LIMITS.nameMaxChars} onChange={event => setName(event.target.value)} />
        </label>
        <label>Categoria
          <select value={category} onChange={event => setCategory(event.target.value as 'capas' | 'paginas')}>
            <option value="capas">{ARSENAL_CATEGORY_LABELS.capas}</option>
            <option value="paginas">{ARSENAL_CATEGORY_LABELS.paginas}</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <small>Tabelas vão sem os valores técnicos: as células ficam vazias, e os valores vêm do PDF.</small>
    </ChatCard>
  );
}
