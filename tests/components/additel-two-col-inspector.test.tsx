// tests/components/additel-two-col-inspector.test.tsx
// Testes de integração do AdditelTwoColInspector (CORE.E6A).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdditelTwoColInspector } from '../../src/components/editor/inspector/AdditelTwoColInspector';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { ContentBlock } from '../../src/domain/catalog.schema';

describe('AdditelTwoColInspector (CORE.E6A)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const mockBlock: ContentBlock = {
    id: 'additel-1',
    type: 'additel_two_col_hero',
    title: 'Presys PCON-Y18',
    subtitle: 'Calibrador Automático de Pressão',
    badgeText: 'PRESYS Metrology',
    customData: {
      badgeSubtitle: 'Precision Metrology',
      overview: 'Calibrador autônomo com bomba interna.',
      bullets: ['Pressão até 100 bar', 'Exatidão 0.01% FE'],
      themeColor: '#003366'
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

  it('ADDITEL-INSP-1: renderiza campos e bullets canônicos', () => {
    act(() => {
      root!.render(<AdditelTwoColInspector block={mockBlock} pageId="page-1" />);
    });

    const titleInput = container.querySelector('#additel-field-title') as HTMLInputElement;
    const subtitleInput = container.querySelector('#additel-field-subtitle') as HTMLInputElement;
    const badgeInput = container.querySelector('#additel-field-badge-text') as HTMLInputElement;
    const badgeSubInput = container.querySelector('#additel-field-badge-subtitle') as HTMLInputElement;
    const overviewInput = container.querySelector('#additel-field-overview') as HTMLTextAreaElement;

    expect(titleInput.value).toBe('Presys PCON-Y18');
    expect(subtitleInput.value).toBe('Calibrador Automático de Pressão');
    expect(badgeInput.value).toBe('PRESYS Metrology');
    expect(badgeSubInput.value).toBe('Precision Metrology');
    expect(overviewInput.value).toBe('Calibrador autônomo com bomba interna.');
  });

  it('ADDITEL-INSP-2: adição de bullet escreve exclusivamente em customData.bullets', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(<AdditelTwoColInspector block={mockBlock} pageId="page-1" />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const addBtn = buttons.find((b) => b.textContent?.includes('+ Recurso'));
    expect(addBtn).toBeDefined();

    act(() => {
      addBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'additel-1', {
      customData: {
        ...mockBlock.customData,
        bullets: ['Pressão até 100 bar', 'Exatidão 0.01% FE', '']
      }
    });
  });

  it('ADDITEL-INSP-3: bloco legado com bulletList lê valores e novas escritas migram para bullets', () => {
    const legacyBlock: ContentBlock = {
      id: 'additel-legacy',
      type: 'additel_two_col_hero',
      title: 'PCON Antigo',
      customData: {
        bulletList: ['Item Antigo 1', 'Item Antigo 2']
      }
    };

    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    act(() => {
      root!.render(<AdditelTwoColInspector block={legacyBlock} pageId="page-1" />);
    });

    const bulletInput0 = container.querySelector('#additel-bullet-item-0') as HTMLInputElement;
    expect(bulletInput0.value).toBe('Item Antigo 1');

    // Ao alterar, salva em bullets canônico
    act(() => {
      setInputValue(bulletInput0, 'Item Atualizado');
    });

    expect(updateBlockSpy).toHaveBeenCalledWith('page-1', 'additel-legacy', {
      customData: {
        bulletList: ['Item Antigo 1', 'Item Antigo 2'],
        bullets: ['Item Atualizado', 'Item Antigo 2']
      }
    });
  });
});
