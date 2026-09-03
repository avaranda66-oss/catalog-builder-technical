// tests/components/editorial-headers-parity.test.tsx
// Suíte abrangente de Paridade, Eliminação de Ghost Data e Contratos I18n dos Headers Editoriais (CORE.E6A).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { FlukeHeaderBlock } from '../../src/components/editor/blocks/FlukeHeaderBlock';
import { AdditelTwoColBlock } from '../../src/components/editor/blocks/AdditelTwoColBlock';
import { BottomHeaderBlock } from '../../src/components/editor/blocks/BottomHeaderBlock';
import { extractHeroBlocks } from '../../src/translation/block-extractors/hero.extractor';
import { TranslationApplierRegistry } from '../../src/translation/translation-applier.registry';

describe('Editorial Headers Canonicalization & Parity (CORE.E6A)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container.remove();
  });

  // ==========================================================================
  // 1. GHOST ELIMINATION: CleanA4 / Export com blocos vazios não imprime fake data
  // ==========================================================================
  it('HEADER-GHOST-1: FlukeHeaderBlock vazio em isExport não imprime dados técnicos fictícios', () => {
    const emptyFluke: ContentBlock = {
      id: 'fluke-empty',
      type: 'fluke_header'
    };

    act(() => {
      root!.render(
        <FlukeHeaderBlock block={emptyFluke} pageId="p1" isSelected={false} isExport={true} />
      );
    });

    const text = container.textContent || '';
    expect(text).not.toContain('-25 °C');
    expect(text).not.toContain('660 °C');
    expect(text).not.toContain('±0.01 °C');
    expect(text).not.toContain('SÉRIE DE CALIBRAÇÃO TÉRMICA PRESYS');
    expect(text).not.toContain('Technical Specifications & Performance Data');
    expect(text).not.toContain('Calibration');
    expect(text).not.toContain('Destaques Metrológicos');

    // Zero itens <li>
    expect(container.querySelectorAll('li').length).toBe(0);
    // Zero contentEditable
    expect(container.querySelectorAll('[contenteditable="true"]').length).toBe(0);
  });

  it('HEADER-GHOST-2: AdditelTwoColBlock vazio em isExport não imprime dados técnicos fictícios', () => {
    const emptyAdditel: ContentBlock = {
      id: 'additel-empty',
      type: 'additel_two_col_hero'
    };

    act(() => {
      root!.render(
        <AdditelTwoColBlock block={emptyAdditel} pageId="p1" isSelected={false} isExport={true} />
      );
    });

    const text = container.textContent || '';
    expect(text).not.toContain('100 bar');
    expect(text).not.toContain('0.01% FE');
    expect(text).not.toContain('0.003% FE');
    expect(text).not.toContain('HART');
    expect(text).not.toContain('Modbus');
    expect(text).not.toContain('SÉRIE PRESYS PCON');
    expect(text).not.toContain('Calibrador Automático de Pressão');
    expect(text).not.toContain('Precision Metrology');
    expect(text).not.toContain('Recursos Técnicos de Destaque');

    // Zero itens <li>
    expect(container.querySelectorAll('li').length).toBe(0);
    // Zero contentEditable
    expect(container.querySelectorAll('[contenteditable="true"]').length).toBe(0);
  });

  it('HEADER-GHOST-3: BottomHeaderBlock vazio em isExport não imprime contatos ou ícones órfãos', () => {
    const emptyBottom: ContentBlock = {
      id: 'bottom-empty',
      type: 'bottom_header'
    };

    act(() => {
      root!.render(
        <BottomHeaderBlock block={emptyBottom} pageId="p1" isSelected={false} isExport={true} />
      );
    });

    const text = container.textContent || '';
    expect(text).not.toContain('+55 (11) 3038-1300');
    expect(text).not.toContain('vendas@presys.com.br');
    expect(text).not.toContain('www.presys.com.br');
    expect(text).not.toContain('ESPECIFICAÇÕES TÉCNICAS E SISTEMAS DE CALIBRAÇÃO');

    // Zero ícones de svg quando contatos não existem
    expect(container.querySelectorAll('svg').length).toBe(0);
    // Zero contentEditable
    expect(container.querySelectorAll('[contenteditable="true"]').length).toBe(0);
  });

  // ==========================================================================
  // 2. EXPORT PARITY: Zero inputs de arquivo, overlays ou botões no Canvas
  // ==========================================================================
  it('HEADER-EXPORT-1: todos os 3 blocos em isExport não possuem upload inline nem actions', () => {
    const fluke: ContentBlock = {
      id: 'f1',
      type: 'fluke_header',
      title: 'Fluke Test',
      customData: { highlights: ['Destaque 1'] }
    };
    const additel: ContentBlock = {
      id: 'a1',
      type: 'additel_two_col_hero',
      title: 'Additel Test',
      customData: { bullets: ['Bullet 1'] }
    };
    const bottom: ContentBlock = {
      id: 'b1',
      type: 'bottom_header',
      title: 'Bottom Test',
      customData: { phone: '123' }
    };

    for (const b of [fluke, additel, bottom]) {
      act(() => {
        root!.render(
          b.type === 'fluke_header' ? (
            <FlukeHeaderBlock block={b} pageId="p1" isSelected={false} isExport={true} />
          ) : b.type === 'additel_two_col_hero' ? (
            <AdditelTwoColBlock block={b} pageId="p1" isSelected={false} isExport={true} />
          ) : (
            <BottomHeaderBlock block={b} pageId="p1" isSelected={false} isExport={true} />
          )
        );
      });

      expect(container.querySelectorAll('input[type="file"]').length).toBe(0);
      expect(container.querySelectorAll('button').length).toBe(0);
      expect(container.querySelectorAll('[contenteditable="true"]').length).toBe(0);
    }
  });

  // ==========================================================================
  // 3. I18N UNIQUE NODE IDS: Cada nó de tradução tem ID único
  // ==========================================================================
  it('HEADER-I18N-UNIQUE-1: cada printable node ID aparece EXATAMENTE uma vez por elemento', () => {
    const fluke: ContentBlock = {
      id: 'f1',
      type: 'fluke_header',
      title: 'Fluke Tit',
      subtitle: 'Fluke Sub',
      badgeText: 'PRESYS',
      customData: {
        badgeSecondary: 'Calib',
        description: 'Desc',
        highlights: ['HL1', 'HL2']
      }
    };
    const additel: ContentBlock = {
      id: 'a1',
      type: 'additel_two_col_hero',
      title: 'Additel Tit',
      subtitle: 'Additel Sub',
      badgeText: 'PRESYS',
      customData: {
        badgeSubtitle: 'Slogan',
        overview: 'Overview',
        bullets: ['B1', 'B2']
      }
    };
    const bottom: ContentBlock = {
      id: 'b1',
      type: 'bottom_header',
      title: 'Bottom Tit',
      subtitle: 'Bottom Sub',
      badgeText: 'PRESYS'
    };

    for (const b of [fluke, additel, bottom]) {
      const nodes = extractHeroBlocks(b, 'p1', 1);
      const nodeIds = nodes.map((n) => n.id);
      const uniqueIds = new Set(nodeIds);
      expect(uniqueIds.size).toBe(nodeIds.length);
    }
  });

  // ==========================================================================
  // 4. I18N GHOST EXTRACTION: Blocos vazios não geram nós fantasmas
  // ==========================================================================
  it('HEADER-I18N-GHOST-1: Fluke vazio não extrai fake description, highlights ou badgeSecondary', () => {
    const emptyFluke: ContentBlock = {
      id: 'f-empty',
      type: 'fluke_header'
    };
    const nodes = extractHeroBlocks(emptyFluke, 'p1', 1);
    expect(nodes.length).toBe(0);
  });

  it('HEADER-I18N-GHOST-2: Additel vazio não extrai fake overview, bullets ou badgeSubtitle', () => {
    const emptyAdditel: ContentBlock = {
      id: 'a-empty',
      type: 'additel_two_col_hero'
    };
    const nodes = extractHeroBlocks(emptyAdditel, 'p1', 1);
    expect(nodes.length).toBe(0);
  });

  it('HEADER-I18N-GHOST-3: Bottom vazio não extrai fake badge ou contatos (policy none)', () => {
    const emptyBottom: ContentBlock = {
      id: 'b-empty',
      type: 'bottom_header'
    };
    const nodes = extractHeroBlocks(emptyBottom, 'p1', 1);
    expect(nodes.length).toBe(0);
  });

  // ==========================================================================
  // 5. ADDITEL-I18N-BULLETS-1: Extração e aplicação sobre customData.bullets canônico
  // ==========================================================================
  it('ADDITEL-I18N-BULLETS-1: extrai e aplica traduções em customData.bullets sem criar bulletList', () => {
    const additel: ContentBlock = {
      id: 'a-bullets',
      type: 'additel_two_col_hero',
      title: 'Pressão Autônoma',
      customData: {
        bullets: ['Geração até 100 bar', 'Exatidão 0.01%']
      }
    };

    const nodes = extractHeroBlocks(additel, 'p1', 1);
    const bulletNodes = nodes.filter((n) => n.path.startsWith('customData.bullets'));
    expect(bulletNodes.length).toBe(2);
    expect(bulletNodes[0].path).toBe('customData.bullets[0]');
    expect(bulletNodes[1].path).toBe('customData.bullets[1]');

    // Aplicação via TranslationApplierRegistry
    const catalog = {
      id: 'cat-1',
      name: 'Teste',
      version: 1,
      cover: { title: 'Capa' },
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [JSON.parse(JSON.stringify(additel))]
        }
      ]
    };

    const transMap = new Map<string, string>([
      [bulletNodes[0].id, 'Generation up to 100 bar'],
      [bulletNodes[1].id, 'Accuracy 0.01%']
    ]);

    const result = TranslationApplierRegistry.applyTranslations(catalog as any, transMap, 'en');
    const translatedBlock = result.translatedCatalog.pages[0].blocks[0];

    expect(translatedBlock.customData.bullets[0]).toBe('Generation up to 100 bar');
    expect(translatedBlock.customData.bullets[1]).toBe('Accuracy 0.01%');
    expect(translatedBlock.customData.bulletList).toBeUndefined();
  });

  // ==========================================================================
  // 6. BOTTOM CONTRAST RENDER: Amarelo deriva texto escuro, azul deriva texto claro
  // ==========================================================================
  it('BOTTOM-CONTRAST-RENDER: presys_yellow renderiza texto escuro e navy renderiza texto claro', () => {
    const yellowBottom: ContentBlock = {
      id: 'b-yellow',
      type: 'bottom_header',
      title: 'Presys Amarelo',
      style: { gradient: 'bg-[#FFC20E]' }
    };

    act(() => {
      root!.render(<BottomHeaderBlock block={yellowBottom} pageId="p1" isSelected={false} />);
    });

    const yellowHeading = container.querySelector('h2');
    expect(yellowHeading?.className).toContain('text-slate-900');

    // Navy corporativo
    const navyBottom: ContentBlock = {
      id: 'b-navy',
      type: 'bottom_header',
      title: 'Presys Navy',
      style: { gradient: 'bg-[#001f3f]' }
    };

    act(() => {
      root!.render(<BottomHeaderBlock block={navyBottom} pageId="p1" isSelected={false} />);
    });

    const navyHeading = container.querySelector('h2');
    expect(navyHeading?.className).toContain('text-white');
  });

  // ==========================================================================
  // 7. BOTTOM TRANSLATION FAIL-CLOSED (BOTTOM-I18N-NONE-1)
  // ==========================================================================
  it('BOTTOM-I18N-NONE-1: Applier falha fechado — contatos com policy "none" nunca são mutados por mapa artificial', () => {
    const bottomBlock: ContentBlock = {
      id: 'b-bottom-contacts',
      type: 'bottom_header',
      title: 'Presys Metrologia',
      subtitle: 'Calibração Primária',
      customData: {
        phone: '+55 (11) 3038-1300',
        email: 'vendas@presys.com.br',
        website: 'www.presys.com.br'
      }
    };

    // Extractor: zero nós gerados para phone, email ou website
    const nodes = extractHeroBlocks(bottomBlock, 'p1', 1);
    expect(nodes.some((n) => n.path.includes('phone'))).toBe(false);
    expect(nodes.some((n) => n.path.includes('email'))).toBe(false);
    expect(nodes.some((n) => n.path.includes('website'))).toBe(false);

    // Constrói transMap artificial tentando injetar traduções nos contatos
    const fakeTransMap = new Map<string, string>([
      ['p1_bb-bottom-contacts_phone', '+1 (800) 555-0199'],
      ['p1_bb-bottom-contacts_email', 'sales@presys-us.com'],
      ['p1_bb-bottom-contacts_website', 'www.presys-us.com']
    ]);

    const catalog = {
      id: 'cat-fail-closed',
      name: 'Catálogo Teste',
      version: 1,
      cover: { title: 'Capa' },
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [JSON.parse(JSON.stringify(bottomBlock))]
        }
      ]
    };

    const result = TranslationApplierRegistry.applyTranslations(catalog as any, fakeTransMap, 'en');
    const targetBlock = result.translatedCatalog.pages[0].blocks[0];

    // EXPECTED: contatos originais permanecem estritamente intactos (fail-closed)
    expect(targetBlock.customData.phone).toBe('+55 (11) 3038-1300');
    expect(targetBlock.customData.email).toBe('vendas@presys.com.br');
    expect(targetBlock.customData.website).toBe('www.presys.com.br');
  });

  // ==========================================================================
  // 8. CUSTOM COLOR CONTRAST TESTS (FLUKE-CONTRAST-1, ADDITEL-CONTRAST-1, PARITY)
  // ==========================================================================
  it('FLUKE-CONTRAST-1: badgeBg="#FFC20E" renderiza foreground escuro e "#003366" renderiza claro', () => {
    const yellowFluke: ContentBlock = {
      id: 'f-yellow',
      type: 'fluke_header',
      badgeText: 'PRESYS',
      customData: {
        badgeBg: '#FFC20E',
        badgeSecondary: 'Calibration'
      }
    };

    act(() => {
      root!.render(<FlukeHeaderBlock block={yellowFluke} pageId="p1" isSelected={false} />);
    });

    const badgeTextEl = container.querySelector('[data-printable-field="badgeText"]');
    const badgeSecEl = container.querySelector('[data-printable-field="badgeSecondary"]');

    expect(badgeTextEl?.className).toContain('text-slate-900');
    expect(badgeSecEl?.className).toContain('text-slate-800');

    // Com o default #003366 (escuro), renderiza texto claro
    const defaultFluke: ContentBlock = {
      id: 'f-default',
      type: 'fluke_header',
      badgeText: 'PRESYS',
      customData: {
        badgeSecondary: 'Calibration'
      }
    };

    act(() => {
      root!.render(<FlukeHeaderBlock block={defaultFluke} pageId="p1" isSelected={false} />);
    });

    const defBadgeTextEl = container.querySelector('[data-printable-field="badgeText"]');
    expect(defBadgeTextEl?.className).toContain('text-white');
  });

  it('ADDITEL-CONTRAST-1: themeColor="#FFC20E" renderiza foreground escuro e "#003366" renderiza claro', () => {
    const yellowAdditel: ContentBlock = {
      id: 'a-yellow',
      type: 'additel_two_col_hero',
      badgeText: 'PRESYS',
      customData: {
        themeColor: '#FFC20E',
        badgeSubtitle: 'Precision Metrology'
      }
    };

    act(() => {
      root!.render(<AdditelTwoColBlock block={yellowAdditel} pageId="p1" isSelected={false} />);
    });

    const badgeTextEl = container.querySelector('[data-printable-field="badgeText"]');
    const badgeSubEl = container.querySelector('[data-printable-field="badgeSubtitle"]');

    expect(badgeTextEl?.className).toContain('text-slate-900');
    expect(badgeSubEl?.className).toContain('text-slate-700');

    // Com o default #003366 (escuro), renderiza texto claro e azul secundário
    const defaultAdditel: ContentBlock = {
      id: 'a-default',
      type: 'additel_two_col_hero',
      badgeText: 'PRESYS',
      customData: {
        badgeSubtitle: 'Precision Metrology'
      }
    };

    act(() => {
      root!.render(<AdditelTwoColBlock block={defaultAdditel} pageId="p1" isSelected={false} />);
    });

    const defBadgeTextEl = container.querySelector('[data-printable-field="badgeText"]');
    const defBadgeSubEl = container.querySelector('[data-printable-field="badgeSubtitle"]');

    expect(defBadgeTextEl?.className).toContain('text-white');
    expect(defBadgeSubEl?.className).toContain('text-blue-200');
  });

  it('HEADER-CONTRAST-PARITY-1: Editor e CleanA4 export utilizam a mesma derivação de contraste', () => {
    const yellowFluke: ContentBlock = {
      id: 'f-yellow-parity',
      type: 'fluke_header',
      badgeText: 'PRESYS',
      customData: {
        badgeBg: '#FFC20E',
        badgeSecondary: 'Calibration'
      }
    };

    // No Editor (isExport=false)
    act(() => {
      root!.render(<FlukeHeaderBlock block={yellowFluke} pageId="p1" isSelected={false} isExport={false} />);
    });
    const editorTextEl = container.querySelector('[data-printable-field="badgeText"]');
    expect(editorTextEl?.className).toContain('text-slate-900');

    // No CleanA4 (isExport=true)
    act(() => {
      root!.render(<FlukeHeaderBlock block={yellowFluke} pageId="p1" isSelected={false} isExport={true} />);
    });
    const exportTextEl = container.querySelector('[data-printable-field="badgeText"]');
    expect(exportTextEl?.className).toContain('text-slate-900');
  });
});
