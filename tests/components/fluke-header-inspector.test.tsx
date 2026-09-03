// tests/components/fluke-header-inspector.test.tsx
// Testes de integração do FlukeHeaderInspector (CORE.E6A).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlukeHeaderInspector } from '../../src/components/editor/inspector/FlukeHeaderInspector';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { ContentBlock } from '../../src/domain/catalog.schema';

describe('FlukeHeaderInspector (CORE.E6A)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const mockBlock: ContentBlock = {
    id: 'fluke-1',
    type: 'fluke_header',
    title: 'Field Metrology Wells',
    subtitle: 'Série T Metrológica',
    badgeText: 'PRESYS Calibration',
    customData: {
      badgeSecondary: 'Primary Lab',
      description: 'Calibrador de temperatura de alta estabilidade.',
      highlights: ['Faixa de -25 a 660 °C', 'Estabilidade ±0.01 °C'],
      badgeBg: '#003366'
    }
  };

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

  it('FLUKE-INSP-1: renderiza campos de conteúdo com valores do bloco', () => {
    act(() => {
      root!.render(<FlukeHeaderInspector block={mockBlock} pageId="page-1" />);
    });

    const titleInput = container.querySelector('#fluke-field-title') as HTMLInputElement;
    const subtitleInput = container.querySelector('#fluke-field-subtitle') as HTMLInputElement;
    const badgeInput = container.querySelector('#fluke-field-badge-text') as HTMLInputElement;
    const badgeSecInput = container.querySelector('#fluke-field-badge-secondary') as HTMLInputElement;
    const descInput = container.querySelector('#fluke-field-description') as HTMLTextAreaElement;

    expect(titleInput.value).toBe('Field Metrology Wells');
    expect(subtitleInput.value).toBe('Série T Metrológica');
    expect(badgeInput.value).toBe('PRESYS Calibration');
    expect(badgeSecInput.value).toBe('Primary Lab');
    expect(descInput.value).toBe('Calibrador de temperatura de alta estabilidade.');
  });

  it('FLUKE-INSP-2: alteração de campos atualiza catálogo via updateBlock', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(<FlukeHeaderInspector block={mockBlock} pageId="page-1" />);
    });

    const titleInput = container.querySelector('#fluke-field-title') as HTMLInputElement;
    act(() => {
      setInputValue(titleInput, 'Presys T-660P');
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'fluke-1', {
      title: 'Presys T-660P'
    });
  });

  it('FLUKE-INSP-3: adição, edição e remoção de highlights metrológicos', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(<FlukeHeaderInspector block={mockBlock} pageId="page-1" />);
    });

    // Clicar em adicionar destaque (+ Destaque)
    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find((b) => b.textContent?.includes('+ Destaque'));
    expect(addBtn).toBeDefined();

    act(() => {
      addBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'fluke-1', {
      customData: {
        ...mockBlock.customData,
        highlights: ['Faixa de -25 a 660 °C', 'Estabilidade ±0.01 °C', '']
      }
    });
  });
});
