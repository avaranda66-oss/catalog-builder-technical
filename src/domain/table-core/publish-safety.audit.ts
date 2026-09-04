// src/domain/table-core/publish-safety.audit.ts
// Auditoria de segurança de publicação em 3 camadas (Emenda 16).
// Zero dependência de Supabase.
// Camada A: Auditoria Estática de Catálogo
// Camada B: Auditoria de Resolução PIM/Workbook
// Camada C: Gate Global de Sincronização do Store

import { Catalog, ContentBlock } from '../catalog.schema';
import { TableDatumResolver } from './table-datum-resolver.types';

export type PublishSafetySeverity = 'block' | 'warn';

export interface PublishSafetyIssue {
  readonly layer: 'A_STATIC' | 'B_RESOLUTION' | 'C_GATE';
  readonly severity: PublishSafetySeverity;
  readonly pageNumber?: number;
  readonly pageId?: string;
  readonly tableId?: string;
  readonly tableTitle?: string;
  readonly rowId?: string;
  readonly colKey?: string;
  readonly code: string;
  readonly reason: string;
}

export interface PublishSafetyAuditReport {
  readonly canPublish: boolean;
  readonly blockCount: number;
  readonly warnCount: number;
  readonly issues: readonly PublishSafetyIssue[];
}

export interface PublishSafetyAuditContext {
  readonly catalog: Catalog;
  readonly syncStatus?: 'idle' | 'saving' | 'synced' | 'conflict' | 'error' | 'dirty' | string;
  readonly resolveDatum?: TableDatumResolver;
}

/**
 * Executa auditoria rigorosa de segurança de publicação em 3 camadas.
 * Regras de Bloqueio (BLOCK):
 * - Layer C: Conflito global de sincronização (syncStatus === 'conflict')
 * - Layer A: Binding malformado ou corrompido
 * - Layer A/B: review_required sem snapshot
 * - Layer B: Dado técnico em conflito (conflict)
 * - Layer B: Fonte ausente em live binding sem snapshot (source_missing)
 * 
 * Regras de Alerta (WARN):
 * - review_required com snapshot existente
 * - live source_missing com fallback para snapshot existente
 * - dado deprecado / stale
 */
export function auditCatalogPublishSafety(context: PublishSafetyAuditContext): PublishSafetyAuditReport {
  const issues: PublishSafetyIssue[] = [];
  const { catalog, syncStatus, resolveDatum } = context;

  // =========================================================================
  // CAMADA C: GLOBAL STORE GATE
  // =========================================================================
  if (syncStatus === 'conflict') {
    issues.push({
      layer: 'C_GATE',
      severity: 'block',
      code: 'STORE_SYNC_CONFLICT',
      reason: 'O documento possui conflito não resolvido com o servidor. A exportação está bloqueada para prevenir perda de dados.'
    });
  }

  // =========================================================================
  // CAMADA A: STATIC CATALOG AUDIT & CAMADA B: RESOLUTION AUDIT
  // =========================================================================
  catalog.pages.forEach((page) => {
    const pageNumber = page.pageNumber;
    const tableBlocks = (page.blocks || []).filter(
      (b): b is ContentBlock =>
        b.type === 'specs_table' ||
        b.type === 'table' ||
        b.type === 'custom_table' ||
        Boolean(b.tableRows && b.tableRows.length > 0)
    );

    tableBlocks.forEach((block) => {
      const tableId = block.id;
      const tableTitle = block.title || 'Tabela Sem Título';
      const rows = block.tableRows || [];
      const columns = block.tableColumns || [];

      // Validação estática de chaves de coluna
      const seenColKeys = new Set<string>();
      columns.forEach((col) => {
        if (!col.key || col.key.trim() === '') {
          issues.push({
            layer: 'A_STATIC',
            severity: 'block',
            pageNumber,
            pageId: page.id,
            tableId,
            tableTitle,
            code: 'MALFORMED_COLUMN_KEY',
            reason: 'Coluna com chave vazia encontrada na tabela.'
          });
        } else if (seenColKeys.has(col.key)) {
          issues.push({
            layer: 'A_STATIC',
            severity: 'block',
            pageNumber,
            pageId: page.id,
            tableId,
            tableTitle,
            colKey: col.key,
            code: 'DUPLICATE_COLUMN_KEY',
            reason: `Chave de coluna duplicada encontrada: "${col.key}".`
          });
        } else {
          seenColKeys.add(col.key);
        }
      });

      // Validação de linhas e células
      const seenRowIds = new Set<string>();
      rows.forEach((row) => {
        if (!row.id || row.id.trim() === '') {
          issues.push({
            layer: 'A_STATIC',
            severity: 'block',
            pageNumber,
            pageId: page.id,
            tableId,
            tableTitle,
            code: 'MALFORMED_ROW_ID',
            reason: 'Linha com ID vazio encontrada na tabela.'
          });
        } else if (seenRowIds.has(row.id)) {
          issues.push({
            layer: 'A_STATIC',
            severity: 'block',
            pageNumber,
            pageId: page.id,
            tableId,
            tableTitle,
            rowId: row.id,
            code: 'DUPLICATE_ROW_ID',
            reason: `Linha com ID duplicado encontrada: "${row.id}".`
          });
        } else {
          seenRowIds.add(row.id);
        }

        // Validação estática de bindings das células
        if (row.cellBindings) {
          for (const [colKey, binding] of Object.entries(row.cellBindings)) {
            // A.1: Binding Malformado
            if (!binding.productId || binding.productId.trim() === '') {
              issues.push({
                layer: 'A_STATIC',
                severity: 'block',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'MALFORMED_BINDING_PRODUCT_ID',
                reason: `Binding na célula [${row.id}, ${colKey}] não possui productId válido.`
              });
            }
            if (!binding.semanticKey || binding.semanticKey.trim() === '') {
              issues.push({
                layer: 'A_STATIC',
                severity: 'block',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'MALFORMED_BINDING_SEMANTIC_KEY',
                reason: `Binding na célula [${row.id}, ${colKey}] não possui semanticKey válida.`
              });
            }

            // A.1b: Snapshot Mode sem snapshot -> BLOCK
            if (binding.bindingMode === 'snapshot' && !binding.snapshot) {
              issues.push({
                layer: 'A_STATIC',
                severity: 'block',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'SNAPSHOT_MODE_WITHOUT_SNAPSHOT',
                reason: `Célula com modo "snapshot" não possui snapshot tipado persistido.`
              });
            }

            // A.1c: Dataset binding sem datasetId -> BLOCK
            if (binding.sourceKind === 'dataset' && (!binding.datasetId || binding.datasetId.trim() === '')) {
              issues.push({
                layer: 'A_STATIC',
                severity: 'block',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'DATASET_BINDING_MISSING_DATASET_ID',
                reason: `Binding de dataset na célula [${row.id}, ${colKey}] não possui datasetId válido.`
              });
            }

            // A.2: review_required sem snapshot -> BLOCK
            if (binding.bindingMode === 'review_required' && !binding.snapshot) {
              issues.push({
                layer: 'A_STATIC',
                severity: 'block',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'REVIEW_REQUIRED_WITHOUT_SNAPSHOT',
                reason: `Célula requer revisão sem snapshot anterior para congelar o valor.`
              });
            }

            // A.3: review_required com snapshot -> WARN
            if (binding.bindingMode === 'review_required' && binding.snapshot) {
              issues.push({
                layer: 'A_STATIC',
                severity: 'warn',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'REVIEW_REQUIRED_WITH_SNAPSHOT',
                reason: `Célula com revisão pendente; será exportado o snapshot anterior congelado.`
              });
            }

            // A.4: Stale persistido
            if (binding.stale) {
              issues.push({
                layer: 'A_STATIC',
                severity: 'warn',
                pageNumber,
                pageId: page.id,
                tableId,
                tableTitle,
                rowId: row.id,
                colKey,
                code: 'STALE_BINDING_PERSISTED',
                reason: `Célula marcada com dado obsoleto/stale.`
              });
            }

            // =========================================================================
            // CAMADA B: RESOLUTION AUDIT (Se houver resolver disponível)
            // =========================================================================
            if (resolveDatum) {
              const res = resolveDatum({
                kind: 'datum_reference',
                productId: binding.productId,
                datumKey: binding.semanticKey,
                moduleKey: binding.moduleKey,
                datasetId: binding.datasetId,
                sourceRevision: binding.sourceRevision,
                bindingMode: binding.bindingMode === 'snapshot' ? 'snapshot' : (binding.bindingMode as any),
                snapshot: binding.snapshot
              });

              if (res) {
                // B.1: Conflito de dados técnicos -> BLOCK
                if (res.status === 'conflict') {
                  issues.push({
                    layer: 'B_RESOLUTION',
                    severity: 'block',
                    pageNumber,
                    pageId: page.id,
                    tableId,
                    tableTitle,
                    rowId: row.id,
                    colKey,
                    code: 'CONFLICT_TECHNICAL_DATUM',
                    reason: `Dado técnico em conflito na fonte (${binding.semanticKey}): ${res.diagnostic?.message || 'Conflito de resolução'}.`
                  });
                }

                // B.2: Live source missing sem snapshot -> BLOCK
                if (binding.bindingMode === 'live' && res.status === 'unknown' && !binding.snapshot) {
                  issues.push({
                    layer: 'B_RESOLUTION',
                    severity: 'block',
                    pageNumber,
                    pageId: page.id,
                    tableId,
                    tableTitle,
                    rowId: row.id,
                    colKey,
                    code: 'SOURCE_MISSING_WITHOUT_SNAPSHOT',
                    reason: `Fonte indisponível para dado em tempo real sem snapshot de contingência (${binding.semanticKey}).`
                  });
                }

                // B.3: Live source missing com snapshot -> WARN
                if (binding.bindingMode === 'live' && res.status === 'unknown' && binding.snapshot) {
                  issues.push({
                    layer: 'B_RESOLUTION',
                    severity: 'warn',
                    pageNumber,
                    pageId: page.id,
                    tableId,
                    tableTitle,
                    rowId: row.id,
                    colKey,
                    code: 'SOURCE_MISSING_WITH_SNAPSHOT_FALLBACK',
                    reason: `Fonte indisponível (${binding.semanticKey}); utilizando snapshot existente como fallback.`
                  });
                }
              }
            }
          }
        }
      });
    });
  });

  const blockCount = issues.filter((i) => i.severity === 'block').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;

  return {
    canPublish: blockCount === 0,
    blockCount,
    warnCount,
    issues
  };
}
