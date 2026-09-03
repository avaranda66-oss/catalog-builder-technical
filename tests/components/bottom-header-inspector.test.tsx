// tests/components/bottom-header-inspector.test.tsx
// Testes de integração do BottomHeaderInspector (CORE.E6A).

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BottomHeaderInspector } from '../../src/components/editor/inspector/BottomHeaderInspector';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { ContentBlock } from '../../src/domain/catalog.schema';

describe('BottomHeaderInspector (CORE.E6A)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const mockBlock: ContentBlock = {
    id: 'bottom-1',
    type: 'bottom_header',
    title: 'PRESYS INSTRUMENTOS LTDA',
    subtitle: 'Soluções de Metrologia',
    badgeText: 'ISO 9001',
    style: {
      gradient: 'bg-[#001f3f]'
    },
    customData: {
      phone: '+55 (11) 3038-1300',
      email: 'vendas@presys.com.br',
      website: 'www.presys.com.br'
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

  it('BOTTOM-INSP-1: renderiza campos institucionais e de contato', () => {
    act(() => {
      root!.render(<BottomHeaderInspector block={mockBlock} pageId="page-1" />);
    });

    const titleInput = container.querySelector('#bottom-field-title') as HTMLInputElement;
    const subtitleInput = container.querySelector('#bottom-field-subtitle') as HTMLInputElement;
    const badgeInput = container.querySelector('#bottom-field-badge-text') as HTMLInputElement;

    expect(titleInput.value).toBe('PRESYS INSTRUMENTOS LTDA');
    expect(subtitleInput.value).toBe('Soluções de Metrologia');
    expect(badgeInput.value).toBe('ISO 9001');
  });

  it('BOTTOM-INSP-2: seleção de paleta presys_yellow grava style.gradient canônico e limpa customData', () => {
    const updateBlockSpy = vi.fn();
    useCatalogStore.setState({ updateBlock: updateBlockSpy });

    const legacyBlock: ContentBlock = {
      ...mockBlock,
      customData: {
        ...mockBlock.customData,
        gradient: 'bg-legacy-grad'
      }
    };

    act(() => {
      root!.render(<BottomHeaderInspector block={legacyBlock} pageId="page-1" />);
    });

    // Clica no header da seção de Aparência para expandir os botões
    const sections = Array.from(container.querySelectorAll('button'));
    const appearanceHeader = sections.find((b) => b.textContent?.includes('Aparência & Paleta Visual'));
    expect(appearanceHeader).toBeDefined();

    act(() => {
      appearanceHeader!.click();
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const yellowBtn = buttons.find((b) => b.title?.includes('Amarelo Presys'));
    expect(yellowBtn).toBeDefined();

    act(() => {
      yellowBtn!.click();
    });

    expect(updateBlockSpy).toHaveBeenCalledTimes(1);
    const [calledPageId, calledBlockId, patch] = updateBlockSpy.mock.calls[0];
    expect(calledPageId).toBe('page-1');
    expect(calledBlockId).toBe('bottom-1');
    expect(patch.style.gradient).toBe('bg-[#FFC20E]');
    expect(patch.customData.gradient).toBeUndefined();
    expect(patch.customData.phone).toBe('+55 (11) 3038-1300');
  });
});
