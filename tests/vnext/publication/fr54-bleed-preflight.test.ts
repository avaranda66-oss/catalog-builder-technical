import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnosticMessage } from '@/vnext/app/authoring-diagnostics';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { projectLayoutDiagnostics } from '@/vnext/app/layout-diagnostics-projection';
import { publicationDiagnosticMessage, publicationDiagnosticText } from '@/vnext/app/publication-diagnostic-presentation';
import { plainRichText, type CatalogDocument, type Diagnostic, type Frame, type LeafEditorialObject } from '@/vnext/domain';
import { PRESYS_STARTER } from '@/vnext/library/presys-ta25n-starter';
import { BLEED_OBJECT_TYPES, BLEED_TOLERANCE_MM, authoredFrameDiagnostics, isBleedWarning } from '@/vnext/publication/preflight';
import { reviewPublication, type PublicationSource } from '@/vnext/publication/review';

// Same pipeline mock as publication-review.test.ts, but the preflight itself stays real: the review decision
// (READY/BLOCKED) must come from the FR-54 severities, not from a mocked report.
const pipeline = vi.hoisted(() => ({ fonts: vi.fn(), assets: vi.fn(), decode: vi.fn(), measure: vi.fn(), capture: vi.fn(), compare: vi.fn() }));
vi.mock('@/vnext/rendering', async importOriginal => ({ ...await importOriginal<object>(), loadFonts: pipeline.fonts, resolveAssets: pipeline.assets,
  decodeImages: pipeline.decode, measureTables: pipeline.measure, captureSnapshot: pipeline.capture, compareSnapshots: pipeline.compare }));

const PAGE_WIDTH_MM = 210;
const SAFE_AREA = { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 };
const COVER_ASSET_ID = 'fr54-cover-photo';

const frame = (xMm: number, yMm: number, widthMm: number, heightMm: number): Frame => ({ xMm, yMm, widthMm, heightMm });
const shape = (id: string, box: Frame): LeafEditorialObject => ({ id, type: 'shape', frame: box, zIndex: 0, shape: 'rectangle', style: { fill: '#173F52' } });
const line = (id: string, box: Frame): LeafEditorialObject => ({ id, type: 'line', frame: box, zIndex: 0, axis: 'horizontal', color: '#173F52' });
const image = (id: string, box: Frame): LeafEditorialObject => ({ id, type: 'image', frame: box, zIndex: 0, assetId: COVER_ASSET_ID, fit: 'cover' });
const text = (id: string, box: Frame): LeafEditorialObject => ({ id, type: 'text', frame: box, zIndex: 1, text: plainRichText(`${id}-rich`, 'Texto'), style: {} });
const table = (id: string, box: Frame): LeafEditorialObject => ({ id, type: 'table', frame: box, zIndex: 1, table: createMinimalW2CTable() });

function pageDocument(objects: CatalogDocument['pages'][number]['objects']): CatalogDocument {
  let id = 0;
  const document = createW2CDemoDocument(() => `fr54-${++id}`);
  // 4000 px over 214 mm is about 475 ppi: the cover photo never trips the resolution check.
  document.assets = [...document.assets, { id: COVER_ASSET_ID, version: 'fr54-1', sha256: 'a'.repeat(64), mime: 'image/jpeg',
    widthPx: 4000, heightPx: 3000, name: 'Foto de capa', alt: 'Foto de capa sangrada' }];
  document.pages = [{ ...document.pages[0], safeArea: SAFE_AREA, objects }];
  return document;
}

function source(document: CatalogDocument): PublicationSource {
  return { document, openSessionId: 'open-fr54', remoteRevision: 1, authLineage: 'user-fr54', authorityScopeId: 'scope-fr54', assetUrls: new Map() };
}

/** `CODE:SEVERITY` of every diagnostic anchored at one object, in emission order. */
const codesFor = (diagnostics: readonly Diagnostic[], objectId: string): string[] =>
  diagnostics.filter(issue => issue.objectId === objectId).map(issue => `${issue.code}:${issue.severity}`);

beforeEach(() => {
  vi.resetAllMocks();
  pipeline.fonts.mockResolvedValue([]); pipeline.assets.mockResolvedValue({ urls: new Map(), manifest: [] }); pipeline.decode.mockResolvedValue(undefined);
  pipeline.capture.mockResolvedValue({ facts: [], geometryDiagnostics: [] }); pipeline.compare.mockReturnValue([]);
});

describe('FR-54 faixas decorativas e sangria no preflight', () => {
  it('exports the rule constants used by the presentation and by these tests', () => {
    expect(BLEED_TOLERANCE_MM).toBe(3);
    expect([...BLEED_OBJECT_TYPES].sort()).toEqual(['image', 'line', 'shape']);
    expect(isBleedWarning({ code: 'OBJECT_OUTSIDE_PAGE', severity: 'WARNING' })).toBe(true);
    expect(isBleedWarning({ code: 'OBJECT_OUTSIDE_PAGE', severity: 'ERROR' })).toBe(false);
    expect(isBleedWarning({ code: 'SAFE_AREA_VIOLATION', severity: 'WARNING' })).toBe(false);
  });

  it('faixa decorativa de borda a borda: sem aviso de área segura e sem erro', () => {
    const document = pageDocument([shape('header-band', frame(0, 0, PAGE_WIDTH_MM, 40)), shape('footer-band', frame(0, 257, PAGE_WIDTH_MM, 40))]);
    expect(authoredFrameDiagnostics(document)).toEqual([]);
  });

  it('linha horizontal de largura total: sem aviso', () => {
    const document = pageDocument([line('rule', frame(0, 150, PAGE_WIDTH_MM, 1.5))]);
    expect(authoredFrameDiagnostics(document)).toEqual([]);
  });

  it('forma, foto ou linha que só encosta em uma borda também dispensa o aviso de área segura', () => {
    const document = pageDocument([
      image('side-photo', frame(0, 100, 60, 80)),
      shape('tab', frame(190, 40, 20, 30)),
      line('vertical-rule', frame(100, 0, 1, 50)),
    ]);
    expect(authoredFrameDiagnostics(document)).toEqual([]);
  });

  it('forma dentro da página que cruza a margem (sem encostar na borda) continua recebendo o aviso de área segura', () => {
    const document = pageDocument([shape('near-edge', frame(5, 20, 30, 20))]);
    expect(codesFor(authoredFrameDiagnostics(document), 'near-edge')).toEqual(['SAFE_AREA_VIOLATION:WARNING']);
  });

  it('nada muda para objetos totalmente dentro da página', () => {
    const document = pageDocument([
      shape('inner-shape', frame(20, 20, 50, 20)), image('inner-image', frame(20, 50, 50, 40)), line('inner-line', frame(20, 100, 100, 1)),
      text('inner-text', frame(20, 110, 80, 10)), table('inner-table', frame(20, 130, 120, 60)),
    ]);
    expect(authoredFrameDiagnostics(document)).toEqual([]);
  });

  it('foto de capa sangrando 2 mm vira aviso (não erro), sem aviso de área segura, e a revisão fica READY', async () => {
    const document = pageDocument([image('cover', frame(-2, -2, PAGE_WIDTH_MM + 4, 150))]);
    const before = JSON.stringify(document);
    const diagnostics = authoredFrameDiagnostics(document);
    expect(diagnostics).toEqual([expect.objectContaining({
      code: 'OBJECT_OUTSIDE_PAGE', severity: 'WARNING', objectId: 'cover', details: 'bleedMm=2; toleranceMm=3',
    })]);
    expect(JSON.stringify(document)).toBe(before);

    const review = await reviewPublication(source(document), window.document.createElement('div'), vi.fn(), () => true);
    expect(review.status).toBe('READY');
    expect(review.diagnostics.some(issue => issue.severity === 'ERROR')).toBe(false);
    expect(review.diagnostics).toContainEqual(expect.objectContaining({ code: 'OBJECT_OUTSIDE_PAGE', severity: 'WARNING', objectId: 'cover' }));
  });

  it.each([
    ['à esquerda', 3, frame(-3, 50, 100, 80), 'WARNING'],
    ['à esquerda', 3.1, frame(-3.1, 50, 100, 80), 'ERROR'],
    ['à direita e embaixo', 3, frame(113, 220, 100, 80), 'WARNING'],
    ['à direita e embaixo', 3.1, frame(113.1, 220.1, 100, 80), 'ERROR'],
  ])('foto saindo %s %s mm da página → %s', (_side, _mm, box, severity) => {
    const document = pageDocument([image('photo', box)]);
    expect(codesFor(authoredFrameDiagnostics(document), 'photo')).toEqual([`OBJECT_OUTSIDE_PAGE:${severity}`]);
  });

  it('foto 3,1 mm fora da página continua bloqueando a revisão', async () => {
    const document = pageDocument([image('photo', frame(-3.1, 50, 100, 80))]);
    const review = await reviewPublication(source(document), window.document.createElement('div'), vi.fn(), () => true);
    expect(review.status).toBe('BLOCKED');
    expect(review.diagnostics).toContainEqual(expect.objectContaining({ code: 'OBJECT_OUTSIDE_PAGE', severity: 'ERROR', objectId: 'photo' }));
  });

  it('texto cruzando a margem segura continua com aviso; texto 1 mm fora da página continua erro', () => {
    const document = pageDocument([text('margin-text', frame(5, 20, 40, 10)), text('cut-text', frame(0, 100, PAGE_WIDTH_MM + 1, 10))]);
    const diagnostics = authoredFrameDiagnostics(document);
    expect(codesFor(diagnostics, 'margin-text')).toEqual(['SAFE_AREA_VIOLATION:WARNING']);
    expect(codesFor(diagnostics, 'cut-text')).toEqual(['OBJECT_OUTSIDE_PAGE:ERROR', 'SAFE_AREA_VIOLATION:WARNING']);
  });

  it('tabela 5 mm fora da página continua erro (e mantém o aviso de margem)', () => {
    const document = pageDocument([table('spec', frame(185, 50, 30, 40))]);
    expect(codesFor(authoredFrameDiagnostics(document), 'spec')).toEqual(['OBJECT_OUTSIDE_PAGE:ERROR', 'SAFE_AREA_VIOLATION:WARNING']);
  });

  it('grupo com faixa sangrada e texto dentro da margem: um aviso de sangria no grupo, nada nos filhos', () => {
    const document = pageDocument([{
      id: 'group', type: 'group', frame: frame(-2, 0, PAGE_WIDTH_MM + 2, 60), zIndex: 0,
      objects: [shape('group-band', frame(0, 0, PAGE_WIDTH_MM + 2, 40)), text('group-text', frame(14, 45, 100, 15))],
    }]);
    const diagnostics = authoredFrameDiagnostics(document);
    expect(codesFor(diagnostics, 'group')).toEqual(['OBJECT_OUTSIDE_PAGE:WARNING']);
    expect(codesFor(diagnostics, 'group-band')).toEqual([]);
    expect(codesFor(diagnostics, 'group-text')).toEqual([]);
  });

  it('grupo cujo texto sai 1 mm da página continua erro, anotado no grupo', () => {
    const document = pageDocument([{
      id: 'group', type: 'group', frame: frame(-1, 20, 40, 20), zIndex: 0,
      objects: [text('group-text', frame(0, 0, 30, 10)), shape('group-shape', frame(30, 10, 10, 10))],
    }]);
    const diagnostics = authoredFrameDiagnostics(document);
    expect(codesFor(diagnostics, 'group')).toEqual(['OBJECT_OUTSIDE_PAGE:ERROR', 'SAFE_AREA_VIOLATION:WARNING']);
    expect(diagnostics.some(issue => issue.objectId === 'group-text' || issue.objectId === 'group-shape')).toBe(false);
  });

  it('o starter oficial TA-25N não gera aviso de área segura nem de página', () => {
    expect(authoredFrameDiagnostics(PRESYS_STARTER.sourceDocument)).toEqual([]);
  });
});

describe('FR-54 apresentação da sangria em português simples', () => {
  const warning: Diagnostic = { code: 'OBJECT_OUTSIDE_PAGE', severity: 'WARNING', details: 'bleedMm=2; toleranceMm=3', pageId: 'page', objectId: 'cover' };

  it('explica a sangria como revisão, não como bloqueio, sem expor códigos', () => {
    expect(publicationDiagnosticText(warning)).toBe('Faixa ou foto sai 2 mm da página. Isso é normal para sangria (até 3 mm); confira se é intencional.');
    expect(publicationDiagnosticText({ ...warning, details: 'bleedMm=0.5; toleranceMm=3' })).toContain('sai 0,5 mm da página');
    expect(publicationDiagnosticText({ ...warning, details: 'sem detalhe' })).toBe('Faixa ou foto sai até 3 mm da página. Isso é normal para sangria; confira se é intencional.');
    expect(diagnosticMessage(warning)).toContain('sangria');
    for (const message of [publicationDiagnosticText(warning), diagnosticMessage(warning)]) expect(message).not.toMatch(/OBJECT_OUTSIDE_PAGE|bleedMm|WARNING/);
  });

  it('mantém a mensagem de erro quando o objeto sai mais de 3 mm', () => {
    const error: Diagnostic = { ...warning, severity: 'ERROR', details: 'Authored frame exceeds physical A4 bounds' };
    expect(publicationDiagnosticText(error)).toBe(publicationDiagnosticMessage('OBJECT_OUTSIDE_PAGE'));
    expect(publicationDiagnosticText(error)).toContain('fora da página');
    expect(diagnosticMessage(error)).toContain('fora da página física');
  });

  it('o painel do objeto selecionado mostra a sangria como revisão recomendada', () => {
    const document = pageDocument([image('cover', frame(-2, -2, PAGE_WIDTH_MM + 4, 150))]);
    const entries = projectLayoutDiagnostics(document, authoredFrameDiagnostics(document), document.pages[0].id, 'cover');
    expect(entries).toEqual([expect.objectContaining({ sourceCodes: ['OBJECT_OUTSIDE_PAGE'], severity: 'WARNING', publicationBlocked: false, action: 'LOCATE' })]);
    expect(entries[0].message).toContain('sangria');
  });
});
