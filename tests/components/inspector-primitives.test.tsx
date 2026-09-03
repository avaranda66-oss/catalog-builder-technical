// tests/components/inspector-primitives.test.tsx
// Suíte de Testes Automatizados para Primitives do Inspector Design System PRESYS (CORE.E3).
// Valida contratos de disclosure, acessibilidade WAI-ARIA, isolamento de Store,
// eliminação completa de emojis e semântica estrita de formulários.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput,
  InspectorTextArea,
  InspectorSelect,
  InspectorSegmentedControl,
  InspectorNumberInput,
  InspectorDimensionInput,
  InspectorToggle,
  InspectorActionRow,
  InspectorResetAction
} from '../../src/components/editor/inspector/components';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

describe('Inspector Design System Primitives (CORE.E3)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // INSPECTOR-PRIM-1: Section expand/collapse
  // ==========================================================================
  it('INSPECTOR-PRIM-1: InspectorSection expande e colapsa sob clique no header', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSection title="Seção de Teste" defaultOpen={false}>
          <div data-testid="section-content">Conteúdo Interno</div>
        </InspectorSection>
      );
    });

    const headerButton = container.querySelector('button');
    expect(headerButton).not.toBeNull();
    // Inicialmente fechada: conteúdo não está no DOM
    expect(container.querySelector('[data-testid="section-content"]')).toBeNull();

    // 1º clique: expande
    act(() => {
      headerButton?.click();
    });
    expect(container.querySelector('[data-testid="section-content"]')).not.toBeNull();
    expect(container.textContent).toContain('Conteúdo Interno');

    // 2º clique: colapsa
    act(() => {
      headerButton?.click();
    });
    expect(container.querySelector('[data-testid="section-content"]')).toBeNull();
  });

  // ==========================================================================
  // INSPECTOR-PRIM-2: aria-expanded / aria-controls corretos
  // ==========================================================================
  it('INSPECTOR-PRIM-2: InspectorSection fornece aria-expanded e aria-controls válidos vinculados ao id do conteúdo', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSection id="sec-a11y" title="Acessibilidade" defaultOpen={true}>
          <p>Filho acessível</p>
        </InspectorSection>
      );
    });

    const headerButton = container.querySelector('#sec-a11y-header') as HTMLButtonElement;
    expect(headerButton).not.toBeNull();
    expect(headerButton.getAttribute('aria-expanded')).toBe('true');

    const controlsId = headerButton.getAttribute('aria-controls');
    expect(controlsId).toBe('sec-a11y-content');

    const contentRegion = container.querySelector(`#${controlsId}`) as HTMLElement;
    expect(contentRegion).not.toBeNull();
    expect(contentRegion.getAttribute('role')).toBe('region');
    expect(contentRegion.getAttribute('aria-labelledby')).toBe('sec-a11y-header');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-3: Section collapse não toca Store/document
  // ==========================================================================
  it('INSPECTOR-PRIM-3: toggle de InspectorSection é estritamente UI state e não muta Store nem dispara save', () => {
    const initialState = useCatalogStore.getState();
    const initialRevision = initialState.currentCatalog?.pages.length ?? 0;

    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSection title="Isolamento de Store" defaultOpen={true}>
          <span>Sem efeitos colaterais no documento</span>
        </InspectorSection>
      );
    });

    const headerButton = container.querySelector('button');
    act(() => {
      headerButton?.click(); // fecha
      headerButton?.click(); // abre
      headerButton?.click(); // fecha
    });

    const afterState = useCatalogStore.getState();
    expect(afterState.currentCatalog?.pages.length ?? 0).toBe(initialRevision);
    expect(afterState.isDirty).toBe(initialState.isDirty);
  });

  // ==========================================================================
  // INSPECTOR-PRIM-4: Field label htmlFor liga ao input id
  // ==========================================================================
  it('INSPECTOR-PRIM-4: InspectorField vincula label ao id do input via htmlFor', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorField label="Nome da Seção" htmlFor="section-name-input">
          <InspectorTextInput id="section-name-input" defaultValue="Texto Inicial" />
        </InspectorField>
      );
    });

    const label = container.querySelector('label');
    const input = container.querySelector('input');

    expect(label).not.toBeNull();
    expect(input).not.toBeNull();
    expect(label?.getAttribute('for')).toBe('section-name-input');
    expect(input?.id).toBe('section-name-input');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-5: Error usa Lucide/accessible feedback, zero emoji
  // ==========================================================================
  it('INSPECTOR-PRIM-5: InspectorField exibe feedback de erro com role="alert", Lucide AlertTriangle e ZERO emoji', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorField label="Campo com Erro" error="Valor fora dos limites permitidos">
          <InspectorTextInput hasError />
        </InspectorField>
      );
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Valor fora dos limites permitidos');

    // Comprova ausência total do caractere emoji ⚠ ou outros emojis
    expect(container.innerHTML).not.toContain('⚠');
    expect(container.innerHTML).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);

    // Comprova renderização do ícone SVG da Lucide
    const svgIcon = alertEl?.querySelector('svg');
    expect(svgIcon).not.toBeNull();
    expect(svgIcon?.getAttribute('aria-hidden')).toBe('true');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-6: TextInput disabled/error states
  // ==========================================================================
  it('INSPECTOR-PRIM-6: InspectorTextInput reflete corretamente disabled e aria-invalid em caso de erro', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <div>
          <InspectorTextInput id="input-normal" />
          <InspectorTextInput id="input-disabled" disabled />
          <InspectorTextInput id="input-error" hasError />
        </div>
      );
    });

    const normal = container.querySelector('#input-normal') as HTMLInputElement;
    const disabled = container.querySelector('#input-disabled') as HTMLInputElement;
    const error = container.querySelector('#input-error') as HTMLInputElement;

    expect(normal.disabled).toBe(false);
    expect(normal.getAttribute('aria-invalid')).toBeNull();

    expect(disabled.disabled).toBe(true);

    expect(error.getAttribute('aria-invalid')).toBe('true');
    expect(error.className).toContain('border-rose-400');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-6B: TextArea rows e error state
  // ==========================================================================
  it('INSPECTOR-PRIM-6B: InspectorTextArea respeita rows, disabled e aria-invalid em erro', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <div>
          <InspectorTextArea id="textarea-default" rows={4} defaultValue="Texto Multilinha" />
          <InspectorTextArea id="textarea-error" hasError />
        </div>
      );
    });

    const defaultTa = container.querySelector('#textarea-default') as HTMLTextAreaElement;
    const errorTa = container.querySelector('#textarea-error') as HTMLTextAreaElement;

    expect(defaultTa.rows).toBe(4);
    expect(defaultTa.value).toBe('Texto Multilinha');
    expect(errorTa.getAttribute('aria-invalid')).toBe('true');
    expect(errorTa.className).toContain('border-rose-400');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-7: Select funciona com option real
  // ==========================================================================
  it('INSPECTOR-PRIM-7: InspectorSelect renderiza opções tipadas e propaga alteração no onChange', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSelect
          id="select-density"
          value="normal"
          onChange={handleChange}
          options={[
            { value: 'compact', label: 'Compacta' },
            { value: 'normal', label: 'Normal' },
            { value: 'comfortable', label: 'Confortável' }
          ]}
        />
      );
    });

    const select = container.querySelector('#select-density') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(3);
    expect(select.value).toBe('normal');

    act(() => {
      select.value = 'comfortable';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // INSPECTOR-PRIM-8: Segmented single selection semantics
  // ==========================================================================
  it('INSPECTOR-PRIM-8: InspectorSegmentedControl implementa radiogroup/radio com aria-checked estrito', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          options={[
            { value: 'grid', label: 'Grade' },
            { value: 'stack', label: 'Pilha' }
          ]}
          value="grid"
          onChange={handleChange}
        />
      );
    });

    const group = container.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();

    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(2);

    const radioGrid = radios[0] as HTMLButtonElement;
    const radioStack = radios[1] as HTMLButtonElement;

    expect(radioGrid.getAttribute('aria-checked')).toBe('true');
    expect(radioGrid.tabIndex).toBe(0);

    expect(radioStack.getAttribute('aria-checked')).toBe('false');
    expect(radioStack.tabIndex).toBe(-1);

    act(() => {
      radioStack.click();
    });

    expect(handleChange).toHaveBeenCalledWith('stack');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-9: NumberInput respeita min/max/step HTML contract
  // ==========================================================================
  it('INSPECTOR-PRIM-9: InspectorNumberInput preserva atributos de contrato HTML (min, max, step) e converte valor numérico', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorNumberInput
          id="num-input"
          min={5}
          max={200}
          step={0.5}
          value={50}
          onChange={handleChange}
        />
      );
    });

    const input = container.querySelector('#num-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('number');
    expect(input.min).toBe('5');
    expect(input.max).toBe('200');
    expect(input.step).toBe('0.5');
    expect(input.value).toBe('50');

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(input, '75.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith(75.5);
  });

  // ==========================================================================
  // INSPECTOR-PRIM-10: DimensionInput mostra unit corretamente
  // ==========================================================================
  it('INSPECTOR-PRIM-10: InspectorDimensionInput exibe sufixo/unidade visual e repassa propriedades', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorDimensionInput
          id="dim-input"
          unit="mm"
          value={193.06}
          min={1}
          max={193.06}
          step="any"
          onChange={() => {}}
        />
      );
    });

    const input = container.querySelector('#dim-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.step).toBe('any');

    expect(container.textContent).toContain('mm');
  });

  // ==========================================================================
  // INSPECTOR-PRIM-11: Toggle possui accessible checked state
  // ==========================================================================
  it('INSPECTOR-PRIM-11: InspectorToggle implementa role="switch" com aria-checked e acionamento por clique', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorToggle
          checked={false}
          onChange={handleChange}
          label="Exibir Linhas Técnicas"
        />
      );
    });

    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    act(() => {
      toggle.click();
    });

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  // ==========================================================================
  // INSPECTOR-PRIM-12: ActionRow distingue danger action
  // ==========================================================================
  it('INSPECTOR-PRIM-12: InspectorActionRow diferencia visualmente ações padrão, primárias e destrutivas (danger)', () => {
    const handleReset = vi.fn();
    const handleDelete = vi.fn();

    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorActionRow
          actions={[
            { label: 'Restaurar', onClick: handleReset, variant: 'default' },
            { label: 'Excluir', onClick: handleDelete, variant: 'danger' }
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);

    const defaultBtn = buttons[0];
    const dangerBtn = buttons[1];

    expect(defaultBtn.className).toContain('bg-slate-100');
    expect(dangerBtn.className).toContain('bg-rose-50');
    expect(dangerBtn.className).toContain('text-rose-700');

    act(() => {
      dangerBtn.click();
    });
    expect(handleDelete).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // INSPECTOR-PRIM-12B: ResetAction callback e disabled state
  // ==========================================================================
  it('INSPECTOR-PRIM-12B: InspectorResetAction aciona onReset ao ser clicado e desabilita corretamente', () => {
    const handleReset = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <div>
          <InspectorResetAction onReset={handleReset} label="Restaurar Padrão" />
          <InspectorResetAction onReset={handleReset} label="Reset Inativo" disabled />
        </div>
      );
    });

    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);

    const activeBtn = buttons[0];
    const disabledBtn = buttons[1];

    expect(activeBtn.disabled).toBe(false);
    expect(disabledBtn.disabled).toBe(true);

    act(() => {
      activeBtn.click();
    });
    expect(handleReset).toHaveBeenCalledTimes(1);

    act(() => {
      disabledBtn.click();
    });
    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // INSPECTOR-PRIM-13: Structural Section pilot não contradiz o Capability Registry
  // ==========================================================================
  it('INSPECTOR-PRIM-13: Structural Section pilot apresenta apenas capabilities suportadas no Registry', async () => {
    const { ElementCapabilityRegistry } = await import(
      '../../src/domain/capabilities/element-capability.registry'
    );
    const { CAPABILITY_IDS } = await import(
      '../../src/domain/capabilities/capability.ids'
    );

    const sectionDef = ElementCapabilityRegistry.structural_section;
    expect(sectionDef).toBeDefined();

    // Controles canônicos do StructuralSectionInspector:
    const pilotCapabilityIds = [
      CAPABILITY_IDS.CONTENT_TITLE,
      CAPABILITY_IDS.CONTENT_SUBTITLE,
      CAPABILITY_IDS.CONTENT_BADGE,
      CAPABILITY_IDS.MEDIA_SEMANTIC_ICON,
      CAPABILITY_IDS.LAYOUT_MODE,
      CAPABILITY_IDS.LAYOUT_WIDTH_MODE,
      CAPABILITY_IDS.LAYOUT_FIXED_WIDTH_MM,
      CAPABILITY_IDS.LAYOUT_COLUMNS,
      CAPABILITY_IDS.LAYOUT_GAP,
      CAPABILITY_IDS.LAYOUT_PADDING,
      CAPABILITY_IDS.LAYOUT_DENSITY,
      CAPABILITY_IDS.LAYOUT_ALIGNMENT,
      CAPABILITY_IDS.APPEARANCE_BACKGROUND,
      CAPABILITY_IDS.APPEARANCE_BORDER,
      CAPABILITY_IDS.APPEARANCE_RADIUS
    ];

    const registeredIds = new Set(sectionDef.capabilities.map((c) => c.id));

    for (const capId of pilotCapabilityIds) {
      expect(registeredIds.has(capId)).toBe(true);
      const cap = sectionDef.capabilities.find((c) => c.id === capId)!;
      expect(cap.rendererSupport.editor).toBe(true);
    }
  });
});
