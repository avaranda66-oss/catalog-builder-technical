// src/labs/product-workspace-ux/useMegaWorkspaceState.ts
/**
 * Hook de Estado Local para o Human-First Mega Product Workspace UX Lab.
 * 
 * Regra Arquitetural:
 * - 100% isolado (não toca stores de produção nem Supabase)
 * - Implementa histórico local de Undo para satisfazer UX
 * - Dá suporte a todas as 10 jornadas do Father Test
 */

import { useState, useCallback, useMemo } from 'react';
import {
  WorkspaceSection,
  WorkspaceBlock,
  WorkspaceMode,
  WorkspacePerspective,
  FactItem,
  BlockSize,
  UndoSnapshot,
  SearchResultItem,
  AIOrganizeDiff
} from './types';
import { TA25N_INITIAL_SECTIONS } from './ta25n.fixture';

export function useMegaWorkspaceState() {
  const [sections, setSections] = useState<WorkspaceSection[]>(() => structuredClone(TA25N_INITIAL_SECTIONS));
  const [mode, setMode] = useState<WorkspaceMode>('view');
  const [perspective, setPerspective] = useState<WorkspacePerspective>('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [undoToastMessage, setUndoToastMessage] = useState<string | null>(null);

  // Modais e gavetas
  const [selectedFactForEdit, setSelectedFactForEdit] = useState<FactItem | null>(null);
  const [selectedFactForSource, setSelectedFactForSource] = useState<FactItem | null>(null);
  const [selectedConflictForReview, setSelectedConflictForReview] = useState<FactItem | null>(null);
  const [selectedSemanticForRename, setSelectedSemanticForRename] = useState<FactItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetSectionForAdd, setTargetSectionForAdd] = useState<string | null>(null);
  const [isAIOrganizeModalOpen, setIsAIOrganizeModalOpen] = useState(false);
  const [isAIImportModalOpen, setIsAIImportModalOpen] = useState(false);
  const [isCreateTableModalOpen, setIsCreateTableModalOpen] = useState(false);
  const [expandedMegaTable, setExpandedMegaTable] = useState<WorkspaceBlock | null>(null);
  const [showTransformSuggestion, setShowTransformSuggestion] = useState(true);

  // Helper para registrar snapshot de desfazer
  const recordUndo = useCallback((description: string) => {
    setSections((prev) => {
      const snap: UndoSnapshot = {
        timestamp: Date.now(),
        description,
        sections: structuredClone(prev)
      };
      setUndoStack((u) => [...u.slice(-9), snap]);
      setUndoToastMessage(`${description} · Desfazer`);
      return prev;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setSections(structuredClone(last.sections));
      setUndoToastMessage(null);
      return prev.slice(0, -1);
    });
  }, []);

  const dismissUndoToast = useCallback(() => {
    setUndoToastMessage(null);
  }, []);

  // Alternar colapso de seção
  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId ? { ...sec, isCollapsed: !sec.isCollapsed } : sec
      )
    );
  }, []);

  const expandAllSections = useCallback(() => {
    setSections((prev) => prev.map((sec) => ({ ...sec, isCollapsed: false })));
  }, []);

  const collapseAllSections = useCallback(() => {
    setSections((prev) => prev.map((sec) => ({ ...sec, isCollapsed: true })));
  }, []);

  // Renomear seção
  const renameSection = useCallback((sectionId: string, newTitle: string) => {
    recordUndo(`Seção renomeada para "${newTitle}"`);
    setSections((prev) =>
      prev.map((sec) => (sec.id === sectionId ? { ...sec, title: newTitle.trim() } : sec))
    );
  }, [recordUndo]);

  // Reordenar seção
  const moveSection = useCallback((fromIndex: number, toIndex: number) => {
    setSections((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      recordUndo('Ordem das seções alterada');
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, [recordUndo]);

  // Reordenar blocos dentro da seção
  const moveBlock = useCallback((sectionId: string, fromIndex: number, toIndex: number) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        if (toIndex < 0 || toIndex >= sec.blocks.length) return sec;
        recordUndo('Posição do bloco alterada');
        const blocks = [...sec.blocks];
        const [moved] = blocks.splice(fromIndex, 1);
        blocks.splice(toIndex, 0, moved);
        return { ...sec, blocks };
      })
    );
  }, [recordUndo]);

  const moveBlockUp = useCallback((sectionId: string, blockId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const idx = sec.blocks.findIndex((b) => b.id === blockId);
        if (idx <= 0) return sec;
        recordUndo('Bloco movido para cima');
        const blocks = [...sec.blocks];
        const temp = blocks[idx - 1];
        blocks[idx - 1] = blocks[idx];
        blocks[idx] = temp;
        return { ...sec, blocks };
      })
    );
  }, [recordUndo]);

  const moveBlockDown = useCallback((sectionId: string, blockId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const idx = sec.blocks.findIndex((b) => b.id === blockId);
        if (idx === -1 || idx >= sec.blocks.length - 1) return sec;
        recordUndo('Bloco movido para baixo');
        const blocks = [...sec.blocks];
        const temp = blocks[idx + 1];
        blocks[idx + 1] = blocks[idx];
        blocks[idx] = temp;
        return { ...sec, blocks };
      })
    );
  }, [recordUndo]);

  // Redimensionar bloco
  const resizeBlock = useCallback((sectionId: string, blockId: string, newSize: BlockSize) => {
    recordUndo(`Tamanho do bloco ajustado para ${newSize}`);
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          blocks: sec.blocks.map((b) => (b.id === blockId ? { ...b, size: newSize } : b))
        };
      })
    );
  }, [recordUndo]);

  // Ocultar bloco da visualização sem apagar
  const hideBlock = useCallback((sectionId: string, blockId: string) => {
    recordUndo('Bloco ocultado da visualização');
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          blocks: sec.blocks.map((b) => (b.id === blockId ? { ...b, isHidden: true } : b))
        };
      })
    );
  }, [recordUndo]);

  // Excluir bloco
  const deleteBlock = useCallback((sectionId: string, blockId: string) => {
    recordUndo('Bloco excluído');
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        return {
          ...sec,
          blocks: sec.blocks.filter((b) => b.id !== blockId)
        };
      })
    );
  }, [recordUndo]);

  // Adicionar fato técnico
  const addFact = useCallback((sectionId: string, factData: Omit<FactItem, 'id'>) => {
    recordUndo(`Informação "${factData.label}" adicionada`);
    const newFact: FactItem = {
      ...factData,
      id: `fact_${Date.now()}`
    };

    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        // Adiciona ao primeiro bloco de fatos ou cria um
        const existingGrid = sec.blocks.find((b) => b.kind === 'fact_grid');
        if (existingGrid && existingGrid.data.kind === 'fact_grid') {
          return {
            ...sec,
            blocks: sec.blocks.map((b) =>
              b.id === existingGrid.id && b.data.kind === 'fact_grid'
                ? { ...b, data: { ...b.data, facts: [...b.data.facts, newFact] } }
                : b
            )
          };
        } else {
          const newBlock: WorkspaceBlock = {
            id: `blk_grid_${Date.now()}`,
            kind: 'fact_grid',
            size: 'full',
            data: {
              kind: 'fact_grid',
              layoutVariant: 'key_value',
              facts: [newFact]
            }
          };
          return { ...sec, blocks: [...sec.blocks, newBlock] };
        }
      })
    );
  }, [recordUndo]);

  // Editar fato técnico existente
  const updateFact = useCallback(
    (factId: string, draft: Partial<FactItem>, scopeChoice: 'model' | 'family') => {
      recordUndo('Especificação técnica atualizada');
      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.data.kind === 'hero_summary') {
              return {
                ...b,
                data: {
                  ...b.data,
                  facts: b.data.facts.map((f) =>
                    f.id === factId
                      ? {
                          ...f,
                          ...draft,
                          originScope: scopeChoice,
                          originLabel: scopeChoice === 'model' ? 'TA-25N' : 'Linha TA'
                        }
                      : f
                  )
                }
              };
            }
            if (b.data.kind === 'fact_grid') {
              return {
                ...b,
                data: {
                  ...b.data,
                  facts: b.data.facts.map((f) =>
                    f.id === factId
                      ? {
                          ...f,
                          ...draft,
                          originScope: scopeChoice,
                          originLabel: scopeChoice === 'model' ? 'TA-25N' : 'Linha TA'
                        }
                      : f
                  )
                }
              };
            }
            return b;
          })
        }))
      );
    },
    [recordUndo]
  );

  // Resolver conflito
  const resolveConflict = useCallback(
    (factId: string, chosenValue: string, chosenUnit?: string) => {
      recordUndo(`Divergência resolvida para ${chosenValue} ${chosenUnit || ''}`);
      setSections((prev) =>
        prev.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.data.kind === 'conflicts') {
              return {
                ...b,
                data: {
                  ...b.data,
                  conflicts: b.data.conflicts
                    .filter((c) => c.id !== factId)
                    .map((c) => (c.id === factId ? { ...c, value: chosenValue, unit: chosenUnit || c.unit } : c))
                }
              };
            }
            if (b.data.kind === 'hero_summary' || b.data.kind === 'fact_grid') {
              return {
                ...b,
                data: {
                  ...b.data,
                  facts: b.data.facts.map((f) =>
                    f.id === factId ? { ...f, value: chosenValue, unit: chosenUnit || f.unit, conflict: undefined } : f
                  )
                }
              };
            }
            return b;
          })
        }))
      );
    },
    [recordUndo]
  );

  // Renomear chave semântica com segurança
  const performSafeSemanticRename = useCallback((oldKey: string, newKey: string) => {
    recordUndo(`Identidade semântica atualizada para ${newKey}`);
    setSections((prev) =>
      prev.map((sec) => ({
        ...sec,
        blocks: sec.blocks.map((b) => {
          if (b.data.kind === 'hero_summary' || b.data.kind === 'fact_grid') {
            return {
              ...b,
              data: {
                ...b.data,
                facts: b.data.facts.map((f) => {
                  if (f.semanticKey === oldKey) {
                    const existingAliases = f.aliases || [];
                    const updatedAliases = Array.from(new Set([...existingAliases, oldKey]));
                    return {
                      ...f,
                      semanticKey: newKey,
                      aliases: updatedAliases
                    };
                  }
                  return f;
                })
              }
            };
          }
          return b;
        })
      }))
    );
  }, [recordUndo]);

  // Aplicar organização de IA (antes e depois amigável)
  const applyAIOrganization = useCallback((): AIOrganizeDiff => {
    recordUndo('Organização automática por IA aplicada');
    
    // Simula rearranjo inteligente sem perda de dados
    setSections((prev) => {
      // Reordena: coloca resumo primeiro, depois metrologia, depois mega tabela de sensores
      const resumo = prev.find((s) => s.id === 'sec-resumo');
      const metro = prev.find((s) => s.id === 'sec-metrologia');
      const sensores = prev.find((s) => s.id === 'sec-sensores');
      const outros = prev.filter(
        (s) => s.id !== 'sec-resumo' && s.id !== 'sec-metrologia' && s.id !== 'sec-sensores'
      );
      
      const newOrder: WorkspaceSection[] = [];
      if (resumo) newOrder.push(resumo);
      if (metro) newOrder.push(metro);
      if (sensores) newOrder.push(sensores);
      newOrder.push(...outros);
      return newOrder;
    });

    return {
      newSectionsCount: 0,
      newTablesCount: 1,
      groupedCardsCount: 12,
      removedFactsCount: 0,
      summary: 'Reorganizamos os blocos técnicos em ordem lógica industrial de calibração.',
      details: [
        'Sensores e entradas elétricas consolidadas na Mega Tabela principal',
        'Fatos de metrologia agrupados em grid compacto de alta densidade',
        'Nenhuma informação foi removida ou alterada'
      ]
    };
  }, [recordUndo]);

  // Criar nova tabela
  const createNewTable = useCallback(
    (sectionId: string, title: string, columns: string[], rows: string[][]) => {
      recordUndo(`Nova tabela "${title}" criada`);
      const newBlock: WorkspaceBlock = {
        id: `blk_table_${Date.now()}`,
        kind: 'table',
        title,
        size: 'medium',
        data: {
          kind: 'table',
          table: {
            columns: columns.map((col, idx) => ({ id: `col_${idx}`, header: col })),
            rows: rows.map((row, rIdx) => ({ id: `row_${rIdx}`, values: row }))
          }
        }
      };

      setSections((prev) =>
        prev.map((sec) => (sec.id === sectionId ? { ...sec, blocks: [...sec.blocks, newBlock] } : sec))
      );
    },
    [recordUndo]
  );

  // Transformar cards em tabela
  const transformSelectedFactsIntoTable = useCallback(
    (sectionId: string, factIds: string[], tableTitle: string) => {
      recordUndo(`Informações convertidas para a tabela "${tableTitle}"`);
      setSections((prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const collectedFacts: FactItem[] = [];
          for (const b of sec.blocks) {
            if (b.data.kind === 'fact_grid') {
              for (const f of b.data.facts) {
                if (factIds.includes(f.id)) collectedFacts.push(f);
              }
            }
          }

          const tableBlock: WorkspaceBlock = {
            id: `blk_tbl_converted_${Date.now()}`,
            kind: 'table',
            title: tableTitle,
            size: 'medium',
            data: {
              kind: 'table',
              table: {
                columns: [
                  { id: 'prop', header: 'Propriedade' },
                  { id: 'val', header: 'Valor' },
                  { id: 'unid', header: 'Unidade' }
                ],
                rows: collectedFacts.map((f, idx) => ({
                  id: `r_${idx}`,
                  values: [f.label, f.value, f.unit || '-']
                }))
              }
            }
          };

          // Remove os fatos agrupados do grid original
          const updatedBlocks = sec.blocks.map((b) => {
            if (b.data.kind === 'fact_grid') {
              return {
                ...b,
                data: {
                  ...b.data,
                  facts: b.data.facts.filter((f) => !factIds.includes(f.id))
                }
              };
            }
            return b;
          });

          return {
            ...sec,
            blocks: [...updatedBlocks.filter((b) => b.data.kind !== 'fact_grid' || b.data.facts.length > 0), tableBlock]
          };
        })
      );
      setShowTransformSuggestion(false);
    },
    [recordUndo]
  );

  // Busca integrada
  const searchResults = useMemo<SearchResultItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResultItem[] = [];

    for (const sec of sections) {
      for (const block of sec.blocks) {
        if (block.data.kind === 'hero_summary' || block.data.kind === 'fact_grid') {
          for (const fact of block.data.facts) {
            const matchLabel = fact.label.toLowerCase().includes(q);
            const matchVal = fact.value.toLowerCase().includes(q);
            const matchAlias = fact.aliases?.some((a) => a.toLowerCase().includes(q));
            if (matchLabel || matchVal || matchAlias) {
              results.push({
                id: fact.id,
                title: fact.label,
                subtitle: `${fact.value} ${fact.unit || ''}`.trim(),
                sectionId: sec.id,
                sectionTitle: sec.title,
                blockId: block.id,
                type: matchAlias ? 'alias' : 'fact',
                matchedQuery: q
              });
            }
          }
        } else if (block.data.kind === 'mega_table') {
          for (const row of block.data.table.rows) {
            for (const [colId, cell] of Object.entries(row.cells)) {
              if (cell.value.toLowerCase().includes(q)) {
                results.push({
                  id: `${row.id}_${colId}`,
                  title: cell.value,
                  subtitle: `Linha: ${row.cells.sensor?.value || row.id} (${row.group || 'Geral'})`,
                  sectionId: sec.id,
                  sectionTitle: sec.title,
                  blockId: block.id,
                  type: 'sensor',
                  matchedQuery: q
                });
                break;
              }
            }
          }
        } else if (block.data.kind === 'documents') {
          for (const doc of block.data.documents) {
            if (
              doc.title.toLowerCase().includes(q) ||
              doc.code.toLowerCase().includes(q)
            ) {
              results.push({
                id: doc.id,
                title: doc.title,
                subtitle: `Código: ${doc.code} · ${doc.referencedFactsCount} fatos`,
                sectionId: sec.id,
                sectionTitle: sec.title,
                blockId: block.id,
                type: 'document',
                matchedQuery: q
              });
            }
          }
        }
      }
    }

    return results;
  }, [sections, searchQuery]);

  return {
    sections,
    mode,
    setMode,
    perspective,
    setPerspective,
    searchQuery,
    setSearchQuery,
    searchResults,
    undoStack,
    undoToastMessage,
    dismissUndoToast,
    undo,
    toggleSectionCollapse,
    expandAllSections,
    collapseAllSections,
    renameSection,
    moveSection,
    moveBlock,
    moveBlockUp,
    moveBlockDown,
    resizeBlock,
    hideBlock,
    deleteBlock,
    addFact,
    updateFact,
    resolveConflict,
    performSafeSemanticRename,
    applyAIOrganization,
    createNewTable,
    transformSelectedFactsIntoTable,
    showTransformSuggestion,
    setShowTransformSuggestion,

    // Modais e seletores
    selectedFactForEdit,
    setSelectedFactForEdit,
    selectedFactForSource,
    setSelectedFactForSource,
    selectedConflictForReview,
    setSelectedConflictForReview,
    selectedSemanticForRename,
    setSelectedSemanticForRename,
    isAddModalOpen,
    setIsAddModalOpen,
    targetSectionForAdd,
    setTargetSectionForAdd,
    isAIOrganizeModalOpen,
    setIsAIOrganizeModalOpen,
    isAIImportModalOpen,
    setIsAIImportModalOpen,
    isCreateTableModalOpen,
    setIsCreateTableModalOpen,
    expandedMegaTable,
    setExpandedMegaTable
  };
}
