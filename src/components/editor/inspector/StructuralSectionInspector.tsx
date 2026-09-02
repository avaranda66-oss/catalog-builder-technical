// src/components/editor/inspector/StructuralSectionInspector.tsx
// Inspector Contextual da Seção Estrutural (Fase 3A.2)
// Permite editar Conteúdo, Layout e Aparência com garantia de zero controles fakes e validação atômica.

import React, { useState } from 'react';
import {
  LayoutGrid,
  Palette,
  FileText,
  Layers,
  Sparkles,
  Trash2,
  Plus,
  Copy,
  ArrowUp,
  ArrowDown,
  X
} from 'lucide-react';
import { ContentBlock } from '@/domain/catalog.schema';
import {
  StructuralLayoutConfig,
  CanvasSpacingToken
} from '@/domain/canvas-layout.schema';
import { updateStructuralLayout } from '@/domain/canvas-layout.engine';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { CorporateIcon, CorporateIconPicker, getCorporateIcon } from '@/components/icons';
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
  const addStructuralChild = useCatalogStore((state) => state.addStructuralChild);
  const duplicateStructuralChild = useCatalogStore((state) => state.duplicateStructuralChild);
  const removeStructuralChild = useCatalogStore((state) => state.removeStructuralChild);
  const moveStructuralChild = useCatalogStore((state) => state.moveStructuralChild);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // Transição segura de widthMode: criação/edição de largura fixa fica diferida até Fase 3A.5 (A4 Guards)
  const handleWidthModeChange = (mode: 'fill' | 'fixed') => {
    if (mode === 'fill') {
      handleLayoutUpdate({ widthMode: 'fill' });
    }
  };

  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Handlers de mutação de ícone semântico corporativo (Fase 3A.3)
  const handleSelectIcon = (iconId: string) => {
    if (!rawStructuralData) return;
    updateBlock(pageId, sectionBlock.id, {
      structuralData: {
        ...rawStructuralData,
        iconId
      }
    });
  };

  const handleClearIcon = () => {
    if (!rawStructuralData) return;
    updateBlock(pageId, sectionBlock.id, {
      structuralData: {
        ...rawStructuralData,
        iconId: undefined
      }
    });
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

        <InspectorField
          label="Largura da Seção"
          hint="Largura fixa estará disponível com o controle de dimensões da página."
        >
          <InspectorSegmentedControl
            options={[
              { value: 'fill', label: 'Preencher largura' },
              { value: 'fixed', label: 'Fixa (mm)', disabled: true }
            ]}
            value={layout.widthMode}
            onChange={handleWidthModeChange}
          />
        </InspectorField>

        {layout.widthMode === 'fixed' && layout.fixedWidthMm && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700">
            <div className="font-semibold text-slate-800 flex items-center justify-between">
              <span>Largura fixa atual:</span>
              <span className="font-mono text-[#003366] font-bold">{layout.fixedWidthMm} mm</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Configuração física preservada em modo somente-leitura.
            </p>
          </div>
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

      {/* 4. GRUPO ÍCONE DA SEÇÃO */}
      <InspectorGroup
        title="Ícone da Seção"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        description="Símbolo Semântico"
      >
        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            {rawStructuralData?.iconId ? (
              <>
                <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-[#003366] shrink-0">
                  <CorporateIcon iconId={rawStructuralData.iconId} size="md" />
                </div>
                <div className="truncate">
                  <span className="text-xs font-semibold text-slate-800 block truncate">
                    {getCorporateIcon(rawStructuralData.iconId)?.label || rawStructuralData.iconId}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 block truncate">
                    {rawStructuralData.iconId}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-xs text-slate-400 italic">Nenhum ícone selecionado</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="px-2.5 py-1 text-xs font-semibold text-[#003366] hover:bg-blue-50 border border-blue-300 rounded-md transition-all cursor-pointer"
            >
              {rawStructuralData?.iconId ? 'Alterar' : 'Selecionar'}
            </button>
            {rawStructuralData?.iconId && (
              <button
                type="button"
                onClick={handleClearIcon}
                title="Remover ícone da seção"
                aria-label="Remover ícone da seção"
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </InspectorGroup>

      <CorporateIconPicker
        isOpen={isPickerOpen}
        currentIconId={rawStructuralData?.iconId}
        onSelect={handleSelectIcon}
        onClear={handleClearIcon}
        onClose={() => setIsPickerOpen(false)}
        title="Ícone da Seção Estrutural"
      />

      {/* 5. GERENCIAMENTO DE CARDS FILHOS */}
      <InspectorGroup
        title={`Cards Filhos (${children.length})`}
        icon={<Layers className="w-3.5 h-3.5" />}
        description="Reordene, duplique ou edite"
      >
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => addStructuralChild(pageId, sectionBlock.id)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-blue-50/70 hover:bg-blue-100 text-[#003366] text-xs font-semibold rounded-md border border-blue-200 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Card</span>
          </button>

          {children.length === 0 ? (
            <div className="text-center py-3 text-xs text-slate-400 italic bg-slate-50 rounded border border-dashed border-slate-200">
              Nenhum card configurado. Clique acima para adicionar.
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {children.map((child, idx) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between p-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-md transition-all group"
                >
                  <button
                    type="button"
                    onClick={() => onSelectCard(child.id)}
                    className="flex-1 text-left min-w-0 pr-2 cursor-pointer flex items-center gap-1.5"
                  >
                    {child.iconId && (
                      <span className="shrink-0 text-slate-500">
                        <CorporateIcon iconId={child.iconId} size={14} />
                      </span>
                    )}
                    <div className="truncate">
                      <div className="text-xs font-semibold text-slate-800 truncate group-hover:text-blue-900">
                        {child.title || `Card ${idx + 1}`}
                      </div>
                      {child.badge && (
                        <span className="text-[8.5px] font-mono font-bold text-slate-500 uppercase">
                          {child.badge}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveStructuralChild(pageId, sectionBlock.id, child.id, 'up')}
                      disabled={idx === 0}
                      title="Mover para cima"
                      aria-label="Mover card para cima"
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-all cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStructuralChild(pageId, sectionBlock.id, child.id, 'down')}
                      disabled={idx === children.length - 1}
                      title="Mover para baixo"
                      aria-label="Mover card para baixo"
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-all cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateStructuralChild(pageId, sectionBlock.id, child.id)}
                      title="Duplicar card"
                      aria-label="Duplicar card"
                      className="p-1 text-slate-400 hover:text-blue-600 rounded transition-all cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {confirmDeleteId === child.id ? (
                      <div className="flex items-center gap-0.5 bg-rose-50 p-0.5 rounded border border-rose-200">
                        <button
                          type="button"
                          onClick={() => {
                            removeStructuralChild(pageId, sectionBlock.id, child.id);
                            setConfirmDeleteId(null);
                          }}
                          title="Confirmar exclusão"
                          aria-label="Confirmar exclusão"
                          className="px-1 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 rounded cursor-pointer"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          title="Cancelar"
                          aria-label="Cancelar exclusão"
                          className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(child.id)}
                        title="Excluir card"
                        aria-label="Excluir card"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </InspectorGroup>
    </div>
  );
};
