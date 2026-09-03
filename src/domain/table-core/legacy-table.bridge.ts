// src/domain/table-core/legacy-table.bridge.ts
// Ponte de Coordenação e Execução de Comandos entre Table Core V2 e ContentBlock Legado (Fase CORE.T2C.1).
// Mapeia coordenadas semânticas puras sem parsing/reverse-engineering de strings.
// Totalmente desacoplado de React e Zustand.
// Zero explicit any.

import { TableCellContent } from './table.types';
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
  originalOverrideValue?: string;
}

/**
 * Contrato puro de Bridge que detém todo o conhecimento de coordenadas entre TableCore e Legado.
 * Permite lookups O(1) imediatos sem string hacking nem heurísticas frágeis.
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
 * Constrói a Bridge de coordenadas a partir do bloco legado e do TableCoreModel gerado.
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
  const legacyCoordKeyMap: Record<string, LegacyCellCoordinateMapping> = {};

  for (const mapping of cellMappings) {
    cellMap[mapping.cellId] = mapping;
    rowMap[mapping.rowId] = mapping.legacyRowId;
    columnMap[mapping.columnId] = mapping.legacyColKey;
    coordKeyMap[`${mapping.rowId}:${mapping.columnId}`] = mapping;
    legacyCoordKeyMap[`${mapping.legacyRowId}:${mapping.legacyColKey}`] = mapping;
  }

  return {
    blockId: block.id,
    tableId,
    cellMap,
    rowMap,
    columnMap,
    getByCellId: (cellId: string) => cellMap[cellId],
    getByCoordinates: (rowId: string, columnId: string) => coordKeyMap[`${rowId}:${columnId}`],
    getByLegacyCoordinates: (legacyRowId: string, legacyColKey: string) => legacyCoordKeyMap[`${legacyRowId}:${legacyColKey}`]
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

  // 3. Roteamento discriminado de comandos suportados pelo piloto
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

      // Extrai o valor literal da célula
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

      // Dispara a mutação legítima do store legado
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

    case 'TABLE_RESTORE_CELL': {
      const mapping = context.bridge.getByCoordinates(command.rowId, command.columnId);
      if (!mapping) {
        return {
          success: false,
          errorCode: 'CELL_NOT_FOUND',
          error: `Célula não encontrada na bridge para coordenadas rowId="${command.rowId}", columnId="${command.columnId}".`
        };
      }

      // Dispara o restore legítimo no store legado
      context.onRestoreOverride(mapping.legacyRowId, mapping.legacyColKey);

      return {
        success: true,
        summary: `Célula [row=${mapping.legacyRowId}, col=${mapping.legacyColKey}] restaurada para o padrão da biblioteca`,
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
