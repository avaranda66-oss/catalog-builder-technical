import React, { useRef } from 'react';
import {
  Trash2,
  Image,
  Type,
  Table as TableIcon,
  Sliders,
  CheckSquare,
  Square,
  Zap,
  Package,
  Barcode,
  GalleryHorizontalEnd,
  Building2,
  Grid3X3,
  Plus,
  Upload,
  Palette,
  Sparkles,
  CircleDot,
  Layers,
  Laptop,
  AlignLeft,
  AlignCenter,
  SlidersHorizontal,
  Minus,
  Eye,
  EyeOff,
  LayoutGrid
} from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { usePresenceStore } from '../../stores/usePresenceStore';
import { useMediaStore } from '../../stores/useMediaStore';
import { TableColumnConfig } from '../../domain/catalog.schema';
import { CalibratorModeItem, DEFAULT_CALIBRATOR_MODES } from './blocks/MultiModeCalibratorBlock';
import {
  InsertCircleItem,
  InsertTableRow,
  DEFAULT_INSERTS_CIRCLES,
  DEFAULT_INSERTS_COLUMNS,
  DEFAULT_INSERTS_ROWS
} from './blocks/InsertsVisualBlock';
import { StructuralSectionInspector } from './inspector/StructuralSectionInspector';
import { StructuralCardInspector } from './inspector/StructuralCardInspector';

export const PropertiesPanel: React.FC = () => {
  const {
    currentCatalog,
    activePageIndex,
    selectedBlockId,
    selectedChildId,
    setSelectedChildId,
    selectEditorElement,
    updateBlock: rawUpdateBlock,
    removeBlock,
    setPageTitle
  } = useCatalogStore();
  const { openGallery } = useMediaStore();
  const getParticipantsOnBlock = usePresenceStore((state) => state.getParticipantsOnBlock);
  const markEditing = usePresenceStore((state) => state.markEditing);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryFileInputRef = useRef<HTMLInputElement>(null);

  if (!currentCatalog) return null;

  const activePage = currentCatalog.pages[activePageIndex] || currentCatalog.pages[0];
  if (!activePage) return null;

  let selectedBlock = undefined;
  let blockPageId = activePage.id;

  for (const page of currentCatalog.pages) {
    const found = (page.blocks || []).find((b) => b.id === selectedBlockId);
    if (found) {
      selectedBlock = found;
      blockPageId = page.id;
      break;
    }
  }

  const updateBlock: typeof rawUpdateBlock = (pageId, blockId, patch) => {
    rawUpdateBlock(pageId, blockId, patch);
    if (selectedBlock) {
      markEditing(activePageIndex + 1, pageId, blockId, selectedBlock.type);
    }
  };

  const remoteOnSelectedBlock = selectedBlock ? getParticipantsOnBlock(selectedBlock.id) : [];

  const AVAILABLE_DEFAULT_FIELDS = [
    { key: 'code', label: 'Código' },
    { key: 'model', label: 'Modelo' },
    { key: 'family', label: 'Família' },
    { key: 'range', label: 'Faixa de Medição' },
    { key: 'unit', label: 'Unidade' },
    { key: 'accuracy', label: 'Precisão / Exatidão' },
    { key: 'output', label: 'Sinal Saída' },
    { key: 'powerSupply', label: 'Alimentação' },
    { key: 'processConnection', label: 'Conexão Processo' }
  ];

  const COLOR_PALETTES = [
    { label: 'Azul Presys Industrial (Padrão)', value: 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900', hex: '#003366' },
    { label: 'Azul Marinho Corporativo', value: 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900', hex: '#1E3A8A' },
    { label: 'Obsidiana / Preto Puro', value: 'bg-gradient-to-b from-black via-zinc-950 to-black', hex: '#09090B' },
    { label: 'Grafite Técnico', value: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900', hex: '#27272A' },
    { label: 'Aço Escuro Metrológico', value: 'bg-gradient-to-br from-slate-800 via-slate-900 to-zinc-900', hex: '#334155' },
    { label: 'Esmeralda Metrologia', value: 'bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900', hex: '#065F46' },
    { label: 'Vinho / Rubi Industrial', value: 'bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900', hex: '#881337' },
    { label: 'Amarelo Presys Calibration', value: 'bg-[#FFC20E]', hex: '#FFC20E' }
  ];

  const handleToggleColumn = (colKey: string, label: string) => {
    if (!selectedBlock) return;

    const currentCols: TableColumnConfig[] = selectedBlock.tableColumns || [];
    const exists = currentCols.some((c) => c.key === colKey);

    let updatedCols;
    if (exists) {
      updatedCols = currentCols.map((c) =>
        c.key === colKey ? { ...c, visible: !c.visible } : c
      );
    } else {
      updatedCols = [...currentCols, { key: colKey, label, visible: true, width: 120 }];
    }

    updateBlock(blockPageId, selectedBlock.id, { tableColumns: updatedCols });
  };

  const handleColumnLabelChange = (colKey: string, newLabel: string) => {
    if (!selectedBlock) return;
    const currentCols: TableColumnConfig[] = selectedBlock.tableColumns || [];
    const updated = currentCols.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(blockPageId, selectedBlock.id, { tableColumns: updated });
  };

  const handleAddCustomColumn = () => {
    if (!selectedBlock) return;
    const currentCols: TableColumnConfig[] = selectedBlock.tableColumns || [];
    const customKey = `custom_${Date.now()}`;
    const newCol: TableColumnConfig = {
      key: customKey,
      label: `Nova Coluna ${currentCols.length + 1}`,
      visible: true,
      isCustom: true
    };
    updateBlock(blockPageId, selectedBlock.id, { tableColumns: [...currentCols, newCol] });
  };

  const handleRemoveColumn = (colKey: string) => {
    if (!selectedBlock) return;
    const currentCols: TableColumnConfig[] = selectedBlock.tableColumns || [];
    updateBlock(blockPageId, selectedBlock.id, {
      tableColumns: currentCols.filter((c) => c.key !== colKey)
    });
  };

  const handleLocalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBlock) return;

    const { useAssetStore } = await import('../../stores/useAssetStore');
    const res = await useAssetStore.getState().uploadAndLinkAsset(file, {
      role: 'hero',
      caption: selectedBlock.title || 'Foto de Capa/Destaque'
    });

    if (res.success && res.assetId) {
      updateBlock(blockPageId, selectedBlock.id, {
        assetId: res.assetId
      });
    }
    e.target.value = '';
  };

  const handleAddGalleryImageFromUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBlock) return;

    const { useAssetStore } = await import('../../stores/useAssetStore');
    const res = await useAssetStore.getState().uploadAndLinkAsset(file, {
      role: 'application',
      caption: 'Nova foto de aplicação'
    });

    if (res.success && res.assetId) {
      const currentImages = selectedBlock.images || [];
      updateBlock(blockPageId, selectedBlock.id, {
        images: [...currentImages, { assetId: res.assetId, url: '', caption: 'Nova foto de aplicação' }]
      });
    }
    e.target.value = '';
  };

  return (
    <aside className="w-80 bg-white border-l border-slate-200 flex flex-col h-full shadow-sm text-xs flex-shrink-0 z-10 overflow-hidden select-none">
      {/* Header Fixo */}
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
        <span className="font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#003366]" />
          <span>Propriedades do Elemento</span>
        </span>
        {selectedBlock && (
          <button
            onClick={() => removeBlock(blockPageId, selectedBlock.id)}
            className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
            title="Excluir elemento selecionado"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Conteúdo com Scroll Próprio */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 font-sans">
        {selectedBlock ? (
          <>
            <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg">
              <span className="text-[10px] font-bold text-[#003366] uppercase tracking-wider block">
                Elemento Selecionado
              </span>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-slate-900">
                {selectedBlock.type === 'full_page_cover' && <Sparkles className="w-4 h-4 text-amber-500" />}
                {selectedBlock.type === 'hero_banner' && <Building2 className="w-4 h-4 text-[#003366]" />}
                {selectedBlock.type === 'additel_two_col_hero' && <Sparkles className="w-4 h-4 text-blue-600" />}
                {selectedBlock.type === 'fluke_header' && <Sparkles className="w-4 h-4 text-amber-500" />}
                {selectedBlock.type === 'bottom_header' && <Building2 className="w-4 h-4 text-slate-700" />}
                {selectedBlock.type === 'matrix_spec_table' && <Grid3X3 className="w-4 h-4 text-[#003366]" />}
                {selectedBlock.type === 'software_connectivity' && <Laptop className="w-4 h-4 text-purple-600" />}
                {selectedBlock.type === 'inserts_visual' && <CircleDot className="w-4 h-4 text-slate-700" />}
                {selectedBlock.type === 'multi_mode_calibrator' && <Layers className="w-4 h-4 text-purple-600" />}
                {selectedBlock.type === 'features_list' && <Zap className="w-4 h-4 text-brand-600" />}
                {selectedBlock.type === 'table' && <TableIcon className="w-4 h-4 text-[#003366]" />}
                {selectedBlock.type === 'electrical_table' && <Zap className="w-4 h-4 text-amber-500" />}
                {selectedBlock.type === 'accessories_table' && <Package className="w-4 h-4 text-emerald-600" />}
                {selectedBlock.type === 'ordering_codes' && <Barcode className="w-4 h-4 text-purple-600" />}
                {selectedBlock.type === 'image_gallery' && <GalleryHorizontalEnd className="w-4 h-4 text-[#003366]" />}
                {selectedBlock.type === 'contact_footer' && <Building2 className="w-4 h-4 text-slate-700" />}
                {selectedBlock.type === 'custom_table' && <Grid3X3 className="w-4 h-4 text-slate-700" />}
                {selectedBlock.type === 'structural_section' && <LayoutGrid className="w-4 h-4 text-[#003366]" />}
                {selectedBlock.type === 'text' && <Type className="w-4 h-4 text-slate-600" />}
                {selectedBlock.type === 'image' && <Image className="w-4 h-4 text-[#003366]" />}
                <span className="capitalize">{selectedBlock.type.replace(/_/g, ' ')}</span>
              </div>
            </div>

            {/* Aviso Soft de Awareness / Outro Colaborador no Mesmo Bloco */}
            {remoteOnSelectedBlock.length > 0 && (
              <div
                className="p-2.5 rounded-lg border flex items-start gap-2 text-xs transition-all no-print"
                style={{
                  backgroundColor: `${remoteOnSelectedBlock[0].color}15`,
                  borderColor: `${remoteOnSelectedBlock[0].color}50`
                }}
              >
                <div
                  className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs"
                  style={{ backgroundColor: remoteOnSelectedBlock[0].color }}
                >
                  {remoteOnSelectedBlock[0].avatarText}
                </div>
                <div className="leading-snug">
                  <div className="font-bold text-slate-900">
                    {remoteOnSelectedBlock[0].displayLabel}{' '}
                    {remoteOnSelectedBlock[0].activity === 'editing'
                      ? 'está editando este bloco agora'
                      : 'também está com este bloco selecionado'}
                  </div>
                  <p className="text-[10.5px] text-slate-600 mt-0.5">
                    {remoteOnSelectedBlock[0].activity === 'editing'
                      ? 'Atenção: edições simultâneas no mesmo documento podem exigir confirmação na nuvem.'
                      : 'Você e este colaborador estão visualizando o mesmo componente.'}
                  </p>
                </div>
              </div>
            )}

            {/* SEÇÃO ESTRUTURAL (FASE 3A.2 CONTEXTUAL INSPECTOR) */}
            {selectedBlock.type === 'structural_section' && (
              selectedChildId && selectedBlock.structuralData?.children?.some((c) => c.id === selectedChildId) ? (
                <StructuralCardInspector
                  sectionBlock={selectedBlock}
                  pageId={blockPageId}
                  cardId={selectedChildId}
                  onBackToSection={() => setSelectedChildId(null)}
                />
              ) : (
                <StructuralSectionInspector
                  sectionBlock={selectedBlock}
                  pageId={blockPageId}
                  onSelectCard={(cardId) => selectEditorElement({ blockId: selectedBlock.id, childId: cardId })}
                />
              )
            )}

            {/* SELETOR DE COR / TEMA GLOBAL PARA TODOS OS HEADERS & CAPAS */}
            {['hero_banner', 'full_page_cover', 'bottom_header', 'fluke_header', 'additel_two_col_hero'].includes(selectedBlock.type) && (
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#003366]" />
                  <span>Cores & Paleta Visual do Elemento</span>
                </label>

                <div className="grid grid-cols-4 gap-1.5">
                  {COLOR_PALETTES.map((pal, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => {
                        if (selectedBlock?.type === 'fluke_header') {
                          updateBlock(blockPageId, selectedBlock.id, {
                            customData: { ...(selectedBlock.customData || {}), badgeBg: pal.hex }
                          });
                        } else if (selectedBlock?.type === 'additel_two_col_hero') {
                          updateBlock(blockPageId, selectedBlock.id, {
                            customData: { ...(selectedBlock.customData || {}), themeColor: pal.hex }
                          });
                        } else {
                          updateBlock(blockPageId, selectedBlock.id, {
                            style: { ...(selectedBlock.style || {}), gradient: pal.value },
                            customData: { ...(selectedBlock.customData || {}), gradient: pal.value }
                          });
                        }
                      }}
                      className="p-1.5 rounded-lg border border-slate-300 hover:border-slate-800 text-center flex flex-col items-center gap-1 bg-white hover:shadow-xs transition-all"
                      title={pal.label}
                    >
                      <div
                        style={{ backgroundColor: pal.hex }}
                        className="w-5 h-5 rounded-full border border-slate-300 shadow-2xs"
                      />
                      <span className="text-[8px] font-mono text-slate-600 truncate max-w-full">
                        {pal.label.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 1. CAPA EDITORIAL A4 COMPLETA */}
            {selectedBlock.type === 'full_page_cover' && (() => {
              const custom = selectedBlock.customData || {};
              const highlights = custom.highlights || [];

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nome da Empresa / Marca</label>
                    <input
                      type="text"
                      value={custom.brandName || 'PRESYS'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, brandName: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Slogan / Sub-marca</label>
                    <input
                      type="text"
                      value={custom.brandSubtitle || 'Instrumentos & Sistemas de Precisão'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, brandSubtitle: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Selo / Badge RBC</label>
                    <input
                      type="text"
                      value={selectedBlock.badgeText || 'CALIBRAÇÃO RBC · ISO/IEC 17025'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { badgeText: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título Principal da Capa</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Subtítulo</label>
                    <textarea
                      rows={2}
                      value={selectedBlock.subtitle || ''}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { subtitle: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>

                  {/* Destaques de Performance da Capa */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">Cards de Performance ({highlights.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newHighlight = {
                            label: 'Novo Destaque',
                            value: '0.01% FE',
                            icon: 'CheckCircle2'
                          };
                          updateBlock(blockPageId, selectedBlock.id, {
                            customData: { ...custom, highlights: [...highlights, newHighlight] }
                          });
                        }}
                        className="text-[10px] text-blue-700 font-bold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
                      >
                        + Destaque
                      </button>
                    </div>

                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {highlights.map((h: any, idx: number) => (
                        <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <input
                              type="text"
                              value={h.value}
                              onChange={(e) => {
                                const updated = [...highlights];
                                updated[idx] = { ...updated[idx], value: e.target.value };
                                updateBlock(blockPageId, selectedBlock.id, {
                                  customData: { ...custom, highlights: updated }
                                });
                              }}
                              placeholder="Valor (ex: até 0.01% FE)"
                              className="w-28 px-1.5 py-0.5 font-bold font-mono text-xs border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="text"
                              value={h.label}
                              onChange={(e) => {
                                const updated = [...highlights];
                                updated[idx] = { ...updated[idx], label: e.target.value };
                                updateBlock(blockPageId, selectedBlock.id, {
                                  customData: { ...custom, highlights: updated }
                                });
                              }}
                              placeholder="Descrição (ex: Exatidão Metrológica)"
                              className="flex-1 px-1.5 py-0.5 text-xs border border-slate-300 rounded bg-white"
                            />
                            {highlights.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = highlights.filter((_: any, i: number) => i !== idx);
                                  updateBlock(blockPageId, selectedBlock.id, {
                                    customData: { ...custom, highlights: updated }
                                  });
                                }}
                                className="text-slate-400 hover:text-red-600 p-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Foto de Capa */}
                  <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="block font-bold text-slate-800 text-[11px]">Fotografia de Capa</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-xs shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Carregar Foto do Computador</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLocalImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>

                  {/* Rodapé da Capa */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Rodapé Esquerdo (Contatos / Web)</label>
                    <input
                      type="text"
                      value={custom.footerLeft || 'www.presys.com.br · vendas@presys.com.br'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, footerLeft: e.target.value }
                        })
                      }
                      className="w-full p-1.5 border border-slate-300 rounded text-[11px] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Rodapé Direito (Telefone / Local)</label>
                    <input
                      type="text"
                      value={custom.footerRight || 'Fone: +55 (11) 3038-1300 · São Paulo - SP'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, footerRight: e.target.value }
                        })
                      }
                      className="w-full p-1.5 border border-slate-300 rounded text-[11px] font-mono"
                    />
                  </div>
                </div>
              );
            })()}

            {/* 2. HEADER METROLÓGICO (TARJA AMARELA) */}
            {selectedBlock.type === 'fluke_header' && (() => {
              const custom = selectedBlock.customData || {};

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Texto Principal do Badge</label>
                    <input
                      type="text"
                      value={selectedBlock.badgeText || 'PRESYS Calibration'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { badgeText: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Texto Secundário do Badge</label>
                    <input
                      type="text"
                      value={custom.badgeSecondary || 'Calibration'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, badgeSecondary: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título Principal</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Subtítulo</label>
                    <input
                      type="text"
                      value={selectedBlock.subtitle || 'Technical Data & Metrology Specifications'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { subtitle: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
              );
            })()}

            {/* 3. HEADER DUAL-COLUMN PRESYS */}
            {selectedBlock.type === 'additel_two_col_hero' && (() => {
              const custom = selectedBlock.customData || {};

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Selo / Marca Superior</label>
                    <input
                      type="text"
                      value={selectedBlock.badgeText || 'PRESYS Metrology'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { badgeText: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Slogan do Selo</label>
                    <input
                      type="text"
                      value={custom.badgeSubtitle || 'Metrology Made Simple'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, badgeSubtitle: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Subtítulo</label>
                    <input
                      type="text"
                      value={selectedBlock.subtitle || ''}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { subtitle: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
              );
            })()}

            {/* 4. BOTTOM HEADER */}
            {selectedBlock.type === 'bottom_header' && (() => {
              const custom = selectedBlock.customData || {};

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título da Empresa</label>
                    <input
                      type="text"
                      value={selectedBlock.title || 'PRESYS INSTRUMENTOS & SISTEMAS LTDA'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded font-bold text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Selo / Certificação</label>
                    <input
                      type="text"
                      value={selectedBlock.badgeText || 'ISO 9001 / RBC'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, { badgeText: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={custom.phone || '+55 (11) 3038-1300'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, phone: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">E-mail</label>
                    <input
                      type="text"
                      value={custom.email || 'vendas@presys.com.br'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, email: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Website</label>
                    <input
                      type="text"
                      value={custom.website || 'www.presys.com.br'}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...custom, website: e.target.value }
                        })
                      }
                      className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                </div>
              );
            })()}

            {/* 5. HERO BANNER PADRÃO */}
            {selectedBlock.type === 'hero_banner' && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selo / Badge Superior</label>
                  <input
                    type="text"
                    value={selectedBlock.badgeText || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { badgeText: e.target.value })
                    }
                    placeholder="PRESYS — INSTRUMENTAÇÃO INDUSTRIAL DE PRECISÃO"
                    className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Título Principal *</label>
                  <input
                    type="text"
                    value={selectedBlock.title || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })
                    }
                    placeholder="Ex: Presys PCON-Y18 / Série T"
                    className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Subtítulo / Descritivo</label>
                  <textarea
                    rows={3}
                    value={selectedBlock.subtitle || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { subtitle: e.target.value })
                    }
                    placeholder="Descrição dos diferenciais e aplicações..."
                    className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 text-xs"
                  />
                </div>

                {/* Upload e Foto */}
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="block font-bold text-slate-800 text-[11px]">Fotografia do Equipamento</span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-semibold text-xs transition-colors shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Carregar Foto do PC</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLocalImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>

                  <input
                    type="text"
                    value={selectedBlock.imageUrl || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { imageUrl: e.target.value })
                    }
                    placeholder="Ou cole a URL da imagem..."
                    className="w-full p-1.5 border border-slate-300 rounded text-[11px] font-mono"
                  />

                  <input
                    type="text"
                    value={selectedBlock.imageCaption || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { imageCaption: e.target.value })
                    }
                    placeholder="Legenda da foto..."
                    className="w-full p-1.5 border border-slate-300 rounded text-[11px] italic"
                  />
                </div>
              </div>
            )}

            {/* 6. SISTEMA MULTIFUNÇÃO (4 MODOS / CUSTOM) */}
            {selectedBlock.type === 'multi_mode_calibrator' && (() => {
              const modes: CalibratorModeItem[] = selectedBlock.customData?.modes || DEFAULT_CALIBRATOR_MODES;
              const updateModes = (newModes: CalibratorModeItem[]) => {
                updateBlock(blockPageId, selectedBlock.id, {
                  customData: { ...(selectedBlock.customData || {}), modes: newModes }
                });
              };

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título do Bloco</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) => updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })}
                      placeholder="SISTEMA MULTIFUNÇÃO..."
                      className="w-full p-2 border border-slate-300 rounded text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Selo / Badge Superior</label>
                    <input
                      type="text"
                      value={selectedBlock.badgeText !== undefined ? selectedBlock.badgeText : 'Multifunctional Series'}
                      onChange={(e) => updateBlock(blockPageId, selectedBlock.id, { badgeText: e.target.value })}
                      placeholder="Multifunctional Series"
                      className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">Modos de Calibração ({modes.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newMode: CalibratorModeItem = {
                            id: `mode-${Date.now()}`,
                            badge: 'MODO',
                            title: `${modes.length + 1}. Novo Modo`,
                            desc: 'Descrição técnica da aplicação.'
                          };
                          updateModes([...modes, newMode]);
                        }}
                        className="text-[10px] text-blue-700 font-bold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
                      >
                        + Modo
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {modes.map((m, idx) => (
                        <div key={m.id || idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 flex-1">
                              <span className="text-[10px] text-slate-400 font-mono">Ícone/Badge:</span>
                              <input
                                type="text"
                                value={m.badge}
                                onChange={(e) => {
                                  const updated = [...modes];
                                  updated[idx] = { ...updated[idx], badge: e.target.value };
                                  updateModes(updated);
                                }}
                                className="w-12 px-1.5 py-0.5 text-center text-xs border border-slate-300 rounded bg-white font-bold"
                              />
                            </div>

                            {modes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => updateModes(modes.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-600 p-0.5"
                                title="Excluir este modo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <input
                            type="text"
                            value={m.title}
                            onChange={(e) => {
                              const updated = [...modes];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              updateModes(updated);
                            }}
                            placeholder="Título do modo"
                            className="w-full px-2 py-1 text-xs font-bold border border-slate-300 rounded bg-white"
                          />

                          <textarea
                            rows={2}
                            value={m.desc}
                            onChange={(e) => {
                              const updated = [...modes];
                              updated[idx] = { ...updated[idx], desc: e.target.value };
                              updateModes(updated);
                            }}
                            placeholder="Descrição técnica..."
                            className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded bg-white leading-tight"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 7. INSERTOS VISUAIS & FURAÇÕES */}
            {selectedBlock.type === 'inserts_visual' && (() => {
              const customData = selectedBlock.customData || {};
              const inserts: InsertCircleItem[] = customData.inserts || DEFAULT_INSERTS_CIRCLES;
              const tableColumns: string[] = customData.tableColumns || DEFAULT_INSERTS_COLUMNS;
              const tableRows: InsertTableRow[] = customData.tableRows || DEFAULT_INSERTS_ROWS;

              const updateCustom = (patch: Record<string, any>) => {
                updateBlock(blockPageId, selectedBlock.id, {
                  customData: { ...customData, ...patch }
                });
              };

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título do Bloco</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) => updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Diâmetro Externo / Subtítulo</label>
                    <input
                      type="text"
                      value={customData.externalDiameter || 'Diâmetro Externo: Ø 32mm / Ø 35mm'}
                      onChange={(e) => updateCustom({ externalDiameter: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>

                  {/* Gerenciador de Círculos Visuais de Insertos */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">Círculos de Insertos ({inserts.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newInsert: InsertCircleItem = {
                            code: `IN0${inserts.length + 1}`,
                            title: 'Personalizado',
                            holes: ['6', '1/4']
                          };
                          updateCustom({ inserts: [...inserts, newInsert] });
                        }}
                        className="text-[10px] text-blue-700 font-bold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
                      >
                        + Inserto
                      </button>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {inserts.map((ins, idx) => (
                        <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <input
                              type="text"
                              value={ins.code}
                              onChange={(e) => {
                                const updated = [...inserts];
                                updated[idx] = { ...updated[idx], code: e.target.value };
                                updateCustom({ inserts: updated });
                              }}
                              placeholder="Código (ex: IN1P)"
                              className="w-20 px-1.5 py-0.5 font-bold font-mono text-xs border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="text"
                              value={ins.title}
                              onChange={(e) => {
                                const updated = [...inserts];
                                updated[idx] = { ...updated[idx], title: e.target.value };
                                updateCustom({ inserts: updated });
                              }}
                              placeholder="Descrição curta"
                              className="flex-1 px-1.5 py-0.5 text-xs border border-slate-300 rounded bg-white"
                            />
                            {inserts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => updateCustom({ inserts: inserts.filter((_, i) => i !== idx) })}
                                className="text-slate-400 hover:text-red-600 p-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div>
                            <label className="text-[9px] text-slate-400 block">Furos (separados por vírgula):</label>
                            <input
                              type="text"
                              value={ins.holes.join(', ')}
                              onChange={(e) => {
                                const updated = [...inserts];
                                updated[idx] = {
                                  ...updated[idx],
                                  holes: e.target.value.split(',').map((h) => h.trim()).filter(Boolean)
                                };
                                updateCustom({ inserts: updated });
                              }}
                              placeholder="3, 6, 1/4, 8"
                              className="w-full px-1.5 py-0.5 font-mono text-[10px] border border-slate-300 rounded bg-white"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tabela de Modelos e Part Numbers */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">Linhas da Tabela ({tableRows.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newRow: InsertTableRow = {
                            code: `IN0${tableRows.length + 1}`,
                            holesDesc: 'Furação configurável',
                            models: Object.fromEntries(tableColumns.map((col) => [col, '06.04.0000-00']))
                          };
                          updateCustom({ tableRows: [...tableRows, newRow] });
                        }}
                        className="text-[10px] text-blue-700 font-bold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
                      >
                        + Linha
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {tableRows.map((row, rIdx) => (
                        <div key={rIdx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <input
                              type="text"
                              value={row.code}
                              onChange={(e) => {
                                const updated = [...tableRows];
                                updated[rIdx] = { ...updated[rIdx], code: e.target.value };
                                updateCustom({ tableRows: updated });
                              }}
                              placeholder="Código"
                              className="w-16 px-1.5 py-0.5 font-bold font-mono text-xs border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="text"
                              value={row.holesDesc}
                              onChange={(e) => {
                                const updated = [...tableRows];
                                updated[rIdx] = { ...updated[rIdx], holesDesc: e.target.value };
                                updateCustom({ tableRows: updated });
                              }}
                              placeholder="Descrição dos furos"
                              className="flex-1 px-1.5 py-0.5 text-xs border border-slate-300 rounded bg-white"
                            />
                            {tableRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => updateCustom({ tableRows: tableRows.filter((_, i) => i !== rIdx) })}
                                className="text-slate-400 hover:text-red-600 p-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 8. GALERIA DE FOTOS */}
            {selectedBlock.type === 'image_gallery' && (() => {
              const images = selectedBlock.images || [];

              return (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Título da Galeria</label>
                    <input
                      type="text"
                      value={selectedBlock.title || ''}
                      onChange={(e) => updateBlock(blockPageId, selectedBlock.id, { title: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded text-xs font-bold"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800">Fotos da Galeria ({images.length})</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => galleryFileInputRef.current?.click()}
                          className="flex items-center gap-1 text-[10px] text-blue-700 font-bold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
                        >
                          <Upload className="w-3 h-3" />
                          <span>+ Foto do PC</span>
                        </button>
                        <input
                          type="file"
                          ref={galleryFileInputRef}
                          onChange={handleAddGalleryImageFromUpload}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                      {images.map((img, idx) => (
                        <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-10 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                              <img src={img.url} alt="Thumbnail" className="w-full h-full object-cover" />
                            </div>
                            <input
                              type="text"
                              value={img.url}
                              onChange={(e) => {
                                const updated = [...images];
                                updated[idx] = { ...updated[idx], url: e.target.value };
                                updateBlock(blockPageId, selectedBlock.id, { images: updated });
                              }}
                              placeholder="URL da imagem..."
                              className="flex-1 px-1.5 py-0.5 text-[10px] font-mono border border-slate-300 rounded bg-white truncate"
                            />
                            {images.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = images.filter((_, i) => i !== idx);
                                  updateBlock(blockPageId, selectedBlock.id, { images: updated });
                                }}
                                className="text-slate-400 hover:text-red-600 p-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <input
                            type="text"
                            value={img.caption || ''}
                            onChange={(e) => {
                              const updated = [...images];
                              updated[idx] = { ...updated[idx], caption: e.target.value };
                              updateBlock(blockPageId, selectedBlock.id, { images: updated });
                            }}
                            placeholder="Legenda da foto..."
                            className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white italic"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Customização de Colunas para Tabelas */}
            {['table', 'electrical_table', 'accessories_table', 'custom_table'].includes(selectedBlock.type) && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Personalizar Colunas</span>
                  <button
                    type="button"
                    onClick={handleAddCustomColumn}
                    className="flex items-center gap-1 text-[10px] text-blue-700 hover:text-blue-900 font-semibold px-2 py-0.5 bg-blue-50 border border-blue-200 rounded"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Nova Coluna</span>
                  </button>
                </div>

                <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 max-h-60 overflow-y-auto">
                  {(selectedBlock.tableColumns || []).map((col) => (
                    <div
                      key={col.key}
                      className="p-1.5 bg-white border border-slate-200 rounded-md space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleColumn(col.key, col.label)}
                          className="flex items-center gap-1.5 text-slate-700 hover:text-blue-700"
                        >
                          {col.visible !== false ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          )}
                          <span className="text-[10px] font-mono text-slate-400">[{col.key}]</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(col.key)}
                          className="text-slate-300 hover:text-red-600 p-0.5"
                          title="Remover coluna"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div>
                        <label className="text-[9px] text-slate-400 block">Nome da Coluna:</label>
                        <input
                          type="text"
                          value={col.label}
                          onChange={(e) => handleColumnLabelChange(col.key, e.target.value)}
                          className="w-full px-2 py-1 text-[11px] font-semibold text-slate-800 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {selectedBlock.type === 'table' && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Campos Rápidos da Biblioteca
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {AVAILABLE_DEFAULT_FIELDS.map((f) => {
                        const exists = selectedBlock.tableColumns?.some((c) => c.key === f.key);
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => handleToggleColumn(f.key, f.label)}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                              exists
                                ? 'bg-blue-100 text-blue-900 border-blue-300 font-semibold'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Propriedades de Texto */}
            {selectedBlock.type === 'text' && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Conteúdo de Texto</label>
                  <textarea
                    rows={6}
                    value={selectedBlock.textContent || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { textContent: e.target.value })
                    }
                    className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 font-sans text-xs"
                    placeholder="Use # para título, ## para subtítulo..."
                  />
                </div>
              </div>
            )}

            {/* Propriedades de Imagem Individual */}
            {selectedBlock.type === 'image' && (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fotografia do Computador ou URL</label>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-semibold text-xs shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Selecionar Arquivo do PC</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleLocalImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Legenda Técnica</label>
                  <input
                    type="text"
                    value={selectedBlock.imageCaption || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { imageCaption: e.target.value })
                    }
                    placeholder="Ex: Figura 1 — Calibrador Presys PCON"
                    className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Propriedades da Capa Total A4 (Modo Canva) */}
            {selectedBlock.type === 'full_page_cover' && (
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Modo Canva — Estilo da Capa</span>
                  </span>
                  <span className="text-[9px] font-mono bg-blue-50 text-[#003366] px-1.5 py-0.5 rounded font-bold">
                    Full Page A4
                  </span>
                </div>

                {/* Seletor de Estilo de Layout da Capa */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Layout Visual da Capa</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...(selectedBlock.customData || {}), coverStyle: 'photo_hero' }
                        })
                      }
                      className={`p-2 rounded-lg border text-left text-xs transition-colors flex flex-col justify-between ${
                        (selectedBlock.customData?.coverStyle || 'photo_hero') === 'photo_hero'
                          ? 'bg-[#003366] text-white border-[#003366] font-bold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>Foto Inteira (Full-Bleed)</span>
                      <span className="text-[9px] opacity-75 font-normal">Estilo PSV Portable</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...(selectedBlock.customData || {}), coverStyle: 'editorial_cards' }
                        })
                      }
                      className={`p-2 rounded-lg border text-left text-xs transition-colors flex flex-col justify-between ${
                        selectedBlock.customData?.coverStyle === 'editorial_cards'
                          ? 'bg-[#003366] text-white border-[#003366] font-bold shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>Editorial c/ Destaques</span>
                      <span className="text-[9px] opacity-75 font-normal">Estilo PCON-Y18</span>
                    </button>
                  </div>
                </div>

                {/* Fotografia de Fundo & Galeria */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fotografia de Fundo da Capa</label>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        openGallery((selection) => {
                          if (typeof selection === 'string') {
                            updateBlock(blockPageId, selectedBlock.id, { imageUrl: selection, legacyUrl: selection });
                          } else if (selection.assetId) {
                            updateBlock(blockPageId, selectedBlock.id, {
                              assetId: selection.assetId
                            });
                          }
                        })
                      }
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                    >
                      <Image className="w-3.5 h-3.5" />
                      <span>Abrir Galeria de Fotos (Acervo)</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={selectedBlock.imageUrl || ''}
                    onChange={(e) =>
                      updateBlock(blockPageId, selectedBlock.id, { imageUrl: e.target.value })
                    }
                    placeholder="Ou cole a URL direta (https://...)"
                    className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>

                {/* Controle de Opacidade do Gradiente Escuro (Overlay) */}
                {(!selectedBlock.customData?.coverStyle || selectedBlock.customData?.coverStyle === 'photo_hero') && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-700 text-xs flex items-center gap-1">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                        <span>Escurecimento da Foto (Contraste)</span>
                      </label>
                      <span className="font-mono text-xs font-bold text-[#003366]">
                        {selectedBlock.customData?.overlayOpacity ?? 45}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={selectedBlock.customData?.overlayOpacity ?? 45}
                      onChange={(e) =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: {
                            ...(selectedBlock.customData || {}),
                            overlayOpacity: Number(e.target.value)
                          }
                        })
                      }
                      className="w-full accent-[#003366] cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-500">
                      Aumente para dar mais destaque e legibilidade ao texto branco sobre fotos claras.
                    </p>
                  </div>
                )}

                {/* Alinhamento de Texto */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alinhamento do Título</label>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...(selectedBlock.customData || {}), textAlign: 'left' }
                        })
                      }
                      className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1 ${
                        (selectedBlock.customData?.textAlign || 'left') === 'left'
                          ? 'bg-white text-[#003366] shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                      <span>Esquerda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(blockPageId, selectedBlock.id, {
                          customData: { ...(selectedBlock.customData || {}), textAlign: 'center' }
                        })
                      }
                      className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1 ${
                        selectedBlock.customData?.textAlign === 'center'
                          ? 'bg-white text-[#003366] shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                      <span>Centro</span>
                    </button>
                  </div>
                </div>

                {/* Painel do Modo Canva Dinâmico: Ferramentas & Camadas Livres */}
                <div className="bg-slate-50 p-3 rounded-none border border-slate-300 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-[#003366] text-xs flex items-center gap-1.5 font-mono">
                      <Layers className="w-3.5 h-3.5 text-[#003366]" />
                      <span>Ferramentas & Camadas ({((selectedBlock.customData?.canvasLayers as any[]) || []).length})</span>
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      Arraste livremente no Canvas
                    </span>
                  </div>

                  {/* 1. Barra de Inserção de Novas Ferramentas / Camadas */}
                  <div>
                    <label className="block font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1.5">
                      + Adicionar Novo Elemento Livre
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const prev = (selectedBlock.customData?.canvasLayers as any[]) || [];
                          const newLayer = {
                            id: `layer-${Date.now()}`,
                            type: 'text',
                            label: `Texto Livre ${prev.length + 1}`,
                            content: 'Novo Texto Técnico',
                            x: 10,
                            y: 20 + prev.length * 5,
                            fontSize: 22,
                            fontWeight: 'bold',
                            color: '#ffffff',
                            visible: true,
                            zIndex: prev.length + 10
                          };
                          updateBlock(blockPageId, selectedBlock.id, {
                            customData: { ...(selectedBlock.customData || {}), canvasLayers: [...prev, newLayer] }
                          });
                        }}
                        className="p-1.5 bg-white hover:bg-blue-50 border border-slate-300 hover:border-blue-400 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <Type className="w-3 h-3 text-blue-600" />
                        <span>+ Texto</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const prev = (selectedBlock.customData?.canvasLayers as any[]) || [];
                          const newLayer = {
                            id: `layer-${Date.now()}`,
                            type: 'badge',
                            label: `Selo / Badge ${prev.length + 1}`,
                            content: 'CERTIFICADO RBC ISO 17025',
                            x: 10,
                            y: 10,
                            fontSize: 10,
                            fontWeight: 'bold',
                            fontFamily: 'mono',
                            color: '#93c5fd',
                            backgroundColor: 'rgba(30, 58, 138, 0.5)',
                            borderColor: 'rgba(96, 165, 250, 0.5)',
                            borderWidth: 1,
                            visible: true,
                            zIndex: prev.length + 10
                          };
                          updateBlock(blockPageId, selectedBlock.id, {
                            customData: { ...(selectedBlock.customData || {}), canvasLayers: [...prev, newLayer] }
                          });
                        }}
                        className="p-1.5 bg-white hover:bg-amber-50 border border-slate-300 hover:border-amber-400 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>+ Selo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const prev = (selectedBlock.customData?.canvasLayers as any[]) || [];
                          const newLayer = {
                            id: `layer-${Date.now()}`,
                            type: 'line',
                            label: `Linha Técnica ${prev.length + 1}`,
                            x: 10,
                            y: 35,
                            width: 100,
                            height: 3,
                            backgroundColor: '#3b82f6',
                            visible: true,
                            zIndex: prev.length + 10
                          };
                          updateBlock(blockPageId, selectedBlock.id, {
                            customData: { ...(selectedBlock.customData || {}), canvasLayers: [...prev, newLayer] }
                          });
                        }}
                        className="p-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <Minus className="w-3 h-3 text-blue-600" />
                        <span>+ Linha</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Lista de Camadas Existentes com Controles Individuais */}
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-700 text-[10px] uppercase tracking-wider">
                      Camadas no Canvas
                    </label>

                    {(((selectedBlock.customData?.canvasLayers as any[]) || []).length === 0) ? (
                      <p className="text-[10px] text-slate-500 italic p-2 bg-white border border-slate-200 text-center">
                        Nenhum elemento adicionado. Use os botões acima para criar textos, selos e linhas livres.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {((selectedBlock.customData?.canvasLayers as any[]) || []).map((layer: any, idx: number) => {
                          const layers = (selectedBlock.customData?.canvasLayers as any[]) || [];

                          const updateCurrentLayer = (updates: any) => {
                            const updated = layers.map((l: any) => (l.id === layer.id ? { ...l, ...updates } : l));
                            updateBlock(blockPageId, selectedBlock.id, {
                              customData: { ...(selectedBlock.customData || {}), canvasLayers: updated }
                            });
                          };

                          const deleteCurrentLayer = () => {
                            const updated = layers.filter((l: any) => l.id !== layer.id);
                            updateBlock(blockPageId, selectedBlock.id, {
                              customData: { ...(selectedBlock.customData || {}), canvasLayers: updated }
                            });
                          };

                          return (
                            <div
                              key={layer.id}
                              className="p-2.5 bg-white border border-slate-300 rounded-none shadow-2xs space-y-2"
                            >
                              {/* Header do Layer */}
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className="text-slate-400 font-mono text-[9px]">#{idx + 1}</span>
                                  <input
                                    type="text"
                                    value={layer.label || 'Elemento'}
                                    onChange={(e) => updateCurrentLayer({ label: e.target.value })}
                                    className="font-bold text-slate-800 text-xs bg-transparent outline-none focus:bg-amber-50 px-1 border-b border-transparent focus:border-amber-400 flex-1 truncate"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateCurrentLayer({ visible: layer.visible === false ? true : false })}
                                    className={`p-1 text-xs rounded-none ${layer.visible !== false ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-100'}`}
                                    title={layer.visible !== false ? 'Ocultar elemento' : 'Exibir elemento'}
                                  >
                                    {layer.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={deleteCurrentLayer}
                                    className="p-1 text-slate-400 hover:text-red-600"
                                    title="Excluir camada"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Conteúdo de Texto se for Text ou Badge */}
                              {(layer.type === 'text' || layer.type === 'badge') && (
                                <div>
                                  <label className="block text-[9px] font-mono text-slate-500">Conteúdo do Texto</label>
                                  <input
                                    type="text"
                                    value={layer.content || ''}
                                    onChange={(e) => updateCurrentLayer({ content: e.target.value })}
                                    className="w-full p-1 border border-slate-300 text-xs font-sans mt-0.5 bg-slate-50 focus:bg-white"
                                  />
                                </div>
                              )}

                              {/* Posição X e Y (Enquadramento) */}
                              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1.5 border border-slate-200">
                                <div>
                                  <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-0.5">
                                    <span>Posição X (Horizontal)</span>
                                    <span className="font-bold text-[#003366]">{layer.x}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="95"
                                    value={layer.x || 0}
                                    onChange={(e) => updateCurrentLayer({ x: Number(e.target.value) })}
                                    className="w-full accent-[#003366] cursor-pointer"
                                  />
                                </div>

                                <div>
                                  <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-0.5">
                                    <span>Posição Y (Vertical)</span>
                                    <span className="font-bold text-[#003366]">{layer.y}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="95"
                                    value={layer.y || 0}
                                    onChange={(e) => updateCurrentLayer({ y: Number(e.target.value) })}
                                    className="w-full accent-[#003366] cursor-pointer"
                                  />
                                </div>
                              </div>

                              {/* Botões de Alinhamento Rápido */}
                              <div className="flex items-center justify-between gap-1 pt-0.5">
                                <span className="text-[9px] font-mono text-slate-500">Alinhar:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateCurrentLayer({ x: 5 })}
                                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[9px] font-mono border border-slate-300"
                                    title="Alinhar na margem esquerda (5%)"
                                  >
                                    Margem Esq.
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateCurrentLayer({ x: 50, textAlign: 'center' })}
                                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[9px] font-mono border border-slate-300"
                                    title="Centralizar horizontalmente (50%)"
                                  >
                                    Centro (X)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateCurrentLayer({ y: 5 })}
                                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-[9px] font-mono border border-slate-300"
                                    title="Alinhar ao topo (5%)"
                                  >
                                    Topo
                                  </button>
                                </div>
                              </div>

                              {/* Tamanho da Fonte (para Text e Badge) */}
                              {(layer.type === 'text' || layer.type === 'badge') && (
                                <div>
                                  <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-0.5">
                                    <span>Tamanho da Fonte</span>
                                    <span className="font-bold text-[#003366]">{layer.fontSize || 16}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="8"
                                    max="80"
                                    value={layer.fontSize || 16}
                                    onChange={(e) => updateCurrentLayer({ fontSize: Number(e.target.value) })}
                                    className="w-full accent-[#003366] cursor-pointer"
                                  />
                                </div>
                              )}

                              {/* Largura (para Linha ou Forma) */}
                              {(layer.type === 'line' || layer.type === 'shape' || layer.type === 'image') && (
                                <div>
                                  <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-0.5">
                                    <span>Largura (px)</span>
                                    <span className="font-bold text-[#003366]">{layer.width || 100}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="20"
                                    max="700"
                                    value={layer.width || 100}
                                    onChange={(e) => updateCurrentLayer({ width: Number(e.target.value) })}
                                    className="w-full accent-[#003366] cursor-pointer"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Configurações da Folha {activePage.pageNumber}
            </span>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Título da Página</label>
              <input
                type="text"
                value={activePage.title || ''}
                onChange={(e) => setPageTitle(activePage.id, e.target.value)}
                placeholder="Ex: Capa Principal"
                className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-brand-500 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Formato</label>
              <span className="block p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 font-mono">
                A4 Retrato (210mm x 297mm)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 italic pt-2 leading-relaxed">
              Clique em qualquer tabela ou elemento na folha A4 para abrir suas propriedades aqui diretamente.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
