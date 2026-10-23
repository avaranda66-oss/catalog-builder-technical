import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import type { CatalogDocument, EditorialObject } from '@/vnext/domain';
import { TO_FILL } from '@/vnext/library/presys-archetypes';
import { createPresysPageTemplateRegistry } from '@/vnext/library/presys-ta25n-starter';
import { applyPagePlan, undoPagePlan } from '@/vnext/ai-catalog/page-plan-apply';
import { snapSketchPlan } from '@/vnext/ai-catalog/sketch-snap';
import type { DraftFactSet } from '@/vnext/ai-catalog/draft-compiler';
import {
  LEAVE_TO_FILL, compileSketchPages, defaultSketchChoices, factSetSketchSource, sketchAppliedMessage, sketchDigits,
  sketchFields, sketchPageOutcome, sketchRegionNotes, sketchRegionNumbers, sketchSourcesFor, sketchTextState,
  type SketchPageChoices, type SketchTableSource,
} from '@/vnext/ai-catalog/sketch-review';
import { recordedInterpretation } from './sketch-fixtures';

let serial = 0;
const createId = () => `id-${(++serial).toString(36).padStart(5, '0')}`;
const newSession = () => createDocumentSession(createCatalogDocument(createId, 'Rascunho'), { createId, templateRegistry: createPresysPageTemplateRegistry() });
const plainOf = (object: EditorialObject) => object.type === 'text'
  ? object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')).join('\n') : '';
const texts = (document: CatalogDocument, pageIndex: number) => document.pages[pageIndex].objects.map(plainOf).filter(Boolean);
function cells(document: CatalogDocument, pageIndex: number): string[][] {
  const table = document.pages[pageIndex].objects.find(object => object.type === 'table');
  if (table?.type !== 'table') return [];
  return table.table.rows.map(row => table.table.columns.map(column => {
    const cell = table.table.cells.find(item => item.rowId === row.id && item.columnId === column.id);
    return cell?.content.type === 'richText'
      ? cell.content.value.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')).join(' ') : '';
  }));
}
async function page(fileName: Parameters<typeof recordedInterpretation>[0], key = 'rascunho-1') {
  const interpretation = await recordedInterpretation(fileName);
  const fields = sketchFields(interpretation.plan, interpretation.snap);
  return { key, interpretation, snap: interpretation.snap, fields, choices: defaultSketchChoices(fields, interpretation.snap.archetypeId) };
}
const confirmAll = (choices: SketchPageChoices): SketchPageChoices => ({ ...choices, texts: Object.fromEntries(Object.entries(choices.texts)
  .map(([key, choice]) => [key, { ...choice, confirmedText: choice.text }])) });

describe('Modo rascunho — tela de revisão (puro)', () => {
  it('lists what each drawn area becomes on the PCON cover, numbered as on the photo', async () => {
    const cover = await page('capa_foto.jpg');
    expect(cover.snap.archetypeId).toBe('C1');
    expect(cover.snap.suggestedArchetypeId).toBe('C1');
    const numbers = sketchRegionNumbers(cover.interpretation.plan);
    expect([...numbers.values()]).toEqual(Array.from({ length: cover.interpretation.plan.regions.length }, (_, index) => index + 1));
    const byKey = new Map(cover.fields.map(field => [field.key, field]));
    expect(byKey.get('C1.marca')?.kind).toBe('brand');
    expect(byKey.get('C1.foto')).toMatchObject({ kind: 'image', instruction: 'foto do PCON-Y17' });
    expect(byKey.get('C1.titulo')).toMatchObject({ kind: 'text', sketchText: 'PCON-Y17' });
    expect(byKey.get('C1.pilula-a1')?.sketchText).toBe('0 a 200 psi');
    expect(['C1.modelo-1', 'C1.modelo-2', 'C1.modelo-3'].map(key => byKey.get(key)?.sketchText)).toEqual(['Y17', 'Y18-LP', 'Y18-BP']);
    expect(sketchRegionNotes(cover.interpretation.plan, cover.snap)).toEqual([
      { regionId: 'region-9', kind: 'decoration', text: 'Faixa colorida: já faz parte do modelo.' }]);
    // The suggestion and two alternatives, whichever is picked.
    expect(cover.snap.alternatives).toEqual(['P1', 'P6']);
    const asP1 = snapSketchPlan(cover.interpretation.plan, { template: 'P1' });
    expect(asP1).toMatchObject({ archetypeId: 'P1', suggestedArchetypeId: 'C1', alternatives: ['C1', 'P6'] });
  });

  it('never applies a digit read from the sketch before the person confirms it: those fields stay “A COMPLETAR”', async () => {
    const cover = await page('capa_foto.jpg');
    expect(sketchDigits('0 a 200 psi').map(digit => digit.value)).toEqual(['0', '200']);
    expect(sketchTextState(cover.choices.texts['C1.titulo'])).toBe('to-confirm');
    expect(sketchTextState(cover.choices.texts['C1.subtitulo'])).toBe('ok');
    expect(sketchTextState({ text: '  ' })).toBe('empty');
    const outcome = sketchPageOutcome(cover, []);
    expect(outcome.toConfirm).toEqual(['Título', 'Pílula azul 1', 'Modelo 1 da barra', 'Modelo 2 da barra', 'Modelo 3 da barra']);
    expect(outcome.filled).toEqual(['Chamada 1 (texto da seta)', 'Subtítulo', 'Pílula azul 2', 'Pílula dourada 1']);
    expect(outcome.photos).toEqual(['Foto do produto']);
    expect(outcome.entry).toMatchObject({ kind: 'template', template: 'C1' });
    const fills = outcome.entry.kind === 'template' ? outcome.entry.fills : {};
    expect(Object.keys(fills).sort()).toEqual(['C1.chamada-1', 'C1.pilula-a2', 'C1.pilula-b1', 'C1.subtitulo']);
    expect(JSON.stringify(Object.values(fills))).not.toMatch(/\p{N}/u);

    const session = newSession();
    const before = session.getSnapshot().document;
    const compiled = compileSketchPages(before, [outcome], before.pages[0].id);
    if (!compiled.ok) throw new Error(compiled.message);
    const applied = applyPagePlan(session, compiled.compiled);
    if (!applied.ok) throw new Error(applied.message);
    const after = session.getSnapshot().document;
    expect(after.pages).toHaveLength(1);
    const written = texts(after, 0);
    expect(written).toEqual(expect.arrayContaining(['Controlador de pressão', 'saída pneumática', 'hidráulico', 'pneumático', 'PRESYS']));
    expect(written.join('\n')).not.toMatch(/PCON-Y17|200 psi|Y18/u);
    expect(written.some(text => text.includes(TO_FILL))).toBe(true);
    expect(undoPagePlan(session, applied.applied)).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('applies the confirmed digits exactly as written, in one transaction after the open page', async () => {
    const cover = await page('capa_foto.jpg');
    const specs = await page('especificacoes_foto.jpg', 'rascunho-2');
    const session = newSession();
    session.execute({ type: 'page.add', afterPageId: session.getSnapshot().document.pages[0].id });
    const before = session.getSnapshot().document;
    const outcomes = [sketchPageOutcome({ ...cover, choices: confirmAll(cover.choices) }, []), sketchPageOutcome(specs, [])];
    const compiled = compileSketchPages(before, outcomes, before.pages[0].id);
    if (!compiled.ok) throw new Error(compiled.message);
    expect(compiled.compiled.replacesEmptyPage).toBe(true);
    const applied = applyPagePlan(session, compiled.compiled);
    if (!applied.ok) throw new Error(applied.message);
    const after = session.getSnapshot().document;
    expect(after.pages).toHaveLength(3);
    expect(texts(after, 0)).toEqual(expect.arrayContaining(['PCON-Y17', '0 a 200 psi', 'Y17', 'Y18-LP', 'Y18-BP']));
    expect(texts(after, 1)).toContain('Especificações técnicas');
    expect(sketchAppliedMessage(after, applied.applied.pageIds, 0))
      .toBe('Páginas do rascunho criadas: 2 páginas, nas páginas 1 a 2. Os campos com “A COMPLETAR” ficam para você. Use Desfazer se precisar.');
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('a drawn table enters empty: the model’s own table, never values from the drawing', async () => {
    const specs = await page('especificacoes_foto.jpg');
    const table = specs.fields.find(field => field.key === 'P4.specs')!;
    expect(table).toMatchObject({ kind: 'table', suggestedSource: 'pdf', sketchText: 'característica TA-25N TA-35N TA-50N · notas embaixo' });
    expect(specs.choices.tables['P4.specs']).toBe(LEAVE_TO_FILL);
    const outcome = sketchPageOutcome(specs, []);
    expect(outcome.tables).toEqual([{ label: 'Tabela de comparação', source: null }]);
    expect(outcome.entry.kind === 'template' ? outcome.entry.fills['P4.specs'] : 'outra').toBeUndefined();
    const session = newSession();
    const compiled = compileSketchPages(session.getSnapshot().document, [outcome]);
    if (!compiled.ok) throw new Error(compiled.message);
    expect(applyPagePlan(session, compiled.compiled).ok).toBe(true);
    const grid = cells(session.getSnapshot().document, 0);
    expect(grid[0]).toEqual(['Característica', TO_FILL, TO_FILL, TO_FILL]);
    expect(grid.flat().join(' ')).not.toMatch(/TA-25N|TA-35N|TA-50N/u);
  });

  it('fills a table only from a checked file: the spreadsheet cells as read, or the checked PDF table', async () => {
    const specs = await page('especificacoes_foto.jpg');
    const sheet: SketchTableSource = { id: 'planilha:1', kind: 'planilha', label: 'Planilha TA.xlsx · Specs',
      header: ['Característica', 'TA-25N', 'TA-35N'], rows: [['Peso', '10.5 kg', '12.5 kg'], ['Potência', '200 W', '300 W']] };
    const broken: SketchTableSource = { id: 'planilha:2', kind: 'planilha', label: 'Planilha grande', rows: [], problem: 'Numa página A4 cabem no máximo 7 colunas.' };
    const set = { version: 1, title: 'Specifications', models: ['TA-25N'], rows: [], positions: [], sourceNames: { 'arquivo-1': 'folder.pdf' }, choices: {} } as unknown as DraftFactSet;
    const pdf = factSetSketchSource('pdf:1', set);
    expect(pdf.label).toBe('Tabela de especificações conferida no PDF (folder.pdf)');
    expect(sketchSourcesFor('P4.specs', [sheet, pdf]).map(item => item.id)).toEqual(['planilha:1', 'pdf:1']);
    expect(sketchSourcesFor('P7.accessories', [sheet, pdf]).map(item => item.id)).toEqual(['planilha:1']);

    const fromSheet = sketchPageOutcome({ ...specs, choices: { ...specs.choices, tables: { 'P4.specs': 'planilha:1' } } }, [sheet, pdf]);
    const session = newSession();
    const compiled = compileSketchPages(session.getSnapshot().document, [fromSheet]);
    if (!compiled.ok) throw new Error(compiled.message);
    expect(applyPagePlan(session, compiled.compiled).ok).toBe(true);
    expect(cells(session.getSnapshot().document, 0)).toEqual([['Característica', 'TA-25N', 'TA-35N'], ['Peso', '10.5 kg', '12.5 kg'], ['Potência', '200 W', '300 W']]);

    const withProblem = sketchPageOutcome({ ...specs, choices: { ...specs.choices, tables: { 'P4.specs': 'planilha:2' } } }, [broken]);
    expect(withProblem.entry.kind === 'template' ? withProblem.entry.fills['P4.specs'] : 'outra').toBeUndefined();
    expect(withProblem.tables).toEqual([{ label: 'Tabela de comparação', source: null }]);

    const fromPdf = sketchPageOutcome({ ...specs, choices: { ...specs.choices, tables: { 'P4.specs': 'pdf:1' } } }, [sheet, pdf]);
    expect(fromPdf.entry).toEqual({ kind: 'spec-table', key: 'rascunho-1', set: { ...set, title: 'Especificações técnicas' } });
    const gone = sketchPageOutcome({ ...specs, choices: { ...specs.choices, tables: { 'P4.specs': 'pdf:velho' } } }, [sheet]);
    expect(gone.missingSources).toEqual(['Tabela de comparação']);
    expect(gone.entry.kind).toBe('template');
  });

  it('keeps the photo rows of the accessories page out and says why', async () => {
    const accessories = await page('acessorios_foto.jpg');
    expect(accessories.snap.archetypeId).toBe('P7');
    const notes = sketchRegionNotes(accessories.interpretation.plan, accessories.snap);
    expect(notes.filter(note => note.kind === 'unassigned')).toHaveLength(5);
    expect(notes[0].text).toBe('Chamada “fotos pequenas à esquerda”: este modelo de página não tem lugar para isto; fica de fora.');
    const outcome = sketchPageOutcome(accessories, []);
    expect(outcome.filled).toEqual(['Título']);
    expect(outcome.tables).toEqual([{ label: 'Tabela de acessórios', source: null }]);
  });
});
