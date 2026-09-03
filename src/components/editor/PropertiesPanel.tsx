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
  Sparkles,
  CircleDot,
  Layers,
  Laptop,
  LayoutGrid,
  Copy
} from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { usePresenceStore } from '../../stores/usePresenceStore';
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
import { FullPageCoverInspector } from './inspector/FullPageCoverInspector';
import { TextInspector } from './inspector/TextInspector';
import { ImageInspector } from './inspector/ImageInspector';
import { HeroBannerInspector } from './inspector/HeroBannerInspector';
import { FlukeHeaderInspector } from './inspector/FlukeHeaderInspector';
import { AdditelTwoColInspector } from './inspector/AdditelTwoColInspector';
import { BottomHeaderInspector } from './inspector/BottomHeaderInspector';

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
    duplicateStructuralSection,
    setPageTitle
  } = useCatalogStore();
  const getParticipantsOnBlock = usePresenceStore((state) => state.getParticipantsOnBlock);
  const markEditing = usePresenceStore((state) => state.markEditing);

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
          <div className="flex items-center gap-1">
            {selectedBlock.type === 'structural_section' && (
              <button
                type="button"
                onClick={() => duplicateStructuralSection(blockPageId, selectedBlock.id)}
                className="text-slate-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors cursor-pointer"
                title="Duplicar seção estrutural"
                aria-label="Duplicar seção estrutural"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => removeBlock(blockPageId, selectedBlock.id)}
              className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
              title="Excluir elemento selecionado"
              aria-label="Excluir elemento selecionado"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
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

            {/* 1. CAPA A4 PÁGINA INTEIRA (CORE.E4 INSPECTOR CANÔNICO) */}
            {selectedBlock.type === 'full_page_cover' && (
              <FullPageCoverInspector
                block={selectedBlock}
                pageId={blockPageId}
              />
            )}

            {/* 2. HEADER METROLÓGICO CANÔNICO (CORE.E6A) */}
            {selectedBlock.type === 'fluke_header' && (
              <FlukeHeaderInspector block={selectedBlock} pageId={blockPageId} />
            )}

            {/* 3. HEADER DUAL-COLUMN PRESYS CANÔNICO (CORE.E6A) */}
            {selectedBlock.type === 'additel_two_col_hero' && (
              <AdditelTwoColInspector block={selectedBlock} pageId={blockPageId} />
            )}

            {/* 4. BOTTOM HEADER CANÔNICO (CORE.E6A) */}
            {selectedBlock.type === 'bottom_header' && (
              <BottomHeaderInspector block={selectedBlock} pageId={blockPageId} />
            )}

            {/* 5. HERO BANNER CANÔNICO (CORE.E5B) */}
            {selectedBlock.type === 'hero_banner' && (
              <HeroBannerInspector block={selectedBlock} pageId={blockPageId} />
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

            {/* 9. BLOCO DE TEXTO LIVRE (CORE.E5A) */}
            {selectedBlock.type === 'text' && (
              <TextInspector block={selectedBlock} pageId={blockPageId} />
            )}

            {/* 10. BLOCO DE IMAGEM INDIVIDUAL (CORE.E5A) */}
            {selectedBlock.type === 'image' && (
              <ImageInspector block={selectedBlock} pageId={blockPageId} />
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
