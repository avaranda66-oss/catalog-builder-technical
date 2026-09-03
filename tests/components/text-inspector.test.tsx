// tests/components/text-inspector.test.tsx
// Testes unitários e de integração para TextInspector e TextBlock (CORE.E5A).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { TextInspector } from '../../src/components/editor/inspector/TextInspector';
import { TextBlock } from '../../src/components/editor/blocks/TextBlock';
import { PropertiesPanel } from '../../src/components/editor/PropertiesPanel';
import { extractTextAndBoxBlocks } from '../../src/translation/block-extractors/text.extractor';

describe('TextInspector & TextBlock (CORE.E5A)', () => {
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
  // 1. TEXT-INSPECTOR-1: PROPERTIESPANEL MONTA O NOVO TEXTINSPECTOR
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
  // 4. TEXT-RENDER-1: BLUR SEM MUDANÇA GERA ZERO UPDATEBLOCK
  // ==========================================================================
  it('TEXT-RENDER-1: blur no TextBlock sem alteração de texto gera ZERO mutações', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(<TextBlock block={sampleTextBlock} pageId="page-1" isSelected={true} />);
    });

    const editable = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    expect(editable).not.toBeNull();

    // Blur sem alterar innerText
    act(() => {
      editable.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(0);
  });

  it('TEXT-RENDER-2: blur no TextBlock com alteração comita novo texto', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(<TextBlock block={sampleTextBlock} pageId="page-1" isSelected={true} />);
    });

    const editable = container.querySelector('[contenteditable="true"]') as HTMLDivElement;
    expect(editable).not.toBeNull();

    act(() => {
      editable.innerText = 'Texto digitado inline no canvas.';
      editable.textContent = 'Texto digitado inline no canvas.';
      editable.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      editable.dispatchEvent(new Event('blur', { bubbles: true }));
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'block-text-1', {
      textContent: 'Texto digitado inline no canvas.'
    });
  });

  // ==========================================================================
  // 5. TEXT-PRINT-1: PLACEHOLDER DO EDITOR NÃO APARECE NO CLEANA4/PDF
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
  // 6. TEXT-I18N-1: TEXTCONTENT É EXTRAÍVEL E APLICÁVEL PELA TRADUÇÃO
  // ==========================================================================
  it('TEXT-I18N-1: textContent é extraído como nó de tradução com policy translate', () => {
    const nodes = extractTextAndBoxBlocks(sampleTextBlock, 'page-1', 1);
    const textNode = nodes.find((n) => n.path === 'textContent');

    expect(textNode).toBeDefined();
    expect(textNode?.sourceText).toBe('Texto técnico de calibração metrológica.');
    expect(textNode?.policy).toBe('translate');
  });
});
