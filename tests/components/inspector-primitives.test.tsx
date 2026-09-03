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
import { StructuralSectionInspector } from '../../src/components/editor/inspector/StructuralSectionInspector';
import { StructuralCardInspector } from '../../src/components/editor/inspector/StructuralCardInspector';
import { ContentBlock } from '../../src/domain/catalog.schema';
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

  // ==========================================================================
  // INSPECTOR-SEG-KBD-1: ArrowRight avança e atualiza seleção
  // ==========================================================================
  it('INSPECTOR-SEG-KBD-1: ArrowRight avança para próxima option habilitada, move foco e atualiza valor', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          value="a"
          onChange={handleChange}
          options={[
            { value: 'a', label: 'Opção A' },
            { value: 'b', label: 'Opção B' },
            { value: 'c', label: 'Opção C' }
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    const buttonA = buttons[0];
    const buttonB = buttons[1];

    buttonA.focus();
    expect(document.activeElement).toBe(buttonA);

    act(() => {
      buttonA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith('b');
    expect(document.activeElement).toBe(buttonB);
  });

  // ==========================================================================
  // INSPECTOR-SEG-KBD-2: ArrowLeft na primeira option faz wrap para última
  // ==========================================================================
  it('INSPECTOR-SEG-KBD-2: ArrowLeft na primeira option faz wrap-around para a última habilitada', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          value="a"
          onChange={handleChange}
          options={[
            { value: 'a', label: 'Opção A' },
            { value: 'b', label: 'Opção B' },
            { value: 'c', label: 'Opção C' }
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    const buttonA = buttons[0];
    const buttonC = buttons[2];

    buttonA.focus();
    act(() => {
      buttonA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith('c');
    expect(document.activeElement).toBe(buttonC);
  });

  // ==========================================================================
  // INSPECTOR-SEG-KBD-3: Disabled option é ignorada
  // ==========================================================================
  it('INSPECTOR-SEG-KBD-3: Opções com disabled=true são ignoradas durante navegação por teclado', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          value="a"
          onChange={handleChange}
          options={[
            { value: 'a', label: 'Opção A' },
            { value: 'b', label: 'Opção B (Desabilitada)', disabled: true },
            { value: 'c', label: 'Opção C' }
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    const buttonA = buttons[0];
    const buttonC = buttons[2];

    buttonA.focus();
    act(() => {
      buttonA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    // Pula option B e seleciona option C
    expect(handleChange).toHaveBeenCalledWith('c');
    expect(document.activeElement).toBe(buttonC);
  });

  // ==========================================================================
  // INSPECTOR-SEG-KBD-4: Home -> primeira habilitada
  // ==========================================================================
  it('INSPECTOR-SEG-KBD-4: Tecla Home move foco e seleção para a primeira option habilitada', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          value="c"
          onChange={handleChange}
          options={[
            { value: 'a', label: 'Opção A' },
            { value: 'b', label: 'Opção B' },
            { value: 'c', label: 'Opção C' }
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    const buttonA = buttons[0];
    const buttonC = buttons[2];

    buttonC.focus();
    act(() => {
      buttonC.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith('a');
    expect(document.activeElement).toBe(buttonA);
  });

  // ==========================================================================
  // INSPECTOR-SEG-KBD-5: End -> última habilitada
  // ==========================================================================
  it('INSPECTOR-SEG-KBD-5: Tecla End move foco e seleção para a última option habilitada', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          value="a"
          onChange={handleChange}
          options={[
            { value: 'a', label: 'Opção A' },
            { value: 'b', label: 'Opção B' },
            { value: 'c', label: 'Opção C' }
          ]}
        />
      );
    });

    const buttons = container.querySelectorAll('button');
    const buttonA = buttons[0];
    const buttonC = buttons[2];

    buttonA.focus();
    act(() => {
      buttonA.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith('c');
    expect(document.activeElement).toBe(buttonC);
  });

  // ==========================================================================
  // INSPECTOR-SEG-KBD-6: Disabled group: zero onChange
  // ==========================================================================
  it('INSPECTOR-SEG-KBD-6: SegmentedControl com disabled=true bloqueia navegação e não dispara onChange', () => {
    const handleChange = vi.fn();
    root = createRoot(container);
    act(() => {
      root?.render(
        <InspectorSegmentedControl
          value="a"
          disabled={true}
          onChange={handleChange}
          options={[
            { value: 'a', label: 'Opção A' },
            { value: 'b', label: 'Opção B' },
            { value: 'c', label: 'Opção C' }
          ]}
        />
      );
    });

    const group = container.querySelector('[role="radiogroup"]') as HTMLDivElement;
    act(() => {
      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      group.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });

    expect(handleChange).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Sample Block para testes de Disclosure Defaults
  // ==========================================================================
  const sampleSectionBlock: ContentBlock = {
    id: 'block-sec-test',
    type: 'structural_section',
    title: 'Seção de Teste',
    subtitle: 'Subtítulo',
    badgeText: 'BADGE',
    structuralData: {
      version: 1,
      iconId: 'network',
      layout: {
        mode: 'grid',
        columns: 3,
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
          id: 'card-1',
          type: 'feature_card',
          title: 'Card 1',
          body: 'Corpo 1',
          badge: 'TEST',
          emphasis: 'normal',
          iconId: 'settings'
        }
      ]
    }
  };

  // ==========================================================================
  // INSPECTOR-DISCLOSURE-1: Structural Section inicial
  // ==========================================================================
  it('INSPECTOR-DISCLOSURE-1: StructuralSectionInspector inicializa com Conteúdo aberto e Layout, Aparência e Cards fechados', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <StructuralSectionInspector
          sectionBlock={sampleSectionBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    const contentBtn = container.querySelector('#inspector-section-content-header') as HTMLButtonElement;
    const layoutBtn = container.querySelector('#inspector-section-layout-header') as HTMLButtonElement;
    const appearanceBtn = container.querySelector('#inspector-section-appearance-header') as HTMLButtonElement;
    const childrenBtn = container.querySelector('#inspector-section-children-header') as HTMLButtonElement;

    expect(contentBtn).not.toBeNull();
    expect(layoutBtn).not.toBeNull();
    expect(appearanceBtn).not.toBeNull();
    expect(childrenBtn).not.toBeNull();

    expect(contentBtn.getAttribute('aria-expanded')).toBe('true');
    expect(layoutBtn.getAttribute('aria-expanded')).toBe('false');
    expect(appearanceBtn.getAttribute('aria-expanded')).toBe('false');
    expect(childrenBtn.getAttribute('aria-expanded')).toBe('false');
  });

  // ==========================================================================
  // INSPECTOR-DISCLOSURE-2: Accordion não-exclusivo
  // ==========================================================================
  it('INSPECTOR-DISCLOSURE-2: Usuário pode abrir Layout mantendo Conteúdo aberto simultaneamente (não é accordion exclusivo)', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <StructuralSectionInspector
          sectionBlock={sampleSectionBlock}
          pageId="page-1"
          onSelectCard={() => {}}
        />
      );
    });

    const contentBtn = container.querySelector('#inspector-section-content-header') as HTMLButtonElement;
    const layoutBtn = container.querySelector('#inspector-section-layout-header') as HTMLButtonElement;

    expect(contentBtn.getAttribute('aria-expanded')).toBe('true');
    expect(layoutBtn.getAttribute('aria-expanded')).toBe('false');

    // Abre Layout clicando no header
    act(() => {
      layoutBtn.click();
    });

    // Ambas continuam abertas simultaneamente
    expect(contentBtn.getAttribute('aria-expanded')).toBe('true');
    expect(layoutBtn.getAttribute('aria-expanded')).toBe('true');
  });

  // ==========================================================================
  // INSPECTOR-DISCLOSURE-3: Structural Card inicial
  // ==========================================================================
  it('INSPECTOR-DISCLOSURE-3: StructuralCardInspector inicializa com Conteúdo aberto e Ênfase e Ícone fechados', () => {
    root = createRoot(container);
    act(() => {
      root?.render(
        <StructuralCardInspector
          sectionBlock={sampleSectionBlock}
          pageId="page-1"
          cardId="card-1"
          onBackToSection={() => {}}
        />
      );
    });

    const contentBtn = container.querySelector('#inspector-card-section-content-header') as HTMLButtonElement;
    const emphasisBtn = container.querySelector('#inspector-card-section-emphasis-header') as HTMLButtonElement;
    const iconBtn = container.querySelector('#inspector-card-section-icon-header') as HTMLButtonElement;

    expect(contentBtn).not.toBeNull();
    expect(emphasisBtn).not.toBeNull();
    expect(iconBtn).not.toBeNull();

    expect(contentBtn.getAttribute('aria-expanded')).toBe('true');
    expect(emphasisBtn.getAttribute('aria-expanded')).toBe('false');
    expect(iconBtn.getAttribute('aria-expanded')).toBe('false');
  });
});
