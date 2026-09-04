// src/labs/product-workspace-ux/components/WorkspaceSection.tsx
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  EyeOff,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  Check,
  X
} from 'lucide-react';
import { WorkspaceSection, WorkspaceMode, BlockSize, FactItem, WorkspaceBlock } from '../types';
import { FactGridBlock } from './FactGridBlock';
import { MegaTableBlock } from './MegaTableBlock';
import { DocumentsBlock } from './DocumentsBlock';
import { ConflictsBlock } from './ConflictsBlock';

interface WorkspaceSectionProps {
  section: WorkspaceSection;
  mode: WorkspaceMode;
  onToggleCollapse: () => void;
  onRenameSection: (newTitle: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveBlockUp: (blockId: string) => void;
  onMoveBlockDown: (blockId: string) => void;
  onResizeBlock: (blockId: string, size: BlockSize) => void;
  onHideBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddFactToSection: () => void;
  onEditFact: (fact: FactItem) => void;
  onOpenSource: (fact: FactItem) => void;
  onOpenSemantic: (fact: FactItem) => void;
  onReviewConflict: (conflict: FactItem) => void;
  onToggleMegaTableFullscreen: (block: WorkspaceBlock) => void;
  onToggleFactVisibility?: (factId: string) => void;
  productName?: string;
}

export const WorkspaceSectionComponent: React.FC<WorkspaceSectionProps> = ({
  section,
  mode,
  onToggleCollapse,
  onRenameSection,
  onMoveUp,
  onMoveDown,
  onMoveBlockUp,
  onMoveBlockDown,
  onResizeBlock,
  onHideBlock,
  onDeleteBlock,
  onAddFactToSection,
  onEditFact,
  onOpenSource,
  onOpenSemantic,
  onReviewConflict,
  onToggleMegaTableFullscreen,
  onToggleFactVisibility,
  productName
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);

  const handleSaveTitle = () => {
    if (titleDraft.trim()) {
      onRenameSection(titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  return (
    <section
      id={section.id}
      className={`scroll-mt-24 bg-white/70 backdrop-blur-xs border rounded-2xl transition-all ${
        mode === 'edit_workspace'
          ? 'border-dashed border-amber-300 shadow-xs bg-amber-50/10'
          : 'border-slate-200/90 shadow-2xs'
      }`}
    >
      {/* Cabeçalho da Seção */}
      <div className="p-4 sm:p-5 flex items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {mode === 'edit_workspace' && (
            <div className="flex items-center gap-0.5 text-slate-400">
              <GripVertical className="w-4 h-4 cursor-grab" />
              {onMoveUp && (
                <button
                  onClick={onMoveUp}
                  title="Mover seção para cima"
                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              )}
              {onMoveDown && (
                <button
                  onClick={onMoveDown}
                  title="Mover seção para baixo"
                  className="p-1 hover:text-slate-700 hover:bg-slate-100 rounded"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 flex-1 max-w-md">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                className="w-full text-base font-bold text-slate-900 border border-[#003366] rounded px-2 py-0.5 outline-none"
              />
              <button
                onClick={handleSaveTitle}
                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setTitleDraft(section.title);
                  setIsEditingTitle(false);
                }}
                className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 truncate">
              <h3
                onClick={onToggleCollapse}
                className="text-base sm:text-lg font-bold text-slate-900 tracking-tight cursor-pointer hover:text-[#003366] truncate"
              >
                {section.title}
              </h3>
              {mode === 'edit_workspace' && (
                <button
                  onClick={() => setIsEditingTitle(true)}
                  title="Renomear seção"
                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'edit_workspace' && (
            <button
              onClick={onAddFactToSection}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar item</span>
            </button>
          )}

          <button
            onClick={onToggleCollapse}
            title={section.isCollapsed ? 'Expandir seção' : 'Recolher seção'}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            {section.isCollapsed ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronUp className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo dos Blocos da Seção */}
      {!section.isCollapsed && (
        <div className="p-4 sm:p-5 space-y-4">
          {section.description && (
            <p className="text-xs text-slate-500 max-w-3xl -mt-1 mb-3">
              {section.description}
            </p>
          )}

          {section.blocks
            .filter((b) => !b.isHidden)
            .map((block) => (
              <div
                key={block.id}
                className={`relative group/block transition-all ${
                  mode === 'edit_workspace'
                    ? 'p-2 border border-slate-200 rounded-xl bg-white shadow-2xs'
                    : ''
                }`}
              >
                {/* Barra de Ações do Bloco no Modo Editar Workspace */}
                {mode === 'edit_workspace' && (
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1 font-medium">
                      <GripVertical className="w-3.5 h-3.5 text-slate-400 cursor-grab" />
                      <span className="capitalize">{block.kind.replace('_', ' ')}</span>
                      {block.title && <span className="text-slate-700">· {block.title}</span>}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Seletor de Tamanho Conceitual (small, medium, large, full) */}
                      <div className="inline-flex bg-white border border-slate-200 rounded text-[10px] overflow-hidden">
                        {(['small', 'medium', 'large', 'full'] as const).map((sz) => (
                          <button
                            key={sz}
                            onClick={() => onResizeBlock(block.id, sz)}
                            className={`px-1.5 py-0.5 capitalize font-medium ${
                              block.size === sz
                                ? 'bg-[#003366] text-white font-bold'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => onMoveBlockUp(block.id)}
                        title="Mover para cima"
                        className="p-1 hover:bg-slate-200 rounded"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onMoveBlockDown(block.id)}
                        title="Mover para baixo"
                        className="p-1 hover:bg-slate-200 rounded"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onHideBlock(block.id)}
                        title="Ocultar desta visualização sem apagar os dados"
                        className="p-1 hover:text-amber-700 hover:bg-amber-50 rounded"
                      >
                        <EyeOff className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteBlock(block.id)}
                        title="Excluir bloco"
                        className="p-1 hover:text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Renderização do Tipo do Bloco */}
                {block.data.kind === 'hero_summary' && (
                  <FactGridBlock
                    facts={block.data.facts}
                    mode={mode}
                    variant="hero"
                    onEditFact={onEditFact}
                    onOpenSource={onOpenSource}
                    onOpenSemantic={onOpenSemantic}
                    onToggleFactVisibility={onToggleFactVisibility}
                  />
                )}

                {block.data.kind === 'fact_grid' && (
                  <FactGridBlock
                    facts={block.data.facts}
                    mode={mode}
                    variant="key_value"
                    onEditFact={onEditFact}
                    onOpenSource={onOpenSource}
                    onOpenSemantic={onOpenSemantic}
                    onToggleFactVisibility={onToggleFactVisibility}
                  />
                )}

                {block.data.kind === 'mega_table' && (
                  <MegaTableBlock
                    table={block.data.table}
                    mode={mode}
                    onToggleFullscreen={() => onToggleMegaTableFullscreen(block)}
                    onOpenSourceModal={(source) =>
                      onOpenSource({
                        id: 'table_source',
                        label: 'Especificação da Tabela',
                        value: '',
                        originScope: 'model',
                        originLabel: productName || 'Este instrumento',
                        semanticKey: 'table.spec',
                        source
                      })
                    }
                  />
                )}

                {block.data.kind === 'table' && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    {block.title && (
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">
                        {block.title}
                      </div>
                    )}
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100/70 border-b border-slate-200 font-semibold text-slate-700">
                        <tr>
                          {block.data.table.columns.map((c) => (
                            <th key={c.id} className="py-2 px-3">
                              {c.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {block.data.table.rows.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            {r.values.map((v, vIdx) => (
                              <td key={vIdx} className="py-2 px-3 text-slate-800">
                                {v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {block.data.kind === 'feature_list' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {block.data.items.map((it) => (
                      <div
                        key={it.id}
                        className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all"
                      >
                        <h5 className="text-xs font-bold text-slate-900">{it.title}</h5>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {it.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {block.data.kind === 'documents' && (
                  <DocumentsBlock documents={block.data.documents} />
                )}

                {block.data.kind === 'conflicts' && (
                  <ConflictsBlock
                    conflicts={block.data.conflicts}
                    onReviewConflict={onReviewConflict}
                  />
                )}

                {block.data.kind === 'notes' && (
                  <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-xs text-slate-600 leading-relaxed italic">
                    {block.data.content}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </section>
  );
};
