/**
 * Modo rascunho (Onda 4): fits a validated sketch plan (sketch-plan.ts) to the PRESYS page models that already
 * exist — the nine archetypes P1–P9 (library/presys-archetypes.ts) and the "Capa de produto — PCON" (C1,
 * library/presys-cover-pcon.ts). Pure and deterministic; it only reads those modules.
 *
 * The sketch only chooses the model, which drawn region feeds which declared field, and the reading order. The
 * boxes are used ONLY for order and column, never as positions: the page builders own all geometry. Nothing here
 * fills a field or copies a value; the screen reads each region's text from the plan, where every digit is
 * already marked "confirmar". Questions are only real layout ambiguities and, for each table, where its data
 * comes from.
 */
import { PRESYS_ARCHETYPES, type PresysArchetypeId, type PresysArchetypeSlot, type PresysArchetypeSlotKind } from '../library/presys-archetypes';
import { PRESYS_PCON_COVER } from '../library/presys-cover-pcon';
import {
  SKETCH_ARCHETYPES, isLayoutQuestion, isSourceNote, sketchSourceHint, sketchTextParts,
  type SketchDataSource, type SketchPagePlan, type SketchRegion, type SketchRegionKind,
} from './sketch-plan';

/** The nine archetypes and the PCON product cover. */
export type SketchTemplateId = PresysArchetypeId | 'C1';
export type SketchColumn = 'left' | 'right' | 'full';
export interface SketchReadingGroup {
  readonly id: string;
  readonly kind: 'region' | 'accessory-item';
  readonly regionIds: readonly string[];
  readonly column: SketchColumn;
}
/** Proposed source regions for a declared slot, not a fill or a verified technical value. */
export interface SketchSlotAssignment {
  readonly slotId: string;
  readonly kind: PresysArchetypeSlotKind;
  readonly regionIds: readonly string[];
  readonly readingOrder: number;
  readonly column: SketchColumn;
  /** Index into `sketchTextParts(region.text)` when one drawn bar feeds several slots (C1 model bar). */
  readonly textPart?: number;
}
export interface SketchSourceOption { readonly id: SketchDataSource; readonly label: string }
export const SKETCH_SOURCE_OPTIONS: readonly SketchSourceOption[] = Object.freeze([
  { id: 'pdf', label: 'De um PDF da PRESYS' },
  { id: 'planilha', label: 'De uma planilha do Excel' },
  { id: 'manual', label: 'Vou digitar os dados' },
]);
export type SketchQuestion =
  | { readonly id: string; readonly kind: 'layout'; readonly text: string; readonly questionIndex: number }
  | {
    readonly id: string; readonly kind: 'table-source'; readonly text: string; readonly slotId: string;
    readonly regionIds: readonly string[];
    /** What the sketch itself says ("do PDF"): a suggestion the person still confirms. */
    readonly suggested: SketchDataSource | null;
    readonly options: readonly SketchSourceOption[];
  };
export interface SketchSnapPlan {
  readonly archetypeId: SketchTemplateId;
  /** Page template to build (`presys-p4-especificacoes`, `presys-capa-produto-pcon`, ...). */
  readonly templateId: string;
  readonly label: string;
  readonly proposedArchetypeId: PresysArchetypeId;
  /** The drawn structure agrees with the model's proposal (a cover proposal fits P1 or C1). */
  readonly proposalMatches: boolean;
  readonly alternatives: readonly SketchTemplateId[];
  readonly assignments: readonly SketchSlotAssignment[];
  readonly groups: readonly SketchReadingGroup[];
  /** Drawn decoration the cover model already has (coloured band): not a field, nothing to fill. */
  readonly decorativeRegionIds: readonly string[];
  /** Notes such as "do PDF" next to a table: read as that table's source, not as a field. */
  readonly sourceNoteRegionIds: readonly string[];
  readonly unassignedRegionIds: readonly string[];
  readonly missingSlotIds: readonly string[];
  readonly questions: readonly SketchQuestion[];
  readonly warnings: readonly string[];
  /** Always a proposal, even when the structural checks agree with the model. */
  readonly requiresConfirmation: true;
}

interface SketchTemplate {
  readonly id: SketchTemplateId; readonly templateId: string; readonly label: string; readonly slots: readonly PresysArchetypeSlot[];
}
const TEMPLATES: readonly SketchTemplate[] = Object.freeze([
  ...PRESYS_ARCHETYPES.map(item => ({ id: item.id, templateId: item.templateId, label: item.label, slots: item.slots })),
  { id: 'C1' as const, templateId: PRESYS_PCON_COVER.templateId, label: PRESYS_PCON_COVER.label, slots: PRESYS_PCON_COVER.slots },
]);
export function sketchTemplate(id: SketchTemplateId): SketchTemplate {
  return TEMPLATES.find(item => item.id === id)!;
}

const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
const top = (region: SketchRegion) => region.normalizedBox[0];
const bottom = (region: SketchRegion) => region.normalizedBox[2];
const height = (region: SketchRegion) => bottom(region) - top(region);
const centerY = (region: SketchRegion) => (top(region) + bottom(region)) / 2;
const centerX = (region: SketchRegion) => (region.normalizedBox[1] + region.normalizedBox[3]) / 2;
export function sketchRegionColumn(region: SketchRegion): SketchColumn {
  const [, left, , right] = region.normalizedBox;
  return right - left >= 0.65 || (left < 0.35 && right > 0.65) ? 'full' : centerX(region) < 0.5 ? 'left' : 'right';
}
const idCompare = (a: SketchRegion, b: SketchRegion) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true });
/** Two regions of similar height side by side (the pills of one row, even on a slightly rotated photo). */
const sameLine = (a: SketchRegion, b: SketchRegion) =>
  Math.min(bottom(a), bottom(b)) - Math.max(top(a), top(b)) >= 0.5 * Math.max(height(a), height(b));
/** Reading order: lines from top to bottom, each line from left to right. Deterministic. */
export function sketchReadingOrder(regions: readonly SketchRegion[]): SketchRegion[] {
  const lines: SketchRegion[][] = [];
  for (const region of [...regions].sort((a, b) => top(a) - top(b) || a.normalizedBox[1] - b.normalizedBox[1] || idCompare(a, b))) {
    const line = lines.find(items => items.every(other => sameLine(other, region)));
    if (line) line.push(region); else lines.push([region]);
  }
  return lines
    .map(line => line.sort((a, b) => a.normalizedBox[1] - b.normalizedBox[1] || top(a) - top(b) || idCompare(a, b)))
    .sort((a, b) => Math.min(...a.map(top)) - Math.min(...b.map(top)) || idCompare(a[0], b[0]))
    .flat();
}
const textKind = (kind: SketchRegionKind) => !['image', 'logo', 'table', 'band'].includes(kind);

function sameAccessoryRow(image: SketchRegion, text: SketchRegion): boolean {
  const [imageTop, , imageBottom, imageRight] = image.normalizedBox;
  const [textTop, textLeft, textBottom] = text.normalizedBox;
  const overlap = Math.min(imageBottom, textBottom) - Math.max(imageTop, textTop);
  const minHeight = Math.min(imageBottom - imageTop, textBottom - textTop);
  return textLeft >= imageRight - 0.03 && centerX(text) > centerX(image)
    && (overlap >= minHeight * 0.4 || Math.abs(centerY(image) - centerY(text)) <= 0.04);
}

/** Spike §5.4: an accessory row comes as one `list` or as image + subtitle + paragraph; both are one item. */
export function groupSketchRegions(plan: SketchPagePlan): readonly SketchReadingGroup[] {
  const ordered = sketchReadingOrder(plan.regions);
  const rank = new Map(ordered.map((region, index) => [region.id, index]));
  const imageRows = ordered.filter(region => region.kind === 'image' && sketchRegionColumn(region) === 'left')
    .map(image => ({ image, texts: [] as SketchRegion[] }));
  for (const region of ordered.filter(item => textKind(item.kind) && !['title', 'note', 'bar'].includes(item.kind))) {
    const closest = imageRows.filter(row => sameAccessoryRow(row.image, region))
      .sort((left, right) => Math.abs(centerY(left.image) - centerY(region)) - Math.abs(centerY(right.image) - centerY(region)))[0];
    if (closest) closest.texts.push(region);
  }
  const grouped = imageRows.filter(row => row.texts.length > 0).map(row => ({
    anchor: row.image, kind: 'accessory-item' as const,
    regions: [row.image, ...row.texts.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)],
  }));
  const used = new Set(grouped.flatMap(group => group.regions.map(region => region.id)));
  const all = [
    ...grouped,
    ...ordered.filter(region => !used.has(region.id)).map(region => ({
      anchor: region, kind: region.kind === 'list' ? 'accessory-item' as const : 'region' as const, regions: [region],
    })),
  ].sort((left, right) => rank.get(left.anchor.id)! - rank.get(right.anchor.id)!);
  return all.map((group, index) => ({
    id: `group-${index + 1}`, kind: group.kind, regionIds: group.regions.map(region => region.id),
    column: group.regions.length > 1 ? 'full' : sketchRegionColumn(group.anchor),
  }));
}

interface Candidate { readonly id: SketchTemplateId; readonly matches: boolean; readonly score: number }
function structuralCandidates(plan: SketchPagePlan, groups: readonly SketchReadingGroup[]): Candidate[] {
  const count = (kind: SketchRegionKind) => plan.regions.filter(region => region.kind === kind).length;
  const image = count('image'), table = count('table'), title = count('title'), logo = count('logo');
  const body = count('paragraph'), subtitle = count('subtitle'), list = count('list');
  const pill = count('pill'), callout = count('callout');
  const modelBar = plan.regions.some(region => region.kind === 'bar' && sketchTextParts(region.text).length >= 2);
  const rows = groups.filter(group => group.kind === 'accessory-item' && group.regionIds.length > 1).length;
  const labels = folded(plan.regions.map(region => `${region.text} ${region.instruction}`).join(' '));
  const hints = {
    code: /codigo|pedido|campo|exemplo/u.test(labels), accessories: /acessorio|fornecimento/u.test(labels),
    inserts: /inserto|furos/u.test(labels), ranges: /faixas|entradas|exatidao/u.test(labels),
  };
  const cover = title >= 1 && image >= 1;
  return [
    { id: 'P1', matches: cover, score: 35 + (logo ? 8 : 0) + (pill ? 10 : 0) },
    // The PCON cover: callouts pointing at the photo, pills and the family bar are what P1 does not have.
    { id: 'C1', matches: cover && ((callout >= 1 && pill >= 1) || pill >= 2 || modelBar),
      score: 40 + Math.min(pill, 6) * 5 + Math.min(callout, 2) * 8 + (modelBar ? 8 : 0) + (logo ? 4 : 0) },
    { id: 'P2', matches: title >= 1 && image >= 1 && body + list >= 1, score: 35 + (list ? 8 : 0) },
    { id: 'P3', matches: image >= 2 && body + subtitle >= 2, score: 45 + Math.min(image, 3) * 3 },
    { id: 'P4', matches: table >= 1, score: 40 + (table === 1 ? 8 : 0) },
    { id: 'P5', matches: table >= 2, score: 50 + (hints.ranges ? 15 : 0) },
    { id: 'P6', matches: table >= 1 && hints.code, score: 65 },
    { id: 'P7', matches: rows >= 2 || (hints.accessories && table + list >= 1), score: 55 + (rows >= 2 ? 15 : 0) + (hints.accessories ? 10 : 0) },
    { id: 'P8', matches: image >= 2 && (hints.inserts || image >= 4), score: 55 + (hints.inserts ? 20 : 0) },
    { id: 'P9', matches: logo >= 1 && body >= 1 && image === 0 && table === 0, score: 50 },
  ];
}

/** Fields declared by the existing models, in priority order per drawn kind; never coordinates. */
const SLOT_ORDER: Readonly<Record<SketchTemplateId, Partial<Record<SketchRegionKind, readonly string[]>>>> = {
  P1: { logo: ['logo'], title: ['family'], subtitle: ['series', 'tagline'], image: ['hero'],
    paragraph: ['tagline'], pill: ['model'], callout: ['tagline'], bar: ['model'], note: ['url'] },
  C1: { logo: ['marca'], title: ['titulo', 'frase-topo'], subtitle: ['subtitulo', 'destaque', 'lado-a-titulo', 'lado-b-titulo'],
    image: ['foto'], callout: ['chamada-1', 'chamada-2'],
    pill: ['pilula-a1', 'pilula-a2', 'pilula-b1', 'pilula-b2', 'pilula-b3', 'pilula-b4'],
    paragraph: ['destaque', 'nota'], list: ['nota'], note: ['nota', 'rodape-1', 'rodape-2'], bar: ['modelo-1'] },
  P2: { title: ['title'], subtitle: ['highlights-title'], paragraph: ['intro', 'highlights'],
    image: ['photo'], list: ['highlights'], callout: ['highlights'], note: ['footer'] },
  P3: { title: ['feature-title', 'second-title'], subtitle: ['feature-caption-1', 'feature-caption-2', 'second-caption'],
    paragraph: ['feature-text', 'second-text'], image: ['feature-image-1', 'feature-image-2', 'second-image'],
    callout: ['callout'], list: ['feature-text', 'second-text'], note: ['footer'] },
  P4: { title: ['title'], subtitle: ['models'], list: ['models'], table: ['specs'], note: ['footer'] },
  P5: { title: ['title'], subtitle: ['general-title'], table: ['ranges', 'general'], note: ['footer'] },
  P6: { title: ['title'], subtitle: ['skeleton'], paragraph: ['example'], table: ['options'], note: ['footer'] },
  P7: { title: ['title'], subtitle: ['accessories-title'], paragraph: ['delivery'], image: ['kit-photo'], table: ['accessories'], note: ['footer'] },
  P8: { title: ['title'], subtitle: ['insert-1-code', 'insert-2-code', 'insert-3-code', 'insert-4-code'],
    image: ['insert-1', 'insert-2', 'insert-3', 'insert-4'], table: ['inserts'], note: ['footer'] },
  P9: { logo: ['logo'], paragraph: ['about', 'legal'], subtitle: ['document-code'], note: ['legal'] },
};
/** Model slots of the C1 family bar (C1.modelo-1 … C1.modelo-6). */
const MAX_BAR_MODELS = 6;

/** Picks the model and its fields. Builds no page and fills nothing: labels and digits stay in the plan. */
export function snapSketchPlan(plan: SketchPagePlan): SketchSnapPlan {
  const proposedArchetypeId = SKETCH_ARCHETYPES.find(item => item.id === plan.archetype)!.presysId;
  const groups = groupSketchRegions(plan);
  const candidates = structuralCandidates(plan, groups).sort((left, right) =>
    Number(right.matches) - Number(left.matches) || right.score - left.score || left.id.localeCompare(right.id));
  // A cover proposal may land on either cover model; the drawn structure decides which.
  const family: readonly SketchTemplateId[] = proposedArchetypeId === 'P1' ? ['P1', 'C1'] : [proposedArchetypeId];
  const inFamily = candidates.find(candidate => candidate.matches && family.includes(candidate.id));
  const proposalMatches = Boolean(inFamily);
  // A sparse sketch still needs review; when no rule passes, the proposal is kept instead of a guess.
  const archetypeId: SketchTemplateId = inFamily?.id ?? candidates.find(candidate => candidate.matches)?.id ?? proposedArchetypeId;
  const template = sketchTemplate(archetypeId);
  const alternatives = candidates.filter(candidate => candidate.id !== archetypeId).slice(0, 2).map(candidate => candidate.id);
  const ordered = sketchReadingOrder(plan.regions);
  const rank = new Map(ordered.map((region, index) => [region.id, index]));
  const byId = new Map(ordered.map(region => [region.id, region]));
  const used = new Set<string>();
  const assignments: SketchSlotAssignment[] = [];
  const warnings: string[] = [];
  const decorativeRegionIds: string[] = [];
  const sourceNotes = new Map<string, string>(); // note region id -> nearest table region id

  const assign = (suffix: string, regions: readonly SketchRegion[], options: { readonly append?: boolean; readonly textPart?: number } = {}) => {
    const slot = template.slots.find(item => item.id === `${archetypeId}.${suffix}`);
    const previous = assignments.findIndex(item => item.slotId === slot?.id);
    if (!slot || !regions.length || (previous >= 0 && !options.append)) return false;
    const regionIds = [...(previous >= 0 ? assignments[previous].regionIds : []), ...regions.map(region => region.id)];
    const columns = new Set(regionIds.map(id => sketchRegionColumn(byId.get(id)!)));
    const assignment: SketchSlotAssignment = {
      slotId: slot.id, kind: slot.kind, regionIds, readingOrder: Math.min(...regionIds.map(id => rank.get(id)!)),
      column: columns.size === 1 ? [...columns][0] : 'full', ...(options.textPart === undefined ? {} : { textPart: options.textPart }),
    };
    if (previous >= 0) assignments[previous] = assignment;
    else assignments.push(assignment);
    regions.forEach(region => used.add(region.id));
    return true;
  };

  // Covers: the coloured band is part of the model's own design.
  if (archetypeId === 'P1' || archetypeId === 'C1') {
    for (const band of ordered.filter(region => region.kind === 'band')) { decorativeRegionIds.push(band.id); used.add(band.id); }
  }
  // A note that only says where data comes from ("do PDF") belongs to the nearest table, not to a field.
  const tables = ordered.filter(region => region.kind === 'table');
  if (tables.length) {
    for (const region of ordered.filter(item => item.kind === 'note' || item.kind === 'callout')) {
      const text = region.text.trim(), instruction = region.instruction.trim();
      const onlySource = (text || instruction) && (!text || isSourceNote(text)) && (!instruction || isSourceNote(instruction));
      if (!onlySource) continue;
      const distance = (table: SketchRegion) => Math.max(0, top(table) - bottom(region), top(region) - bottom(table));
      const nearest = [...tables].sort((a, b) => distance(a) - distance(b) || rank.get(a.id)! - rank.get(b.id)!)[0];
      sourceNotes.set(region.id, nearest.id);
      used.add(region.id);
    }
  }
  // URLs have a dedicated slot on the covers and the back cover (the PCON cover prints it in its footer).
  if (archetypeId === 'P1' || archetypeId === 'P9' || archetypeId === 'C1') {
    const url = ordered.find(region => !used.has(region.id) && textKind(region.kind) && /(?:https?:\/\/|www\.)/iu.test(region.text));
    if (url) assign(archetypeId === 'C1' ? 'rodape-1' : 'url', [url]);
  }
  // C1: the drawn family bar feeds one slot per model name, exactly as written (sketchTextParts).
  if (archetypeId === 'C1') {
    for (const bar of ordered.filter(region => region.kind === 'bar' && !used.has(region.id))) {
      const parts = sketchTextParts(bar.text);
      if (parts.length > MAX_BAR_MODELS) {
        warnings.push(`A barra de modelos do rascunho tem ${parts.length} nomes; este modelo de capa tem lugar para ${MAX_BAR_MODELS}.`);
        used.add(bar.id);
      } else if (parts.length >= 2) {
        parts.forEach((_, index) => assign(`modelo-${index + 1}`, [bar], { textPart: index }));
      }
    }
  }
  if (archetypeId === 'P7') {
    const accessoryRows = groups.filter(group => group.kind === 'accessory-item' && group.regionIds.length > 1);
    if (accessoryRows.length >= 2) {
      for (const group of accessoryRows) {
        assign('accessories', group.regionIds.map(id => byId.get(id)!).filter(region => textKind(region.kind) && !used.has(region.id)),
          { append: true });
      }
      // The existing P7 has one kit photo, not a photo per table row: every row photo stays pending.
      const rowImages = new Set(accessoryRows.flatMap(group => group.regionIds).filter(id => byId.get(id)!.kind === 'image'));
      const kit = ordered.find(region => region.kind === 'image' && !rowImages.has(region.id));
      if (kit) assign('kit-photo', [kit]);
      warnings.push('As fotos de cada acessório precisam ser revistas: este modelo tem só a foto do kit.');
      for (const id of rowImages) used.add(id);
    }
    for (const list of ordered.filter(region => region.kind === 'list' && !used.has(region.id))) {
      assign(/fornec|acompanha|kit/u.test(folded(`${list.text} ${list.instruction}`)) ? 'delivery' : 'accessories', [list], { append: true });
    }
  }
  for (const region of ordered) {
    if (used.has(region.id)) continue;
    // A note right under a table is the table's own note ("notas embaixo"), not the page footer.
    if (region.kind === 'note') {
      const above = assignments.find(item => item.kind === 'table' && item.regionIds.some(id => {
        const table = byId.get(id)!;
        return table.kind === 'table' && top(region) >= bottom(table) - 0.02 && top(region) - bottom(table) <= 0.1;
      }));
      if (above && assign(above.slotId.slice(archetypeId.length + 1), [region], { append: true })) continue;
    }
    for (const suffix of SLOT_ORDER[archetypeId][region.kind] ?? []) {
      if (assign(suffix, [region])) break;
    }
  }
  assignments.sort((left, right) => left.readingOrder - right.readingOrder || (left.textPart ?? 0) - (right.textPart ?? 0)
    || left.slotId.localeCompare(right.slotId));
  const assignedIds = new Set(assignments.flatMap(assignment => assignment.regionIds));
  const unassignedRegionIds = ordered.filter(region => !assignedIds.has(region.id) && !decorativeRegionIds.includes(region.id)
    && !sourceNotes.has(region.id)).map(region => region.id);

  const questions: SketchQuestion[] = [];
  plan.questions.forEach((text, questionIndex) => {
    if (isLayoutQuestion(text)) questions.push({ id: `layout-${questionIndex + 1}`, kind: 'layout', text, questionIndex });
  });
  const pageHints = [...new Set(ordered.flatMap(region => [region.instruction, region.text]).map(sketchSourceHint)
    .filter((hint): hint is SketchDataSource => hint !== null))];
  const tableAssignments = assignments.filter(item => item.kind === 'table');
  for (const assignment of tableAssignments) {
    const own = assignment.regionIds.map(id => byId.get(id)!).flatMap(region => [region.instruction, region.text]);
    const notes = [...sourceNotes].filter(([, table]) => assignment.regionIds.includes(table))
      .flatMap(([note]) => [byId.get(note)!.text, byId.get(note)!.instruction]);
    const hint = [...own, ...notes].map(sketchSourceHint).find((value): value is SketchDataSource => value !== null)
      ?? (tableAssignments.length === 1 && pageHints.length === 1 ? pageHints[0] : null);
    const label = template.slots.find(slot => slot.id === assignment.slotId)!.label;
    questions.push({ id: `fonte-${assignment.slotId}`, kind: 'table-source', text: `De onde vêm os dados da “${label}”?`,
      slotId: assignment.slotId, regionIds: assignment.regionIds, suggested: hint, options: SKETCH_SOURCE_OPTIONS });
  }
  if (!proposalMatches) warnings.push('O tipo de página proposto precisa de confirmação porque a estrutura do rascunho é diferente.');
  if (unassignedRegionIds.length) warnings.push('Algumas partes do rascunho não cabem nos campos deste modelo. Revise as pendências antes de montar a página.');
  return {
    archetypeId, templateId: template.templateId, label: template.label, proposedArchetypeId, proposalMatches, alternatives,
    assignments, groups, decorativeRegionIds, sourceNoteRegionIds: [...sourceNotes.keys()], unassignedRegionIds,
    missingSlotIds: template.slots.filter(slot => !assignments.some(assignment => assignment.slotId === slot.id)).map(slot => slot.id),
    questions, warnings, requiresConfirmation: true,
  };
}
