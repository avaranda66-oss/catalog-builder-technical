// src/domain/table-core/legacy-table.bridge.ts
// Ponte de Coordenação e Execução de Comandos entre Table Core V2 e ContentBlock Legado (Fases CORE.T2C.1 e CORE.T2C.2).
// Mapeia coordenadas semânticas puras com segurança contra colisão de delimitadores (Collision-Safe).
// Totalmente desacoplado de React e Zustand.
// Zero explicit any.

import { TableCellBoundContent, TableCellContent, getCellKey } from './table.types';
import { ContentBlock } from '../catalog.schema';
import { TableCommandSchema } from '../document-commands/table-commands.types';
import { CommandResult } from '../document-commands/command.types';

/**
 * Mapeamento bidirecional explícito de uma célula entre TableCore e o modelo legado.
 */
export interface LegacyCellCoordinateMapping {
  cellId: string;
  rowId: string;
  columnId: string;
  legacyBlockId: string;
  legacyRowId: string;
  legacyColKey: string;
  content: TableCellContent;
  isOverride: boolean;
  hasProductBinding: boolean;
  productRefId?: string;
  canonicalBoundContent?: TableCellBoundContent;
  originalOverrideValue?: string;
}

/**
 * Contrato puro de Bridge que detém todo o conhecimento de coordenadas entre TableCore e Legado.
 * Implementa segurança estrita contra colisão de delimitadores através de getCellKey() e Map aninhado.
 */
export interface LegacyTableCoordinateBridge {
  blockId: string;
  tableId: string;
  cellMap: Record<string, LegacyCellCoordinateMapping>;
  rowMap: Record<string, string>; // rowId -> legacyRowId
  columnMap: Record<string, string>; // columnId -> legacyColKey
  getByCellId: (cellId: string) => LegacyCellCoordinateMapping | undefined;
  getByCoordinates: (rowId: string, columnId: string) => LegacyCellCoordinateMapping | undefined;
  getByLegacyCoordinates: (legacyRowId: string, legacyColKey: string) => LegacyCellCoordinateMapping | undefined;
}

/**
 * Constrói a Bridge de coordenadas a partir do bloco legado e das células mapeadas.
 * - Coordenadas TableCore: indexadas via getCellKey(rowId, columnId) length-prefixed.
 * - Coordenadas legadas: indexadas via Map<legacyRowId, Map<legacyColKey, mapping>> aninhado sem concatenação de strings.
 */
export function buildLegacyTableCoordinateBridge(
  block: ContentBlock,
  tableId: string,
  cellMappings: LegacyCellCoordinateMapping[]
): LegacyTableCoordinateBridge {
  const cellMap: Record<string, LegacyCellCoordinateMapping> = {};
  const rowMap: Record<string, string> = {};
  const columnMap: Record<string, string> = {};
  const coordKeyMap: Record<string, LegacyCellCoordinateMapping> = {};
  const legacyCoordMap = new Map<string, Map<string, LegacyCellCoordinateMapping>>();

  for (const mapping of cellMappings) {
    cellMap[mapping.cellId] = mapping;
    rowMap[mapping.rowId] = mapping.legacyRowId;
    columnMap[mapping.columnId] = mapping.legacyColKey;

    // Indexação TableCore canônica com prefixo de tamanho (length-prefixed)
    coordKeyMap[getCellKey(mapping.rowId, mapping.columnId)] = mapping;

    // Indexação legada via Maps aninhados (zero risco de delimiter collision em IDs contendo ':' ou '|')
    let rowMapEntry = legacyCoordMap.get(mapping.legacyRowId);
    if (!rowMapEntry) {
      rowMapEntry = new Map<string, LegacyCellCoordinateMapping>();
      legacyCoordMap.set(mapping.legacyRowId, rowMapEntry);
    }
    rowMapEntry.set(mapping.legacyColKey, mapping);
  }

  return {
    blockId: block.id,
    tableId,
    cellMap,
    rowMap,
    columnMap,
    getByCellId: (cellId: string) => cellMap[cellId],
    getByCoordinates: (rowId: string, columnId: string) => {
      try {
        return coordKeyMap[getCellKey(rowId, columnId)];
      } catch {
        return undefined;
      }
    },
    getByLegacyCoordinates: (legacyRowId: string, legacyColKey: string) => {
      return legacyCoordMap.get(legacyRowId)?.get(legacyColKey);
    }
  };
}

/**
 * Contexto necessário para executar um comando tipado de tabela sobre a autoridade legada.
 */
export interface LegacyBridgeCommandContext {
  block: ContentBlock;
  bridge: LegacyTableCoordinateBridge;
  onUpdateOverride: (rowId: string, colKey: string, value: string) => void;
  onRestoreOverride: (rowId: string, colKey: string) => void;
}

/**
 * Executa um Document Command tipado traduzindo-o estritamente para a mutation legítima do modelo legado.
 * Valida a entrada não-confiável com Zod estrito e assegura que nenhuma mutação fora de escopo ocorra.
 */
export function executeTableCommandOnLegacyBlock(
  commandInput: unknown,
  context: LegacyBridgeCommandContext
): CommandResult<{ affectedLegacyRowId: string; affectedLegacyColKey: string }> {
  // 1. Validação estrita de schema Zod
  const parseRes = TableCommandSchema.safeParse(commandInput);
  if (!parseRes.success) {
    return {
      success: false,
      errorCode: 'INVALID_COMMAND_PAYLOAD',
      error: `Payload do comando inválido: ${parseRes.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
    };
  }

  const command = parseRes.data;

  // 2. Validação de Alvo da Tabela (Target Mismatch)
  if (command.tableId !== context.bridge.tableId) {
    return {
      success: false,
      errorCode: 'TARGET_MISMATCH',
      error: `Comando direcionado à tabela "${command.tableId}", mas a bridge atual corresponde a "${context.bridge.tableId}".`
    };
  }

  // 3. Validação de Integridade do Bloco da Bridge vs Bloco de Execução (Security / Block Mismatch)
  if (context.block.id !== context.bridge.blockId) {
    return {
      success: false,
      errorCode: 'BLOCK_MISMATCH',
      error: `Bridge associada ao bloco "${context.bridge.blockId}", mas o contexto de execução fornecido é do bloco "${context.block.id}".`
    };
  }

  // 4. Roteamento discriminado de comandos suportados pelo piloto
  switch (command.type) {
    case 'TABLE_SET_CELL_CONTENT': {
      const mapping = context.bridge.getByCoordinates(command.rowId, command.columnId);
      if (!mapping) {
        return {
          success: false,
          errorCode: 'CELL_NOT_FOUND',
          error: `Célula não encontrada na bridge para coordenadas rowId="${command.rowId}", columnId="${command.columnId}".`
        };
      }

      // Valida integridade do mapping com o bloco alvo
      if (mapping.legacyBlockId !== context.block.id) {
        return {
          success: false,
          errorCode: 'BLOCK_MISMATCH',
          error: `Célula mapeada pertence ao bloco "${mapping.legacyBlockId}", divergente do bloco atual "${context.block.id}".`
        };
      }

      // CASO A: RESTORE VIA SET_CELL_CONTENT (Semântica Unificada BIND.B1)
      // Se o conteúdo for datum_reference, valida se corresponde exatamente ao binding canônico da célula
      if (command.content.kind === 'datum_reference') {
        if (!mapping.canonicalBoundContent) {
          return {
            success: false,
            errorCode: 'BINDING_MISMATCH',
            error: `Célula [row=${mapping.legacyRowId}, col=${mapping.legacyColKey}] não possui vínculo canônico com a biblioteca para restauração.`
          };
        }

        const expectedBinding = mapping.canonicalBoundContent;
        if (
          command.content.productId !== expectedBinding.productId ||
          command.content.datumKey !== expectedBinding.datumKey ||
          command.content.bindingMode !== expectedBinding.bindingMode
        ) {
          return {
            success: false,
            errorCode: 'BINDING_MISMATCH',
            error: `O datum_reference fornecido (productId="${command.content.productId}", datumKey="${command.content.datumKey}") não corresponde ao binding canônico da célula (productId="${expectedBinding.productId}", datumKey="${expectedBinding.datumKey}").`
          };
        }

        // Restauração autorizada: remove o override no store legado para voltar ao binding canônico
        context.onRestoreOverride(mapping.legacyRowId, mapping.legacyColKey);

        return {
          success: true,
          summary: `Célula [row=${mapping.legacyRowId}, col=${mapping.legacyColKey}] restaurada para o binding canônico da biblioteca`,
          data: {
            affectedLegacyRowId: mapping.legacyRowId,
            affectedLegacyColKey: mapping.legacyColKey
          }
        };
      }

      // CASO B: OVERRIDE LITERAL
      let textValue = '';
      if (command.content.kind === 'text') {
        textValue = command.content.text;
      } else if (command.content.kind === 'number') {
        textValue = String(command.content.value);
      } else if (command.content.kind === 'value_unit') {
        const prefix = command.content.qualifier ? `${command.content.qualifier} ` : '';
        textValue = `${prefix}${command.content.amount} ${command.content.unit}`.trim();
      } else if (command.content.kind === 'empty') {
        textValue = '';
      } else if (command.content.kind === 'badge') {
        textValue = command.content.label;
      } else {
        return {
          success: false,
          errorCode: 'UNSUPPORTED_CELL_CONTENT',
          error: `Tipo de conteúdo "${command.content.kind}" não pode ser persistido como override textual no modelo legado.`
        };
      }

      // Dispara a mutação legítima de override do store legado
      context.onUpdateOverride(mapping.legacyRowId, mapping.legacyColKey, textValue);

      return {
        success: true,
        summary: `Override da célula [row=${mapping.legacyRowId}, col=${mapping.legacyColKey}] atualizado para "${textValue}"`,
        data: {
          affectedLegacyRowId: mapping.legacyRowId,
          affectedLegacyColKey: mapping.legacyColKey
        }
      };
    }

    default:
      return {
        success: false,
        errorCode: 'UNSUPPORTED_LEGACY_COMMAND',
        error: `O comando "${command.type}" não é suportado pelo modelo legado de specs_table nesta fase piloto.`
      };
  }
}
