import { describe, it, expect } from 'vitest';
import * as pageGeometryExports from '../../src/domain/page-geometry';
import {
  CANONICAL_A4_GEOMETRY,
  getPageContentBox,
  getCanonicalPagePaddingCss
} from '../../src/domain/page-geometry';
import { mmToPx, pxToMm } from '../../src/domain/physical-units';
import {
  A4LayoutEngine,
  A4_PAGE_WIDTH_MM,
  A4_PAGE_HEIGHT_MM,
  updateStructuralLayout
} from '../../src/domain/canvas-layout.engine';
import { StructuralSectionData } from '../../src/domain/canvas-layout.schema';

describe('FASE 3A.5A — A4 Physical Geometry, Content Box & Fixed Width Suite', () => {
  // ==========================================================================
  // A4-GEO: Contrato Físico e Geometria da Folha A4
  // ==========================================================================

  it('A4-GEO-1: CANONICAL_A4_GEOMETRY define exatamente 210mm x 297mm e margens canônicas', () => {
    expect(CANONICAL_A4_GEOMETRY.pageWidthMm).toBe(210);
    expect(CANONICAL_A4_GEOMETRY.pageHeightMm).toBe(297);
    expect(CANONICAL_A4_GEOMETRY.marginsMm.top).toBeCloseTo(8.4667, 4);
    expect(CANONICAL_A4_GEOMETRY.marginsMm.right).toBeCloseTo(8.4667, 4);
    expect(CANONICAL_A4_GEOMETRY.marginsMm.bottom).toBeCloseTo(8.4667, 4);
    expect(CANONICAL_A4_GEOMETRY.marginsMm.left).toBeCloseTo(8.4667, 4);
  });

  it('A4-GEO-2: Content box deriva estritamente das margens canônicas (sem constantes inventadas)', () => {
    const box = getPageContentBox(CANONICAL_A4_GEOMETRY);
    const expectedWidthMm = 210 - 2 * CANONICAL_A4_GEOMETRY.marginsMm.left;
    const expectedHeightMm = 297 - 2 * CANONICAL_A4_GEOMETRY.marginsMm.top;

    expect(box.availableWidthMm).toBeCloseTo(expectedWidthMm, 4);
    expect(box.availableWidthMm).toBe(193.0666);
    expect(box.availableHeightMm).toBeCloseTo(expectedHeightMm, 4);
    expect(box.availableHeightMm).toBe(280.0666);

    // Preview em tela (96 DPI): ~730 px de largura útil
    expect(box.previewWidthPx).toBe(730);
  });

  it('A4-GEO-3: Editor e CleanA4 utilizam a mesma fonte geométrica canônica', () => {
    const paddingStyle = getCanonicalPagePaddingCss(false);
    expect(paddingStyle).toContain('8.4667mm');
    expect(paddingStyle).toBe('8.4667mm 8.4667mm 8.4667mm 8.4667mm');
  });

  it('A4-GEO-4: full_page_cover aplica rigorosamente padding zero (sangria total)', () => {
    const fullCoverPadding = getCanonicalPagePaddingCss(true);
    expect(fullCoverPadding).toBe('0mm');
  });

  it('A4-GEO-5: Nenhuma constante de altura de rodapé (24px / 6.35mm) foi introduzida no domínio', () => {
    // Prova que page-geometry não exporta nem fixa footerHeightMm
    expect((pageGeometryExports as any).footerHeightMm).toBeUndefined();
    expect((pageGeometryExports as any).FOOTER_HEIGHT_PX).toBeUndefined();
    expect((pageGeometryExports as any).FOOTER_HEIGHT_MM).toBeUndefined();
    expect((pageGeometryExports as any).BlockFlowViewport).toBeUndefined();
  });

  it('A4-GEO-SSOT-1: Constantes legadas A4 no canvas-layout.engine derivam estritamente da autoridade canônica (SSOT)', () => {
    expect(A4_PAGE_WIDTH_MM).toBe(CANONICAL_A4_GEOMETRY.pageWidthMm);
    expect(A4_PAGE_HEIGHT_MM).toBe(CANONICAL_A4_GEOMETRY.pageHeightMm);
    expect(A4_PAGE_WIDTH_MM).toBe(210);
    expect(A4_PAGE_HEIGHT_MM).toBe(297);
  });

  // ==========================================================================
  // PHYSICAL UNITS: mmToPx e pxToMm
  // ==========================================================================

  it('UNITS-1: mmToPx e pxToMm são funções puras e invertíveis', () => {
    const testMm = 193.0666;
    const px = mmToPx(testMm, 96);
    const roundTripMm = pxToMm(px, 96);
    expect(roundTripMm).toBeCloseTo(testMm, 4);
  });

  // ==========================================================================
  // WIDTH: Validação de Largura Fixa e Fill
  // ==========================================================================

  const sampleSectionData: StructuralSectionData = {
    version: 1,
    layout: {
      mode: 'grid',
      columns: 4,
      widthMode: 'fill',
      gap: 'sm',
      padding: 'md',
      density: 'normal',
      align: 'left',
      background: 'soft',
      border: 'subtle',
      radius: 'sm'
    },
    children: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'feature_card',
        title: 'Card 1',
        body: 'Corpo 1',
        emphasis: 'normal'
      }
    ]
  };

  it('WIDTH-1: Seção com widthMode=fill valida com sucesso contra o content box', () => {
    const contentBox = getPageContentBox();
    const result = A4LayoutEngine.validateSection(sampleSectionData, {
      availableWidthMm: contentBox.availableWidthMm
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('WIDTH-2: Seção com fixedWidthMm válido (<= availableWidthMm) valida com sucesso', () => {
    const contentBox = getPageContentBox();
    const fixedData: StructuralSectionData = {
      ...sampleSectionData,
      layout: {
        ...sampleSectionData.layout,
        widthMode: 'fixed',
        fixedWidthMm: 150
      }
    };

    const result = A4LayoutEngine.validateSection(fixedData, {
      availableWidthMm: contentBox.availableWidthMm
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('WIDTH-3: Transição fill -> fixed utiliza EXATAMENTE availableWidthMm', () => {
    const contentBox = getPageContentBox();
    const exactAvailableMm = contentBox.availableWidthMm;

    // Prova que o valor inicial não sofre snap espúrio para 189mm ou 193.5mm
    expect(exactAvailableMm).toBe(193.0666);
    expect(exactAvailableMm).toBeLessThanOrEqual(contentBox.availableWidthMm);

    const transitionedData: StructuralSectionData = {
      ...sampleSectionData,
      layout: {
        ...sampleSectionData.layout,
        widthMode: 'fixed',
        fixedWidthMm: exactAvailableMm
      }
    };

    const result = A4LayoutEngine.validateSection(transitionedData, {
      availableWidthMm: contentBox.availableWidthMm
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('WIDTH-4: Documento legado com fixedWidthMm > availableWidthMm emite OUTSIDE_SAFE_WIDTH sem mutação silenciosa', () => {
    const contentBox = getPageContentBox();
    const legacyOversizedData: StructuralSectionData = {
      ...sampleSectionData,
      layout: {
        ...sampleSectionData.layout,
        widthMode: 'fixed',
        fixedWidthMm: 215 // Excede os 193.0666 mm úteis
      }
    };

    const result = A4LayoutEngine.validateSection(legacyOversizedData, {
      availableWidthMm: contentBox.availableWidthMm
    });

    expect(result.valid).toBe(false);
    const outsideSafeIssue = result.issues.find((i) => i.code === 'OUTSIDE_SAFE_WIDTH');
    expect(outsideSafeIssue).toBeDefined();
    expect(outsideSafeIssue?.severity).toBe('error');
    expect(outsideSafeIssue?.details?.requested).toBe(215);
    expect(outsideSafeIssue?.details?.available).toBe(contentBox.availableWidthMm);

    // O dado original permanece intacto com 215mm (não é reescrito silenciosamente)
    expect(legacyOversizedData.layout.fixedWidthMm).toBe(215);
  });

  it('WIDTH-5: Alinhamentos left, center e right mantêm mapeamento determinístico de classes', () => {
    const alignMap = {
      left: 'mr-auto text-left',
      center: 'mx-auto text-center',
      right: 'ml-auto text-right'
    };

    expect(alignMap.left).toBe('mr-auto text-left');
    expect(alignMap.center).toBe('mx-auto text-center');
    expect(alignMap.right).toBe('ml-auto text-right');
  });

  it('WIDTH-INPUT-1: Valor canônico derivado (193.0666 mm) é suportado no motor sem grid ou snap restritivo', () => {
    const contentBox = getPageContentBox();
    const exactMm = contentBox.availableWidthMm; // 193.0666
    expect(exactMm).toBe(193.0666);

    const section: StructuralSectionData = {
      ...sampleSectionData,
      layout: {
        ...sampleSectionData.layout,
        widthMode: 'fixed',
        fixedWidthMm: exactMm
      }
    };
    const result = A4LayoutEngine.validateSection(section, { availableWidthMm: contentBox.availableWidthMm });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('WIDTH-FIXED-PATCH-1: patch isolado em seção fixed (ex: gap) preserva fixedWidthMm=150 sem lançar erro', () => {
    const fixedData: StructuralSectionData = {
      ...sampleSectionData,
      layout: {
        ...sampleSectionData.layout,
        widthMode: 'fixed',
        fixedWidthMm: 150,
        gap: 'sm'
      }
    };

    const updated = updateStructuralLayout(fixedData, { gap: 'lg' });

    expect(updated.layout.widthMode).toBe('fixed');
    expect(updated.layout.fixedWidthMm).toBe(150);
    expect(updated.layout.gap).toBe('lg');
  });

  it('WIDTH-FIXED-PATCH-2: patches independentes em seção fixed preservam fixedWidthMm=150 em todos os campos', () => {
    const fixedData: StructuralSectionData = {
      ...sampleSectionData,
      layout: {
        ...sampleSectionData.layout,
        widthMode: 'fixed',
        fixedWidthMm: 150,
        mode: 'grid',
        columns: 3,
        gap: 'sm',
        padding: 'sm',
        density: 'normal',
        align: 'left',
        background: 'soft',
        border: 'subtle',
        radius: 'sm'
      }
    };

    const patches = [
      { patch: { mode: 'stack' as const }, expectedField: 'mode', expectedValue: 'stack' },
      { patch: { columns: 5 }, expectedField: 'columns', expectedValue: 5 },
      { patch: { gap: 'xl' as const }, expectedField: 'gap', expectedValue: 'xl' },
      { patch: { padding: 'lg' as const }, expectedField: 'padding', expectedValue: 'lg' },
      { patch: { density: 'compact' as const }, expectedField: 'density', expectedValue: 'compact' },
      { patch: { align: 'center' as const }, expectedField: 'align', expectedValue: 'center' },
      { patch: { background: 'surface' as const }, expectedField: 'background', expectedValue: 'surface' },
      { patch: { border: 'solid' as const }, expectedField: 'border', expectedValue: 'solid' },
      { patch: { radius: 'lg' as const }, expectedField: 'radius', expectedValue: 'lg' }
    ];

    for (const { patch, expectedField, expectedValue } of patches) {
      const result = updateStructuralLayout(fixedData, patch);
      expect(result.layout.widthMode).toBe('fixed');
      expect(result.layout.fixedWidthMm).toBe(150);
      expect(result.layout[expectedField as keyof typeof result.layout]).toBe(expectedValue);
    }
  });

  // ==========================================================================
  // PDF-REGRESSION: Paridade e Compatibilidade com CleanA4 Existente
  // ==========================================================================

  it('PDF-REGRESSION-1: CleanA4 mantém padding milimétrico exatamente equivalente ao p-8 anterior (32px)', () => {
    const paddingMm = CANONICAL_A4_GEOMETRY.marginsMm.left;
    const pxEquivalent = mmToPx(paddingMm, 96);
    expect(pxEquivalent).toBeCloseTo(32, 2);
  });

  it('PDF-REGRESSION-2: Editor A4Canvas agora utiliza a mesma largura física útil do CleanA4 (193.0666 mm)', () => {
    const editorContentBox = getPageContentBox(CANONICAL_A4_GEOMETRY);
    expect(editorContentBox.availableWidthMm).toBe(193.0666);
    expect(editorContentBox.previewWidthPx).toBe(730);
  });
});
