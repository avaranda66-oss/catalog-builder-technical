// tests/components/text-inspector.test.tsx
// Testes unitários e de integração para TextInspector e Safe TextBlock (CORE.E5A.1).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { TextInspector } from '../../src/components/editor/inspector/TextInspector';
import { TextBlock } from '../../src/components/editor/blocks/TextBlock';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';
import { extractTextAndBoxBlocks } from '../../src/translation/block-extractors/text.extractor';

describe('TextInspector & Safe TextBlock (CORE.E5A.1)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const sampleTextBlock: ContentBlock = {
    id: 'block-text-1',
    type: 'text',
    textContent: 'Texto técnico de calibração metrológica.'
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    useCatalogStore.setState({
      currentCatalog: {
        id: 'cat-test',
        title: 'Catálogo de Teste',
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            title: 'Página 1',
            blocks: [sampleTextBlock]
          }
        ]
      } as any,
      activePageIndex: 0,
      selectedBlockId: 'block-text-1'
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container.remove();
  });

  const renderComponent = (block: ContentBlock = sampleTextBlock) => {
    act(() => {
      root!.render(<TextInspector block={block} pageId="page-1" />);
    });
  };

  const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // ==========================================================================
  // 1. TEXT-INSPECTOR-1: PROPERTIESPANEL MONTA O TEXTINSPECTOR
  // ==========================================================================
  it('TEXT-INSPECTOR-1: PropertiesPanel monta TextInspector ao selecionar bloco tipo text', () => {
    act(() => {
      root!.render(<PropertiesPanel />);
    });

    const section = container.querySelector('#inspector-text-section-content');
    expect(section).not.toBeNull();
    expect(container.textContent).toContain('Conteúdo Textual');
  });

  // ==========================================================================
  // 2. TEXT-INSPECTOR-2: APENAS CAPABILITY OFICIAL (CONTENT_BODY), SEM CONTROLES MORTOS
  // ==========================================================================
  it('TEXT-INSPECTOR-2: somente Content capability é renderizada, sem controles aspiracionais', () => {
    renderComponent();

    const textarea = container.querySelector('#text-field-content');
    expect(textarea).not.toBeNull();

    // Zero controles aspiracionais
    const text = container.textContent || '';
    expect(text).not.toContain('Tamanho da Fonte');
    expect(text).not.toContain('Família Tipográfica');
    expect(text).not.toContain('Alinhamento');
    expect(text).not.toContain('Cor do Texto');
    expect(text).not.toContain('Espaçamento');
  });

  // ==========================================================================
  // 3. TEXT-INSPECTOR-3: EDIÇÃO DE TEXTCONTENT ATUALIZA CAMPO CORRETO NO STORE
  // ==========================================================================
  it('TEXT-INSPECTOR-3: editar textContent altera campo correto no updateBlock', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    renderComponent();

    const textarea = container.querySelector('#text-field-content') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Texto técnico de calibração metrológica.');

    act(() => {
      setInputValue(textarea, 'Novo texto técnico atualizado.');
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-text-1', {
      textContent: 'Novo texto técnico atualizado.'
    });
  });

  // ==========================================================================
  // 4. TEXT-NO-MUTATION-1: TEXTBLOCK NO CANVAS GERA ZERO UPDATEBLOCK
  // ==========================================================================
  it('TEXT-NO-MUTATION-1: TextBlock não é contentEditable e interações de canvas geram ZERO mutações', () => {
    const updateBlockSpy = vi.fn();
    const setSelectedBlockIdSpy = vi.fn();
    useCatalogStore.setState({
      updateBlock: updateBlockSpy,
      setSelectedBlockId: setSelectedBlockIdSpy
    });

    act(() => {
      root!.render(<TextBlock block={sampleTextBlock} pageId="page-1" isSelected={false} />);
    });

    // contentEditable não deve existir no DOM
    const editable = container.querySelector('[contenteditable="true"]');
    expect(editable).toBeNull();

    const blockEl = container.firstElementChild as HTMLElement;
    expect(blockEl).not.toBeNull();

    // Clicar seleciona o bloco mas gera ZERO updateBlock
    act(() => {
      blockEl.click();
    });
    expect(setSelectedBlockIdSpy).toHaveBeenCalledWith('block-text-1');
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);

    // Focus e blur no elemento não disparam updateBlock
    act(() => {
      blockEl.dispatchEvent(new Event('focus', { bubbles: true }));
      blockEl.dispatchEvent(new Event('blur', { bubbles: true }));
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  // ==========================================================================
  // 5. TEXT-MARKUP-1: PRESERVAÇÃO DE SOURCE E RENDER DE HEADING H1
  // ==========================================================================
  it('TEXT-MARKUP-1: # Título Técnico renderiza H1 e preserva source intacta sem mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const headingBlock: ContentBlock = {
      id: 'block-h1',
      type: 'text',
      textContent: '# Especificações Técnicas de Pressão'
    };

    act(() => {
      root!.render(<TextBlock block={headingBlock} pageId="page-1" isSelected={true} />);
    });

    const h1 = container.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe('Especificações Técnicas de Pressão');
    expect(h1?.className).toContain('text-2xl font-bold');

    // Interações não mutam o bloco
    const blockEl = container.firstElementChild as HTMLElement;
    act(() => {
      blockEl.click();
    });
    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
    expect(headingBlock.textContent).toBe('# Especificações Técnicas de Pressão');
  });

  // ==========================================================================
  // 6. TEXT-MARKUP-2: HEADINGS H2 E H3 COM ZERO MUTAÇÃO
  // ==========================================================================
  it('TEXT-MARKUP-2: ## Subtítulo e ### Seção renderizam H2 e H3 com zero mutação', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const multiHeadingBlock: ContentBlock = {
      id: 'block-h23',
      type: 'text',
      textContent: '## Calibração Primária\n### Faixa de Operação\nTexto explicativo complementar.'
    };

    act(() => {
      root!.render(<TextBlock block={multiHeadingBlock} pageId="page-1" isSelected={false} />);
    });

    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe('Calibração Primária');
    expect(h2?.className).toContain('text-xl font-bold');

    const h3 = container.querySelector('h3');
    expect(h3).not.toBeNull();
    expect(h3?.textContent).toBe('Faixa de Operação');
    expect(h3?.className).toContain('text-base font-semibold');

    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe('Texto explicativo complementar.');

    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  // ==========================================================================
  // 7. TEXT-SAFE-1: RAW HTML É RENDERIZADO COMO TEXTO LITERAL (SEM ELEMENTO <img>)
  // ==========================================================================
  it('TEXT-SAFE-1: <img src=x onerror=alert(1)> é texto literal e nenhum elemento img é criado no DOM', () => {
    const xssBlock: ContentBlock = {
      id: 'block-xss-img',
      type: 'text',
      textContent: '<img src=x onerror=alert(1)>'
    };

    act(() => {
      root!.render(<TextBlock block={xssBlock} pageId="page-1" />);
    });

    const imgEl = container.querySelector('img');
    expect(imgEl).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  // ==========================================================================
  // 8. TEXT-SAFE-2: RAW SCRIPT É RENDERIZADO COMO TEXTO LITERAL (SEM ELEMENTO <script>)
  // ==========================================================================
  it('TEXT-SAFE-2: <script>alert(1)</script> é texto literal e nenhum script é criado no DOM', () => {
    const xssScriptBlock: ContentBlock = {
      id: 'block-xss-script',
      type: 'text',
      textContent: '<script>alert(1)</script>'
    };

    act(() => {
      root!.render(<TextBlock block={xssScriptBlock} pageId="page-1" />);
    });

    const scriptEl = container.querySelector('script');
    expect(scriptEl).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  // ==========================================================================
  // 9. TEXT-PRINT-1: PLACEHOLDER DO EDITOR NÃO APARECE NO CLEANA4/PDF
  // ==========================================================================
  it('TEXT-PRINT-1: placeholder "Digite o texto aqui..." não aparece quando isExport=true', () => {
    const emptyTextBlock: ContentBlock = {
      id: 'block-text-empty',
      type: 'text',
      textContent: ''
    };

    // Modo Editor: renderiza placeholder
    act(() => {
      root!.render(<TextBlock block={emptyTextBlock} pageId="page-1" isExport={false} />);
    });
    expect(container.textContent).toContain('Digite o texto aqui...');

    // Modo Export / CleanA4: placeholder ausente
    act(() => {
      root!.render(<TextBlock block={emptyTextBlock} pageId="page-1" isExport={true} />);
    });
    expect(container.textContent).not.toContain('Digite o texto aqui...');
    expect(container.textContent).toBe('');
  });

  // ==========================================================================
  // 10. TEXT-PRINT-PARITY-1: PARIDADE DOCUMENTAL ENTRE EDITOR E CLEANA4
  // ==========================================================================
  it('TEXT-PRINT-PARITY-1: Editor e CleanA4 renderizam a mesma estrutura documental', () => {
    const docBlock: ContentBlock = {
      id: 'block-doc-parity',
      type: 'text',
      textContent: '# Sensor de Alta Precisão\nLinha A de especificação\nLinha B com tolerância'
    };

    // 1. Editor
    act(() => {
      root!.render(<TextBlock block={docBlock} pageId="page-1" isExport={false} isSelected={true} />);
    });
    const editorH1 = container.querySelector('h1')?.textContent;
    const editorParas = Array.from(container.querySelectorAll('p')).map((p) => p.textContent);

    // 2. Export / CleanA4
    act(() => {
      root!.render(<TextBlock block={docBlock} pageId="page-1" isExport={true} isSelected={false} />);
    });
    const exportH1 = container.querySelector('h1')?.textContent;
    const exportParas = Array.from(container.querySelectorAll('p')).map((p) => p.textContent);

    expect(exportH1).toBe(editorH1);
    expect(exportParas).toEqual(editorParas);
    // Export não tem anéis ou cursores de edição
    const exportBlockEl = container.firstElementChild as HTMLElement;
    expect(exportBlockEl.className).toContain('shadow-none');
    expect(exportBlockEl.className).not.toContain('cursor-pointer');
  });

  // ==========================================================================
  // 11. TEXT-I18N-1: TEXTCONTENT É EXTRAÍVEL E APLICÁVEL PELA TRADUÇÃO
  // ==========================================================================
  it('TEXT-I18N-1: textContent é extraído como nó de tradução com policy translate', () => {
    const nodes = extractTextAndBoxBlocks(sampleTextBlock, 'page-1', 1);
    const textNode = nodes.find((n) => n.path === 'textContent');

    expect(textNode).toBeDefined();
    expect(textNode?.sourceText).toBe('Texto técnico de calibração metrológica.');
    expect(textNode?.policy).toBe('translate');
  });
});
