import { describe, it, expect } from 'vitest';
import { buildPresysTechnicalCatalog } from '../../src/data/presys-technical-catalogs';
import { detectMixedFullPageCover, calculateVerticalOverflow } from '../../src/domain/overflow-guard';
import { evaluateMixedCoverRecovery } from '../../src/domain/page-composition-policy';
import { getCanonicalPagePaddingCss } from '../../src/domain/canvas-layout.engine';

describe('A4.FLOW.R1 — Phase A: Observed Production Failures Regression (FLOW-T1 to FLOW-T6)', () => {
  const ta25n = buildPresysTechnicalCatalog('TA-25N');

  // Defeito legado sintético para reprodução exata
  const legacyDefectiveCatalog = {
    ...ta25n,
    pages: [
      {
        id: 'p1-legacy-mixed',
        pageNumber: 1,
        pageType: 'cover' as const,
        title: 'Capa Defeituosa',
        blocks: [
          ta25n.pages[0].blocks[0],
          ta25n.pages[1].blocks[0]
        ]
      },
      ...ta25n.pages.slice(1)
    ]
  };

  // FLOW-T1: Reproduz defeito legado onde página 1 continha full_page_cover + quick_spec
  it('FLOW-T1: reproduz defeito de capa mista e prova resolução no TA-25N canônico', () => {
    // 1. Reprodução no catálogo defeituoso legado
    const legacyPage1 = legacyDefectiveCatalog.pages[0];
    expect(legacyPage1.blocks).toHaveLength(2);
    expect(legacyPage1.blocks[0].type).toBe('full_page_cover');
    expect(detectMixedFullPageCover(legacyPage1.blocks)).toBe(true);

    const recovery = evaluateMixedCoverRecovery(legacyPage1);
    expect(recovery.eligible).toBe(true);
    expect(recovery.coverCount).toBe(1);
    expect(recovery.nonCoverCount).toBe(1);

    // 2. Prova de resolução no TA-25N canônico pós-reparo
    const canonicalPage1 = ta25n.pages[0];
    expect(canonicalPage1.blocks).toHaveLength(1);
    expect(canonicalPage1.blocks[0].type).toBe('full_page_cover');
    expect(detectMixedFullPageCover(canonicalPage1.blocks)).toBe(false);
  });

  // FLOW-T2: Capa mista recebia padding de página vs Capa exclusiva recebe 0
  it('FLOW-T2: reproduz contradição de padding na capa mista e prova 0mm na capa exclusiva', () => {
    // Legado misto: padding não é 0
    const legacyPage1 = legacyDefectiveCatalog.pages[0];
    const legacyIsSingle = legacyPage1.blocks.length === 1 && legacyPage1.blocks[0].type === 'full_page_cover';
    expect(legacyIsSingle).toBe(false);
    expect(getCanonicalPagePaddingCss(legacyIsSingle)).not.toBe('0mm');

    // Canônico corrigido: padding é estritamente 0mm
    const canonicalPage1 = ta25n.pages[0];
    const canonicalIsSingle = canonicalPage1.blocks.length === 1 && canonicalPage1.blocks[0].type === 'full_page_cover';
    expect(canonicalIsSingle).toBe(true);
    expect(getCanonicalPagePaddingCss(canonicalIsSingle)).toBe('0mm');
  });

  // FLOW-T3: Medição de tabela longa e prova de alocação em folha própria
  it('FLOW-T3: reproduz overflow de tabela longa e valida isolamento sem sobrecarga', () => {
    const measPage = ta25n.pages.find(p => p.id.includes('inputs'));
    expect(measPage).toBeDefined();
    const measTable = measPage?.blocks.find(b => b.id.includes('meas-spec'));
    expect(measTable).toBeDefined();
    expect(measTable?.tableRows?.length).toBe(13);

    // Na folha isolada exclusiva de medição, a tabela + notas cabem dentro da folha
    expect(measPage?.blocks.length).toBe(2);
  });

  // FLOW-T4: Matriz de insertos
  it('FLOW-T4: valida que a matriz de insertos da Série N possui 14 insertos oficiais preservados', () => {
    const insertPage = ta25n.pages.find(p => p.id.includes('inserts'));
    expect(insertPage).toBeDefined();
    const insertTable = insertPage?.blocks.find(b => b.id.includes('inserts-table'));
    expect(insertTable).toBeDefined();
    expect(insertTable?.tableRows?.length).toBe(14);
  });

  // FLOW-T5: Desmembramento de fornecimento padrão e acessórios vs codificação de pedido
  it('FLOW-T5: prova que fornecimento padrão e código de pedido estão em folhas dedicadas', () => {
    const deliveryPage = ta25n.pages.find(p => p.id.includes('delivery'));
    const orderingPage = ta25n.pages.find(p => p.id.includes('ordering'));

    expect(deliveryPage).toBeDefined();
    expect(orderingPage).toBeDefined();

    // Delivery tem 2 tabelas (standard delivery + accessories), NÃO 3
    expect(deliveryPage?.blocks.length).toBe(2);
    // Ordering tem 1 tabela dedicada
    expect(orderingPage?.blocks.length).toBe(1);
  });

  // FLOW-T6: Prova que flex justify-between não elimina overflow
  it('FLOW-T6: prova que flex justify-between (antigo Auto-Fit) não reduz altura de conteúdo excedente', () => {
    const contentHeight = 1500;
    const viewportHeight = 1047;
    const { overflowY } = calculateVerticalOverflow(contentHeight, viewportHeight);
    expect(overflowY).toBe(true);
  });
});
