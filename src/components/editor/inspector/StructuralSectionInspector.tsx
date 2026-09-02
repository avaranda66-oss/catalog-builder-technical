// src/components/editor/inspector/StructuralSectionInspector.tsx
// Inspector Contextual da Seção Estrutural (Fase 3A.2)
// Permite editar Conteúdo, Layout e Aparência com garantia de zero controles fakes e validação atômica.

import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Palette,
  FileText,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';
import { ContentBlock } from '@/domain/catalog.schema';
import {
  StructuralLayoutConfig,
  CanvasSpacingToken
} from '@/domain/canvas-layout.schema';
import { updateStructuralLayout } from '@/domain/canvas-layout.engine';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { InspectorGroup } from './components/InspectorGroup';
import { InspectorField } from './components/InspectorField';
import { InspectorTextInput } from './components/InspectorTextInput';
import { InspectorTextArea } from './components/InspectorTextArea';
import { InspectorSelect } from './components/InspectorSelect';
import { InspectorSegmentedControl } from './components/InspectorSegmentedControl';

interface StructuralSectionInspectorProps {
  sectionBlock: ContentBlock;
  pageId: string;
  onSelectCard: (cardId: string) => void;
}

export const StructuralSectionInspector: React.FC<StructuralSectionInspectorProps> = ({
  sectionBlock,
  pageId,
  onSelectCard
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);

  const rawStructuralData = sectionBlock.structuralData;
  const layout = rawStructuralData?.layout || {
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
  };

  const children = rawStructuralData?.children || [];

  // Estado local para fixedWidthMm permitindo validação atômica antes do commit
  const [fixedWidthDraft, setFixedWidthDraft] = useState<string>(
    layout.fixedWidthMm ? String(layout.fixedWidthMm) : '150'
  );
  const [fixedWidthError, setFixedWidthError] = useState<string | null>(null);

  useEffect(() => {
    if (layout.fixedWidthMm) {
      setFixedWidthDraft(String(layout.fixedWidthMm));
    }
  }, [layout.fixedWidthMm]);

  // Handler de atualização de propriedades diretas de ContentBlock (title, subtitle, badgeText)
  const handleContentUpdate = (patch: Partial<ContentBlock>) => {
    updateBlock(pageId, sectionBlock.id, patch);
  };

  // Handler de atualização segura de layout via helper imutável e validado
  const handleLayoutUpdate = (layoutPatch: Partial<StructuralLayoutConfig>) => {
    if (!rawStructuralData) return;
    try {
      const updatedData = updateStructuralLayout(rawStructuralData, layoutPatch);
      updateBlock(pageId, sectionBlock.id, { structuralData: updatedData });
    } catch (err: any) {
      console.warn('Erro ao atualizar layout estrutural:', err);
    }
  };

  // Transição segura de widthMode para fixed sem estado inválido intermediário
  const handleWidthModeChange = (mode: 'fill' | 'fixed') => {
    if (mode === 'fill') {
      setFixedWidthError(null);
      handleLayoutUpdate({ widthMode: 'fill' });
    } else {
      const parsed = parseFloat(fixedWidthDraft);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 210) {
        // Inicializa com 150mm seguro se o draft for inválido
        setFixedWidthDraft('150');
        setFixedWidthError(null);
        handleLayoutUpdate({ widthMode: 'fixed', fixedWidthMm: 150 });
      } else {
        setFixedWidthError(null);
        handleLayoutUpdate({ widthMode: 'fixed', fixedWidthMm: parsed });
      }
    }
  };

  const handleFixedWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFixedWidthDraft(val);
    const parsed = parseFloat(val);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFixedWidthError('Largura deve ser maior que 0 mm.');
      return;
    }
    if (parsed > 210) {
      setFixedWidthError('Largura excede o limite da folha A4 (210 mm).');
      return;
    }
    setFixedWidthError(null);
    handleLayoutUpdate({ widthMode: 'fixed', fixedWidthMm: parsed });
  };

  return (
    <div className="space-y-4">
      {/* 1. GRUPO CONTEÚDO */}
      <InspectorGroup
        title="Conteúdo da Seção"
        icon={<FileText className="w-3.5 h-3.5" />}
        description="Textos da Seção"
      >
        <InspectorField label="Título Principal">
          <InspectorTextInput
            value={sectionBlock.title || ''}
            onChange={(e) => handleContentUpdate({ title: e.target.value })}
            placeholder="Ex: CONECTIVIDADE E LIGAÇÕES"
          />
        </InspectorField>

        <InspectorField label="Subtítulo Descritivo">
          <InspectorTextArea
            rows={2}
            value={sectionBlock.subtitle || ''}
            onChange={(e) => handleContentUpdate({ subtitle: e.target.value })}
            placeholder="Ex: Painel traseiro e protocolos industriais suportados."
          />
        </InspectorField>

        <InspectorField label="Badge Superior">
          <InspectorTextInput
            value={sectionBlock.badgeText || ''}
            onChange={(e) => handleContentUpdate({ badgeText: e.target.value })}
            placeholder="Ex: PADRÃO INDUSTRIAL"
          />
        </InspectorField>
      </InspectorGroup>

      {/* 2. GRUPO LAYOUT */}
      <InspectorGroup
        title="Layout da Seção"
        icon={<LayoutGrid className="w-3.5 h-3.5" />}
        description="Distribuição e Grid"
      >
        <InspectorField label="Modo de Disposição">
          <InspectorSegmentedControl
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'stack', label: 'Stack (Pilha)' }
            ]}
            value={layout.mode}
            onChange={(val) => handleLayoutUpdate({ mode: val })}
          />
        </InspectorField>

        <InspectorField
          label="Colunas do Grid"
          hint={layout.mode === 'stack' ? 'Inativo em modo Stack' : undefined}
        >
          <InspectorSegmentedControl
            disabled={layout.mode === 'stack'}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 4, label: '4' },
              { value: 5, label: '5' },
              { value: 6, label: '6' }
            ]}
            value={layout.columns}
            onChange={(val) => handleLayoutUpdate({ columns: val })}
          />
        </InspectorField>

        <InspectorField label="Largura da Seção">
          <InspectorSegmentedControl
            options={[
              { value: 'fill', label: 'Preencher (100%)' },
              { value: 'fixed', label: 'Fixa (mm)' }
            ]}
            value={layout.widthMode}
            onChange={handleWidthModeChange}
          />
        </InspectorField>

        {layout.widthMode === 'fixed' && (
          <InspectorField
            label="Largura Fixa (mm)"
            hint="Máx: 210 mm"
            error={fixedWidthError}
          >
            <InspectorTextInput
              type="number"
              min={10}
              max={210}
              step={1}
              value={fixedWidthDraft}
              onChange={handleFixedWidthChange}
              hasError={Boolean(fixedWidthError)}
            />
          </InspectorField>
        )}

        <div className="grid grid-cols-2 gap-2">
          <InspectorField label="Espaçamento (Gap)">
            <InspectorSelect
              value={layout.gap}
              onChange={(e) =>
                handleLayoutUpdate({ gap: e.target.value as CanvasSpacingToken })
              }
              options={[
                { value: 'none', label: 'Nenhum (0 mm)' },
                { value: 'xs', label: 'XS (2 mm)' },
                { value: 'sm', label: 'SM (3 mm)' },
                { value: 'md', label: 'MD (4 mm)' },
                { value: 'lg', label: 'LG (6 mm)' },
                { value: 'xl', label: 'XL (8 mm)' }
              ]}
            />
          </InspectorField>

          <InspectorField label="Margem Interna (Padding)">
            <InspectorSelect
              value={layout.padding}
              onChange={(e) =>
                handleLayoutUpdate({ padding: e.target.value as CanvasSpacingToken })
              }
              options={[
                { value: 'none', label: 'Nenhum (0 mm)' },
                { value: 'xs', label: 'XS (2 mm)' },
                { value: 'sm', label: 'SM (3 mm)' },
                { value: 'md', label: 'MD (4 mm)' },
                { value: 'lg', label: 'LG (6 mm)' },
                { value: 'xl', label: 'XL (8 mm)' }
              ]}
            />
          </InspectorField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InspectorField label="Densidade dos Cards">
            <InspectorSelect
              value={layout.density}
              onChange={(e) =>
                handleLayoutUpdate({
                  density: e.target.value as 'compact' | 'normal' | 'comfortable'
                })
              }
              options={[
                { value: 'compact', label: 'Compacta' },
                { value: 'normal', label: 'Normal' },
                { value: 'comfortable', label: 'Confortável' }
              ]}
            />
          </InspectorField>

          <InspectorField label="Alinhamento">
            <InspectorSelect
              value={layout.align}
              onChange={(e) =>
                handleLayoutUpdate({
                  align: e.target.value as 'left' | 'center' | 'right'
                })
              }
              options={[
                { value: 'left', label: 'Esquerda' },
                { value: 'center', label: 'Centro' },
                { value: 'right', label: 'Direita' }
              ]}
            />
          </InspectorField>
        </div>
      </InspectorGroup>

      {/* 3. GRUPO APARÊNCIA */}
      <InspectorGroup
        title="Aparência Visual"
        icon={<Palette className="w-3.5 h-3.5" />}
        description="Fundo e Bordas"
      >
        <InspectorField label="Fundo da Seção">
          <InspectorSelect
            value={layout.background}
            onChange={(e) =>
              handleLayoutUpdate({
                background: e.target.value as
                  | 'transparent'
                  | 'surface'
                  | 'soft'
                  | 'technical'
              })
            }
            options={[
              { value: 'transparent', label: 'Transparente' },
              { value: 'surface', label: 'Superfície Branca' },
              { value: 'soft', label: 'Suave (Cinza Claro)' },
              { value: 'technical', label: 'Técnico (Slate)' }
            ]}
          />
        </InspectorField>

        <div className="grid grid-cols-2 gap-2">
          <InspectorField label="Estilo de Borda">
            <InspectorSelect
              value={layout.border}
              onChange={(e) =>
                handleLayoutUpdate({
                  border: e.target.value as 'none' | 'subtle' | 'solid' | 'accent'
                })
              }
              options={[
                { value: 'none', label: 'Nenhuma' },
                { value: 'subtle', label: 'Sutil' },
                { value: 'solid', label: 'Sólida' },
                { value: 'accent', label: 'Destaque PRESYS' }
              ]}
            />
          </InspectorField>

          <InspectorField label="Arredondamento (Raio)">
            <InspectorSelect
              value={layout.radius}
              onChange={(e) =>
                handleLayoutUpdate({
                  radius: e.target.value as 'none' | 'sm' | 'md' | 'lg'
                })
              }
              options={[
                { value: 'none', label: 'Reto (0px)' },
                { value: 'sm', label: 'Pequeno (3px)' },
                { value: 'md', label: 'Médio (6px)' },
                { value: 'lg', label: 'Grande (12px)' }
              ]}
            />
          </InspectorField>
        </div>
      </InspectorGroup>

      {/* 4. GRUPO ÍCONE DA SEÇÃO (READ-ONLY CORPORATIVO) */}
      <div className="p-2.5 bg-slate-100/70 border border-slate-200 rounded-lg flex items-start gap-2">
        <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div className="text-[10px] text-slate-600 leading-snug">
          <span className="font-bold text-slate-700 block">Ícone da Seção</span>
          Será configurado na Biblioteca de Ícones Corporativa (Fase 3A.3).
        </div>
      </div>

      {/* 5. NAVEGAÇÃO DE CARDS FILHOS */}
      {children.length > 0 && (
        <InspectorGroup
          title={`Cards Filhos (${children.length})`}
          icon={<Layers className="w-3.5 h-3.5" />}
          description="Clique para Inspecionar"
        >
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {children.map((child, idx) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelectCard(child.id)}
                className="w-full text-left p-2 bg-white hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-md transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="truncate min-w-0 pr-2">
                  <div className="text-xs font-semibold text-slate-800 truncate group-hover:text-blue-900">
                    {child.title || `Card ${idx + 1}`}
                  </div>
                  {child.badge && (
                    <span className="text-[8.5px] font-mono font-bold text-slate-500 uppercase">
                      {child.badge}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700 shrink-0" />
              </button>
            ))}
          </div>
        </InspectorGroup>
      )}
    </div>
  );
};
