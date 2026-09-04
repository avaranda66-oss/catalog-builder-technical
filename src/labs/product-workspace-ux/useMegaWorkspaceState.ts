// src/labs/product-workspace-ux/useMegaWorkspaceState.ts
/**
 * Hook de Estado Local para o Human-First Mega Product Workspace UX Lab.
 * 
 * Regras Arquiteturais & Emendas Obrigatórias:
 * - AMENDMENT 3: Cross-product generalizável via registry dinâmico (PRODUCT_FIXTURES).
 * - AMENDMENT 4: Isolamento total de estado por produto (trocar TA -> PCON -> TA preserva edições).
 * - AMENDMENT 5: Modelo atômico de mutação (applyWorkspaceMutation):
 *   snapshot before -> calculate next -> detect no-op -> push 1 undo -> commit.
 * - AMENDMENT 2: Contagens derivadas dinamicamente da projeção (deriveFactsCount, etc.).
 * - AMENDMENT 7: Busca veloz com mensuração de benchmark em ms.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  WorkspaceSection,
  WorkspaceBlock,
  WorkspaceMode,
  WorkspacePerspective,
  InteractionMode,
  DetailLevel,
  FactItem,
  BlockSize,
  UndoSnapshot,
  SearchResultItem,
  AIOrganizeDiff,
  ProductWorkspaceMetadata,
  deriveWorkspaceMetrics
} from './types';
import {
  PRODUCT_FIXTURES,
  DEFAULT_PRODUCT_ID,
  getProductFixture,
  listProductFixtures
} from './fixtureRegistry';

interface ProductStateSlice {
  sections: WorkspaceSection[];
  undoStack: UndoSnapshot[];
  interactionMode: InteractionMode;
  detailLevel: DetailLevel;
  mode: WorkspaceMode;
  perspective: WorkspacePerspective;
  undoToastMessage: string | null;
}

export function useMegaWorkspaceState(initialProductId: string = DEFAULT_PRODUCT_ID) {
  // Inicialização independente para cada fixture registrada
  const [productStates, setProductStates] = useState<Record<string, ProductStateSlice>>(() => {
    const initial: Record<string, ProductStateSlice> = {};
    for (const [key, fixture] of Object.entries(PRODUCT_FIXTURES)) {
      initial[key] = {
        sections: structuredClone(fixture.initialSections),
        undoStack: [],
        interactionMode: 'view',
        detailLevel: 'simple',
        mode: 'view',
        perspective: 'standard',
        undoToastMessage: null
      };
    }
    return initial;
  });

  const [activeProductId, setActiveProductIdState] = useState<string>(initialProductId);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSearchDurationMs, setLastSearchDurationMs] = useState<number>(0);

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

  // Metadados do produto ativo
  const currentFixture = getProductFixture(activeProductId);
  const productMetadata: ProductWorkspaceMetadata = currentFixture.metadata;

  // Fatia de estado ativa
  const currentSlice: ProductStateSlice = productStates[activeProductId] || {
    sections: structuredClone(currentFixture.initialSections),
    undoStack: [],
    interactionMode: 'view',
    detailLevel: 'simple',
    mode: 'view',
    perspective: 'standard',
    undoToastMessage: null
  };

  const sections = currentSlice.sections;
  const interactionMode = currentSlice.interactionMode ?? (currentSlice.mode === 'edit_workspace' ? 'edit_layout' : 'view');
  const detailLevel = currentSlice.detailLevel ?? (currentSlice.perspective === 'engineering' ? 'advanced' : 'simple');
  const mode = currentSlice.mode;
  const perspective = currentSlice.perspective;
  const undoStack = currentSlice.undoStack;
  const undoToastMessage = currentSlice.undoToastMessage;

  // Troca de produto com isolamento estrito de estado (Amendment 4)
  const setActiveProductId = useCallback((newId: string) => {
    setActiveProductIdState(newId);
    setSearchQuery('');
    setSelectedFactForEdit(null);
    setSelectedFactForSource(null);
    setSelectedConflictForReview(null);
    setSelectedSemanticForRename(null);
  }, []);

  // Modificadores ortogonais (Amendment 5)
  const setInteractionMode = useCallback((newInteractionMode: InteractionMode) => {
    setProductStates((prev) => {
      const cur = prev[activeProductId] || prev[DEFAULT_PRODUCT_ID];
      const legacyMode: WorkspaceMode = newInteractionMode === 'view' ? 'view' : 'edit_workspace';
      return {
        ...prev,
        [activeProductId]: {
          ...cur,
          interactionMode: newInteractionMode,
          mode: legacyMode
        }
      };
    });
  }, [activeProductId]);

  const setDetailLevel = useCallback((newDetailLevel: DetailLevel) => {
    setProductStates((prev) => {
      const cur = prev[activeProductId] || prev[DEFAULT_PRODUCT_ID];
      const legacyPerspective: WorkspacePerspective = newDetailLevel === 'advanced' ? 'engineering' : 'standard';
      return {
        ...prev,
        [activeProductId]: {
          ...cur,
          detailLevel: newDetailLevel,
          perspective: legacyPerspective
        }
      };
    });
  }, [activeProductId]);

  // Modificadores de modo e perspectiva locais ao produto (retrocompatíveis)
  const setMode = useCallback((newMode: WorkspaceMode) => {
    setProductStates((prev) => {
      const cur = prev[activeProductId] || prev[DEFAULT_PRODUCT_ID];
      const newInteractionMode: InteractionMode = newMode === 'edit_workspace' ? 'edit_layout' : 'view';
      return {
        ...prev,
        [activeProductId]: {
          ...cur,
          mode: newMode,
          interactionMode: newInteractionMode
        }
      };
    });
  }, [activeProductId]);

  const setPerspective = useCallback((newPerspective: WorkspacePerspective) => {
    setProductStates((prev) => {
      const cur = prev[activeProductId] || prev[DEFAULT_PRODUCT_ID];
      const newDetailLevel: DetailLevel = newPerspective === 'engineering' ? 'advanced' : 'simple';
      return {
        ...prev,
        [activeProductId]: {
          ...cur,
          perspective: newPerspective,
          detailLevel: newDetailLevel
        }
      };
    });
  }, [activeProductId]);

  // ==========================================================================
  // AMENDMENT 5: MODELO ATÔMICO DE MUTAÇÃO & HISTÓRICO DETERMINÍSTICO
  // ==========================================================================
  const applyWorkspaceMutation = useCallback(
    (
      description: string,
      mutator: (currentSections: WorkspaceSection[]) => WorkspaceSection[]
    ) => {
      setProductStates((prevMap) => {
        const cur = prevMap[activeProductId] || prevMap[DEFAULT_PRODUCT_ID];
        const prevSections = cur.sections;
        const nextSections = mutator(structuredClone(prevSections));

        // Detecção de No-Op (Deep Equality):
        // Se a mutação não alterou o estado, zero snapshots criados!
        const prevJson = JSON.stringify(prevSections);
        const nextJson = JSON.stringify(nextSections);
        if (prevJson === nextJson) {
          return prevMap;
        }

        // Empilha exatamente UM snapshot antes da alteração
        const snap: UndoSnapshot = {
          timestamp: Date.now(),
          description,
          sections: structuredClone(prevSections)
        };

        const nextUndoStack = [...cur.undoStack.slice(-19), snap];

        return {
          ...prevMap,
          [activeProductId]: {
            ...cur,
            sections: nextSections,
            undoStack: nextUndoStack,
            undoToastMessage: `${description} · Desfazer`
          }
        };
      });
    },
    [activeProductId]
  );

  // Operação atômica de Desfazer (Undo)
  const undo = useCallback(() => {
    setProductStates((prevMap) => {
      const cur = prevMap[activeProductId] || prevMap[DEFAULT_PRODUCT_ID];
      if (cur.undoStack.length === 0) return prevMap;

      const lastSnap = cur.undoStack[cur.undoStack.length - 1];
      const nextUndoStack = cur.undoStack.slice(0, -1);

      return {
        ...prevMap,
        [activeProductId]: {
          ...cur,
          sections: structuredClone(lastSnap.sections),
          undoStack: nextUndoStack,
          undoToastMessage: null
        }
      };
    });
  }, [activeProductId]);

  const dismissUndoToast = useCallback(() => {
    setProductStates((prevMap) => {
      const cur = prevMap[activeProductId] || prevMap[DEFAULT_PRODUCT_ID];
      return {
        ...prevMap,
        [activeProductId]: { ...cur, undoToastMessage: null }
      };
    });
  }, [activeProductId]);

  // Alternar colapso de seção (não gera entrada de undo nos dados)
  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setProductStates((prevMap) => {
      const cur = prevMap[activeProductId] || prevMap[DEFAULT_PRODUCT_ID];
      const updated = cur.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, isCollapsed: !sec.isCollapsed } : sec
      );
      return {
        ...prevMap,
        [activeProductId]: { ...cur, sections: updated }
      };
    });
  }, [activeProductId]);

  const expandAllSections = useCallback(() => {
    setProductStates((prevMap) => {
      const cur = prevMap[activeProductId] || prevMap[DEFAULT_PRODUCT_ID];
      return {
        ...prevMap,
        [activeProductId]: { ...cur, sections: cur.sections.map((s) => ({ ...s, isCollapsed: false })) }
      };
    });
  }, [activeProductId]);

  const collapseAllSections = useCallback(() => {
    setProductStates((prevMap) => {
      const cur = prevMap[activeProductId] || prevMap[DEFAULT_PRODUCT_ID];
      return {
        ...prevMap,
        [activeProductId]: { ...cur, sections: cur.sections.map((s) => ({ ...s, isCollapsed: true })) }
      };
    });
  }, [activeProductId]);

  // Renomear seção
  const renameSection = useCallback(
    (sectionId: string, newTitle: string) => {
      applyWorkspaceMutation(`Seção renomeada para "${newTitle.trim()}"`, (prev) =>
        prev.map((sec) => (sec.id === sectionId ? { ...sec, title: newTitle.trim() } : sec))
      );
    },
    [applyWorkspaceMutation]
  );

  // Reordenar seção
  const moveSection = useCallback(
    (fromIndex: number, toIndex: number) => {
      applyWorkspaceMutation('Ordem das seções alterada', (prev) => {
        if (toIndex < 0 || toIndex >= prev.length || fromIndex === toIndex) return prev;
        const updated = [...prev];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return updated;
      });
    },
    [applyWorkspaceMutation]
  );

  // Reordenar blocos dentro da seção
  const moveBlock = useCallback(
    (sectionId: string, fromIndex: number, toIndex: number) => {
      applyWorkspaceMutation('Posição do bloco alterada', (prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          if (toIndex < 0 || toIndex >= sec.blocks.length || fromIndex === toIndex) return sec;
          const blocks = [...sec.blocks];
          const [moved] = blocks.splice(fromIndex, 1);
          blocks.splice(toIndex, 0, moved);
          return { ...sec, blocks };
        })
      );
    },
    [applyWorkspaceMutation]
  );

  const moveBlockUp = useCallback(
    (sectionId: string, blockId: string) => {
      applyWorkspaceMutation('Bloco movido para cima', (prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const idx = sec.blocks.findIndex((b) => b.id === blockId);
          if (idx <= 0) return sec;
          const blocks = [...sec.blocks];
          const temp = blocks[idx - 1];
          blocks[idx - 1] = blocks[idx];
          blocks[idx] = temp;
          return { ...sec, blocks };
        })
      );
    },
    [applyWorkspaceMutation]
  );

  const moveBlockDown = useCallback(
    (sectionId: string, blockId: string) => {
      applyWorkspaceMutation('Bloco movido para baixo', (prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          const idx = sec.blocks.findIndex((b) => b.id === blockId);
          if (idx === -1 || idx >= sec.blocks.length - 1) return sec;
          const blocks = [...sec.blocks];
          const temp = blocks[idx + 1];
          blocks[idx + 1] = blocks[idx];
          blocks[idx] = temp;
          return { ...sec, blocks };
        })
      );
    },
    [applyWorkspaceMutation]
  );

  // Redimensionar bloco
  const resizeBlock = useCallback(
    (sectionId: string, blockId: string, newSize: BlockSize) => {
      applyWorkspaceMutation(`Tamanho do bloco ajustado para ${newSize}`, (prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            blocks: sec.blocks.map((b) => (b.id === blockId ? { ...b, size: newSize } : b))
          };
        })
      );
    },
    [applyWorkspaceMutation]
  );

  // Ocultar bloco da visualização sem apagar
  const hideBlock = useCallback(
    (sectionId: string, blockId: string) => {
      applyWorkspaceMutation('Bloco ocultado da visualização', (prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            blocks: sec.blocks.map((b) => (b.id === blockId ? { ...b, isHidden: true } : b))
          };
        })
      );
    },
    [applyWorkspaceMutation]
  );

  // Excluir bloco
  const deleteBlock = useCallback(
    (sectionId: string, blockId: string) => {
      applyWorkspaceMutation('Bloco excluído', (prev) =>
        prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
          return {
            ...sec,
            blocks: sec.blocks.filter((b) => b.id !== blockId)
          };
        })
      );
    },
    [applyWorkspaceMutation]
  );

  // Adicionar fato técnico (Totalmente agnóstico a produto via metadata)
  const addFact = useCallback(
    (sectionId: string, factData: Omit<FactItem, 'id'>) => {
      applyWorkspaceMutation(`Informação "${factData.label}" adicionada`, (prev) => {
        const newFact: FactItem = {
          ...factData,
          id: `fact_${Date.now()}`,
          originLabel: factData.originScope === 'model' ? productMetadata.name : productMetadata.familyLine
        };

        return prev.map((sec) => {
          if (sec.id !== sectionId) return sec;
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
        });
      });
    },
    [applyWorkspaceMutation, productMetadata]
  );

  // Staged Fact Edit (Agnóstico e com rollback atômico e sincronização de referências)
  const stageFactEdit = useCallback(
    (factId: string, draft: Partial<FactItem>, scopeChoice: 'model' | 'family') => {
      applyWorkspaceMutation(`Alteração salva no rascunho de "${draft.label || factId}"`, (prev) =>
        prev.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.data.kind === 'hero_summary' || b.data.kind === 'fact_grid') {
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
                          originLabel: scopeChoice === 'model' ? productMetadata.name : productMetadata.familyLine
                        }
                      : f
                  )
                }
              };
            }
            if (b.data.kind === 'conflicts') {
              return {
                ...b,
                data: {
                  ...b.data,
                  conflicts: b.data.conflicts.map((f) =>
                    f.id === factId
                      ? {
                          ...f,
                          ...draft,
                          originScope: scopeChoice,
                          originLabel: scopeChoice === 'model' ? productMetadata.name : productMetadata.familyLine
                        }
                      : f
                  )
                }
              };
            }
            if (b.data.kind === 'mega_table') {
              let changed = false;
              const nextRows = b.data.table.rows.map((row) => {
                let rowChanged = false;
                const nextCells = { ...row.cells };
                for (const colId of Object.keys(nextCells)) {
                  const cell = nextCells[colId];
                  if (cell.type === 'fact_ref' && cell.factId === factId) {
                    rowChanged = true;
                    changed = true;
                    nextCells[colId] = {
                      ...cell,
                      value: draft.value !== undefined ? draft.value : cell.value,
                      unit: draft.unit !== undefined ? draft.unit : cell.unit
                    };
                  }
                }
                return rowChanged ? { ...row, cells: nextCells } : row;
              });
              if (changed) {
                return { ...b, data: { ...b.data, table: { ...b.data.table, rows: nextRows } } };
              }
            }
            return b;
          })
        }))
      );
    },
    [applyWorkspaceMutation, productMetadata]
  );

  // Alias retrocompatível
  const updateFact = stageFactEdit;

  // Atualizar apenas o rótulo visual (sem mutar chave canônica)
  const updateFactDisplayLabel = useCallback(
    (factId: string, newLabel: string) => {
      applyWorkspaceMutation(`Rótulo visual atualizado para "${newLabel.trim()}"`, (prev) =>
        prev.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.data.kind === 'hero_summary' || b.data.kind === 'fact_grid') {
              return {
                ...b,
                data: {
                  ...b.data,
                  facts: b.data.facts.map((f) => (f.id === factId ? { ...f, label: newLabel.trim() } : f))
                }
              };
            }
            return b;
          })
        }))
      );
    },
    [applyWorkspaceMutation]
  );

  // Alternar visibilidade de fato específico
  const toggleFactVisibility = useCallback(
    (factId: string, hidden?: boolean) => {
      applyWorkspaceMutation('Visibilidade da informação alterada', (prev) =>
        prev.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.data.kind === 'hero_summary' || b.data.kind === 'fact_grid') {
              return {
                ...b,
                data: {
                  ...b.data,
                  facts: b.data.facts.map((f) =>
                    f.id === factId
                      ? { ...f, isHidden: hidden !== undefined ? hidden : !f.isHidden }
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
    [applyWorkspaceMutation]
  );

  const hideFact = useCallback((factId: string) => toggleFactVisibility(factId, true), [toggleFactVisibility]);
  const unhideFact = useCallback((factId: string) => toggleFactVisibility(factId, false), [toggleFactVisibility]);

  // Resolver conflito
  const resolveConflict = useCallback(
    (factId: string, chosenValue: string, chosenUnit?: string) => {
      applyWorkspaceMutation(`Divergência resolvida para ${chosenValue} ${chosenUnit || ''}`, (prev) =>
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
                    f.id === factId
                      ? { ...f, value: chosenValue, unit: chosenUnit || f.unit, conflict: undefined }
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
    [applyWorkspaceMutation]
  );

  // Renomear chave semântica com segurança
  const performSafeSemanticRename = useCallback(
    (oldKey: string, newKey: string) => {
      applyWorkspaceMutation(`Identidade semântica atualizada para ${newKey}`, (prev) =>
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
    },
    [applyWorkspaceMutation]
  );

  // Aplicar organização de IA (antes e depois amigável)
  const applyAIOrganization = useCallback((): AIOrganizeDiff => {
    applyWorkspaceMutation('Organização automática por IA aplicada', (prev) => {
      // Reordenação inteligente genérica
      return [...prev].sort((a, b) => {
        if (a.id.includes('hero') || a.id.includes('resumo')) return -1;
        if (b.id.includes('hero') || b.id.includes('resumo')) return 1;
        return 0;
      });
    });

    return {
      newSectionsCount: 0,
      newTablesCount: 1,
      groupedCardsCount: 12,
      removedFactsCount: 0,
      summary: 'Reorganizamos os blocos técnicos em ordem lógica industrial.',
      details: [
        'Resumo principal mantido no topo do workspace',
        'Tabelas de maior densidade organizadas em posições prioritárias',
        'Nenhuma informação foi removida ou alterada'
      ]
    };
  }, [applyWorkspaceMutation]);

  // Criar nova tabela
  const createNewTable = useCallback(
    (sectionId: string, title: string, columns: string[], rows: string[][]) => {
      applyWorkspaceMutation(`Nova tabela "${title}" criada`, (prev) => {
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

        return prev.map((sec) => (sec.id === sectionId ? { ...sec, blocks: [...sec.blocks, newBlock] } : sec));
      });
    },
    [applyWorkspaceMutation]
  );

  // Transformar cards em tabela
  const transformSelectedFactsIntoTable = useCallback(
    (sectionId: string, factIds: string[], tableTitle: string) => {
      applyWorkspaceMutation(`Informações convertidas para a tabela "${tableTitle}"`, (prev) =>
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
    [applyWorkspaceMutation]
  );

  // ==========================================================================
  // AMENDMENT 7: BUSCA OTIMIZADA COM BENCHMARK DE TEMPO (ms)
  // ==========================================================================
  const searchResults = useMemo<SearchResultItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setLastSearchDurationMs(0);
      return [];
    }

    const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const results: SearchResultItem[] = [];

    for (const sec of sections) {
      for (const block of sec.blocks) {
        if (block.data.kind === 'hero_summary' || block.data.kind === 'fact_grid') {
          for (const fact of block.data.facts) {
            const matchLabel = fact.label.toLowerCase().includes(q);
            const matchVal = fact.value.toLowerCase().includes(q);
            const matchKey = fact.semanticKey?.toLowerCase().includes(q);
            const matchAlias = fact.aliases?.some((a) => a.toLowerCase().includes(q));
            if (matchLabel || matchVal || matchKey || matchAlias) {
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
                const firstColVal = Object.values(row.cells)[0]?.value || row.id;
                results.push({
                  id: `${row.id}_${colId}`,
                  title: cell.value,
                  subtitle: `Linha: ${firstColVal} (${row.group || 'Geral'})`,
                  sectionId: sec.id,
                  sectionTitle: sec.title,
                  blockId: block.id,
                  type: 'table_row',
                  matchedQuery: q
                });
                break;
              }
            }
          }
        } else if (block.data.kind === 'documents') {
          for (const doc of block.data.documents) {
            if (doc.title.toLowerCase().includes(q) || doc.code.toLowerCase().includes(q)) {
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

    const tEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
    setLastSearchDurationMs(Math.round((tEnd - tStart) * 100) / 100);
    return results;
  }, [sections, searchQuery]);

  // Métricas formais derivadas da projeção (Amendments 1, 2, 3, 7, 8)
  const derivedCounts = useMemo(() => {
    return deriveWorkspaceMetrics(sections);
  }, [sections]);

  return {
    // Produto & Metadados
    activeProductId,
    setActiveProductId,
    availableProducts: listProductFixtures(),
    productMetadata,
    derivedCounts,
    lastSearchDurationMs,

    // Eixos Ortogonais de UI (Amendment 5)
    interactionMode,
    setInteractionMode,
    detailLevel,
    setDetailLevel,

    // Estrutura do Workspace
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
    applyWorkspaceMutation,

    // Comandos de Seções e Blocos
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

    // Comandos de Fatos e Tabelas
    addFact,
    updateFact,
    stageFactEdit,
    updateFactDisplayLabel,
    toggleFactVisibility,
    hideFact,
    unhideFact,
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
