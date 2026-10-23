import type { CatalogDocument } from '../domain';
import type { PresysArchetypeSlotFill } from '../library/presys-archetypes';
import type { DraftFactSet } from './draft-compiler';
import type { IntakeEntry } from './intake/intake-model';
import { sourceChoiceProblem, sourceHasHeader, sourceTableCells, suggestSourceColumns } from './intake/source-table-insert';
import { compilePagePlan, type CompiledPagePlan, type PagePlanEntry } from './page-plan-apply';
import { isSourceNote, sketchTextParts, type SketchDataSource, type SketchPagePlan, type SketchRegion, type SketchRegionKind } from './sketch-plan';
import { sketchReadingOrder, sketchTemplate, type SketchSnapPlan, type SketchTemplateId } from './sketch-snap';

/**
 * Modo rascunho, review screen (pure): what each drawn area becomes on the PRESYS page, the person's choices, and
 * the page plan that "Aplicar" sends through the same door as the whole-catalog plan (page-plan-apply.ts, ONE
 * transaction, ONE Desfazer).
 *
 * Never invents a value: a text field gets only what is written on the sketch (or what the person typed), and a
 * text with any digit enters only after the person clicks "Os números estão certos" — until then it stays
 * "A COMPLETAR". A drawn table enters empty (the model's own "A COMPLETAR" table) or filled only from a file already
 * checked in this conversation: a spreadsheet read cell by cell on this computer, or the specification table read
 * from a PDF with every value checked against the PDF's own text. The drawing never fills a table.
 */

export const SKETCH_KIND_LABELS: Readonly<Record<SketchRegionKind, string>> = Object.freeze({
  logo: 'Logotipo', title: 'Título', subtitle: 'Subtítulo', paragraph: 'Texto', image: 'Foto', table: 'Tabela', pill: 'Pílula',
  callout: 'Chamada', band: 'Faixa colorida', list: 'Lista', bar: 'Barra de modelos', note: 'Nota',
});
/** One colour per kind of area, as in the explanation PDF of the Modo rascunho (all readable on white). */
export const SKETCH_KIND_COLORS: Readonly<Record<SketchRegionKind, string>> = Object.freeze({
  logo: '#6a2c91', title: '#00796b', subtitle: '#2e7d32', paragraph: '#0b6e8a', image: '#d35400', table: '#283593',
  pill: '#ad1457', callout: '#c62828', band: '#1565c0', list: '#00838f', bar: '#5d4037', note: '#00897b',
});

/** Number of each area on the photo, in reading order (top to bottom, left to right). */
export function sketchRegionNumbers(plan: Pick<SketchPagePlan, 'regions'>): ReadonlyMap<string, number> {
  return new Map(sketchReadingOrder(plan.regions).map((region, index) => [region.id, index + 1]));
}

export type SketchFieldKind = 'text' | 'table' | 'image' | 'brand';
/** One field of the chosen page model that some drawn area feeds. */
export interface SketchField {
  /** The slot id ("P4.title", "C1.modelo-2"): unique on a page. */
  readonly key: string;
  readonly label: string;
  readonly kind: SketchFieldKind;
  readonly regionIds: readonly string[];
  /** What is written on the sketch for this field, exactly as read ('' when nothing). */
  readonly sketchText: string;
  /** What the drawing asks for ("foto do PCON-Y17", "do PDF"). */
  readonly instruction: string;
  /** A list drawn on paper. */
  readonly list: boolean;
  /** Tables: where the sketch says the data comes from; a suggestion the person still confirms. */
  readonly suggestedSource: SketchDataSource | null;
}

const joined = (values: readonly string[], separator: string) => [...new Set(values.map(value => value.trim()).filter(Boolean))].join(separator);

export function sketchFields(plan: SketchPagePlan, snap: SketchSnapPlan): SketchField[] {
  const byId = new Map(plan.regions.map(region => [region.id, region]));
  const template = sketchTemplate(snap.archetypeId);
  return snap.assignments.map(assignment => {
    const regions = assignment.regionIds.map(id => byId.get(id)).filter((region): region is SketchRegion => Boolean(region));
    const label = template.slots.find(slot => slot.id === assignment.slotId)?.label ?? assignment.slotId;
    const kind: SketchFieldKind = assignment.kind === 'table' ? 'table' : assignment.kind === 'image' ? 'image'
      : regions.every(region => region.kind === 'logo') ? 'brand' : 'text';
    const sketchText = kind !== 'text' ? joined(regions.map(region => region.text), ' · ')
      : assignment.textPart !== undefined ? (sketchTextParts(regions[0]?.text ?? '')[assignment.textPart] ?? '')
        : joined(regions.map(region => region.text), '\n');
    const question = snap.questions.find(item => item.kind === 'table-source' && item.slotId === assignment.slotId);
    return {
      key: assignment.slotId, label, kind, regionIds: assignment.regionIds, sketchText,
      instruction: joined(regions.map(region => region.instruction), '; '), list: regions.some(region => region.kind === 'list'),
      suggestedSource: question?.kind === 'table-source' ? question.suggested : null,
    };
  });
}

/** Areas that do not feed a field: decoration of the model, a "do PDF" note, or what the model has no place for. */
export interface SketchRegionNote {
  readonly regionId: string;
  readonly kind: 'decoration' | 'source-note' | 'unassigned';
  readonly text: string;
}
export function sketchRegionNotes(plan: SketchPagePlan, snap: SketchSnapPlan): SketchRegionNote[] {
  const byId = new Map(plan.regions.map(region => [region.id, region]));
  const said = (region: SketchRegion) => region.text.trim() || region.instruction.trim();
  const notes: SketchRegionNote[] = [];
  for (const id of snap.decorativeRegionIds) {
    notes.push({ regionId: id, kind: 'decoration', text: `${SKETCH_KIND_LABELS[byId.get(id)?.kind ?? 'band']}: já faz parte do modelo.` });
  }
  for (const id of snap.sourceNoteRegionIds) {
    const region = byId.get(id);
    notes.push({ regionId: id, kind: 'source-note', text: `“${region ? said(region) : ''}”: lido como a fonte dos dados da tabela.` });
  }
  for (const id of snap.unassignedRegionIds) {
    const region = byId.get(id);
    if (!region) continue;
    const text = said(region);
    notes.push({ regionId: id, kind: 'unassigned',
      text: `${SKETCH_KIND_LABELS[region.kind]}${text ? ` “${text}”` : ''}: este modelo de página não tem lugar para isto; fica de fora.` });
  }
  const order = sketchRegionNumbers(plan);
  return notes.sort((left, right) => (order.get(left.regionId) ?? 0) - (order.get(right.regionId) ?? 0));
}

/* ------------------------------------------------------------------------------------------------ choices */

export interface SketchTextChoice {
  readonly text: string;
  /** The exact text whose digits the person confirmed ("Os números estão certos"). */
  readonly confirmedText?: string;
}
/** Table source chosen for a field: a source id, or this one (the model's empty table). */
export const LEAVE_TO_FILL = 'deixar';
export interface SketchPageChoices {
  readonly template: SketchTemplateId;
  readonly texts: Readonly<Record<string, SketchTextChoice>>;
  readonly tables: Readonly<Record<string, string>>;
}

/** The sketch's own text in each text field (a "do PDF" note is not content), every table left to fill. */
export function defaultSketchChoices(fields: readonly SketchField[], template: SketchTemplateId): SketchPageChoices {
  const texts: Record<string, SketchTextChoice> = {};
  const tables: Record<string, string> = {};
  for (const field of fields) {
    if (field.kind === 'text') texts[field.key] = { text: isSourceNote(field.sketchText) ? '' : field.sketchText };
    if (field.kind === 'table') tables[field.key] = LEAVE_TO_FILL;
  }
  return { template, texts, tables };
}

export interface SketchDigit { readonly value: string; readonly start: number; readonly end: number }
/** Every run of digits (any script, superscripts included), as sketch-plan.ts marks them. */
export function sketchDigits(text: string): SketchDigit[] {
  return [...text.matchAll(/\p{N}+/gu)].map(match => ({ value: match[0], start: match.index!, end: match.index! + match[0].length }));
}
export type SketchTextState = 'empty' | 'to-confirm' | 'ok';
/** 'to-confirm': it has a digit the person has not confirmed yet, so it enters as "A COMPLETAR". */
export function sketchTextState(choice: SketchTextChoice | undefined): SketchTextState {
  const text = choice?.text.trim() ?? '';
  if (!text) return 'empty';
  return /\p{N}/u.test(text) && choice!.confirmedText !== choice!.text ? 'to-confirm' : 'ok';
}

/* ------------------------------------------------------------------------------------------------ table sources */

export type SketchTableSource =
  | {
    readonly id: string; readonly kind: 'planilha'; readonly label: string;
    readonly header?: readonly string[]; readonly rows: readonly (readonly string[])[];
    /** Why this sheet cannot fill a table (too many columns or rows, empty). */
    readonly problem?: string;
  }
  | { readonly id: string; readonly kind: 'pdf'; readonly label: string; readonly set: DraftFactSet };

/** Tables of the spreadsheets attached in this conversation, read cell by cell on this computer (no AI). */
export function spreadsheetSketchSources(entries: readonly IntakeEntry[]): SketchTableSource[] {
  return entries.filter(entry => entry.kind === 'spreadsheet' && (entry.state === 'ready' || entry.state === 'needs-help'))
    .flatMap(entry => (entry.intake?.blocks ?? []).flatMap(block => {
      if (block.kind !== 'table') return [];
      const choice = { block, columns: suggestSourceColumns(block), header: sourceHasHeader(block) };
      const problem = sourceChoiceProblem(choice);
      const cells = problem ? [] : sourceTableCells(choice);
      return [{ id: `planilha:${entry.id}:${block.id}`, kind: 'planilha' as const, label: `Planilha ${block.title}`,
        ...(choice.header && cells.length ? { header: cells[0] } : {}), rows: choice.header ? cells.slice(1) : cells,
        ...(problem ? { problem } : {}) }];
    }));
}
/** The specification table read from a PDF in this conversation, every value checked against the PDF's text. */
export function factSetSketchSource(id: string, set: DraftFactSet): SketchTableSource {
  const files = Object.values(set.sourceNames).filter(Boolean);
  return { id, kind: 'pdf', set,
    label: `Tabela de especificações conferida no PDF${files.length ? ` (${files.join(', ')})` : ''}` };
}
/**
 * Sources offered for one table field: spreadsheets for any table; the checked PDF table only for the specification
 * table of P4 (it becomes the compiler's own table, with its pending values, FR-68/69).
 */
export function sketchSourcesFor(fieldKey: string, sources: readonly SketchTableSource[]): SketchTableSource[] {
  return sources.filter(source => source.kind === 'planilha' || fieldKey === 'P4.specs');
}

/* ------------------------------------------------------------------------------------------------ page plan */

export interface SketchPageInput {
  readonly key: string;
  readonly snap: SketchSnapPlan;
  readonly fields: readonly SketchField[];
  readonly choices: SketchPageChoices;
}
export interface SketchPageOutcome {
  readonly key: string;
  readonly template: SketchTemplateId;
  readonly entry: PagePlanEntry;
  /** Fields that enter with the sketch's (or the person's) text. */
  readonly filled: readonly string[];
  /** Fields with digits not confirmed yet: they stay "A COMPLETAR". */
  readonly toConfirm: readonly string[];
  /** Fields left for the person ("A COMPLETAR"). */
  readonly toFill: readonly string[];
  /** Photo fields to choose on the page later. */
  readonly photos: readonly string[];
  readonly tables: readonly { readonly label: string; readonly source: SketchTableSource | null }[];
  /** A chosen source that is no longer in the conversation: the table enters empty. */
  readonly missingSources: readonly string[];
}

export function sketchPageOutcome(page: SketchPageInput, sources: readonly SketchTableSource[]): SketchPageOutcome {
  const fills: Record<string, PresysArchetypeSlotFill> = {};
  const filled: string[] = [], toConfirm: string[] = [], toFill: string[] = [], photos: string[] = [], missingSources: string[] = [];
  const tables: { label: string; source: SketchTableSource | null }[] = [];
  let pdf: DraftFactSet | undefined;
  for (const field of page.fields) {
    if (field.kind === 'brand') continue;
    if (field.kind === 'image') { photos.push(field.label); continue; }
    if (field.kind === 'table') {
      const chosen = page.choices.tables[field.key] ?? LEAVE_TO_FILL;
      const source = chosen === LEAVE_TO_FILL ? null : sketchSourcesFor(field.key, sources).find(item => item.id === chosen) ?? null;
      if (chosen !== LEAVE_TO_FILL && !source) missingSources.push(field.label);
      if (source?.kind === 'planilha' && !source.problem) {
        fills[field.key] = { kind: 'table', ...(source.header ? { header: source.header } : {}), rows: source.rows };
      } else if (source?.kind === 'pdf') {
        pdf = source.set;
      }
      tables.push({ label: field.label, source: source?.kind === 'planilha' && source.problem ? null : source });
      continue;
    }
    const choice = page.choices.texts[field.key];
    const state = sketchTextState(choice);
    if (state === 'empty') { toFill.push(field.label); continue; }
    if (state === 'to-confirm') { toConfirm.push(field.label); continue; }
    fills[field.key] = { kind: 'text', text: choice!.text.trim() };
    filled.push(field.label);
  }
  // The checked PDF table is the compiler's own table (only values checked in the PDF; long tables continue on new
  // pages); the page title written on the sketch becomes its title.
  const title = fills['P4.title']?.kind === 'text' ? fills['P4.title'].text : undefined;
  const entry: PagePlanEntry = pdf && page.choices.template === 'P4'
    ? { kind: 'spec-table', key: page.key, set: title ? { ...pdf, title } : pdf }
    : { kind: 'template', key: page.key, template: page.choices.template, fills };
  return { key: page.key, template: page.choices.template, entry, filled, toConfirm, toFill, photos, tables, missingSources };
}

export type SketchCompiled = { readonly ok: true; readonly compiled: CompiledPagePlan } | { readonly ok: false; readonly message: string };
/** The pages as "Aplicar" would insert them now, after the page open in the editor (the empty page of a new catalog is replaced). */
export function compileSketchPages(document: CatalogDocument, outcomes: readonly SketchPageOutcome[], activePageId?: string): SketchCompiled {
  if (!outcomes.length) return { ok: false, message: 'Nenhuma página ficou para criar. Inclua ao menos uma página.' };
  try {
    return { ok: true, compiled: compilePagePlan(document, outcomes.map(outcome => outcome.entry), activePageId ? { afterPageId: activePageId } : {}) };
  } catch {
    return { ok: false, message: 'Não foi possível montar as páginas com segurança. Nada foi alterado no catálogo.' };
  }
}

/** "Páginas do rascunho criadas: 2 páginas, nas páginas 2 e 3. …" */
export function sketchAppliedMessage(document: CatalogDocument, pageIds: readonly string[], toConfirm: number): string {
  const numbers = pageIds.map(id => document.pages.findIndex(page => page.id === id) + 1).filter(n => n > 0).sort((a, b) => a - b);
  const where = numbers.length === 1 ? `na página ${numbers[0]}`
    : numbers.every((n, index) => index === 0 || n === numbers[index - 1] + 1) ? `nas páginas ${numbers[0]} a ${numbers.at(-1)}`
      : `nas páginas ${numbers.slice(0, -1).join(', ')} e ${numbers.at(-1)}`;
  const count = numbers.length === 1 ? '1 página' : `${numbers.length} páginas`;
  const pending = toConfirm === 0 ? '' : toConfirm === 1 ? ' 1 campo com números não conferidos ficou “A COMPLETAR”.'
    : ` ${toConfirm} campos com números não conferidos ficaram “A COMPLETAR”.`;
  return `Páginas do rascunho criadas: ${count}, ${where}.${pending} Os campos com “A COMPLETAR” ficam para você. Use Desfazer se precisar.`;
}
