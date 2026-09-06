import type { Catalog } from './catalog.schema';
import { adaptLegacyBlockToTableCore } from './table-core/legacy-table.adapter';
import type {
  TableCellBoundContent,
  TableDatumResolutionResult,
  TableDatumResolver
} from './table-core';

export type PublicationDocumentKind = 'catalog' | 'template';

export interface PublicationExportSnapshot {
  readonly sourceKind: PublicationDocumentKind;
  readonly sourceId: string;
  readonly version: number;
  readonly identity: string;
  readonly document: Catalog;
}

export type PublicationSnapshotResult =
  | { success: true; snapshot: PublicationExportSnapshot }
  | { success: false; error: string };

export type PublicationVersionParseResult =
  | { success: true; version: number }
  | { success: false; error: string };

export function parseRequiredPublicationVersion(rawVersion: string | null): PublicationVersionParseResult {
  if (rawVersion === null || rawVersion.trim() === '') {
    return {
      success: false,
      error: 'Versão obrigatória ausente na rota de impressão. A exportação foi bloqueada.'
    };
  }

  if (!/^\d+$/.test(rawVersion)) {
    return {
      success: false,
      error: `Versão de impressão inválida: "${rawVersion}".`
    };
  }

  const version = Number(rawVersion);
  if (!Number.isSafeInteger(version) || version < 1) {
    return {
      success: false,
      error: `Versão de impressão inválida: "${rawVersion}".`
    };
  }

  return { success: true, version };
}

export function createPublicationExportSnapshot(params: {
  sourceKind: PublicationDocumentKind;
  sourceId: string;
  document: Catalog;
  expectedVersion: number;
}): PublicationSnapshotResult {
  const { sourceKind, sourceId, document, expectedVersion } = params;
  const loadedVersion = document.version;

  if (!sourceId) {
    return { success: false, error: 'Identificador do documento ausente para exportação.' };
  }

  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return { success: false, error: `Versão confirmada inválida para exportação: ${expectedVersion}.` };
  }

  if (!Number.isSafeInteger(loadedVersion) || loadedVersion < 1) {
    return { success: false, error: 'O documento carregado não possui uma versão válida para exportação.' };
  }

  if (loadedVersion !== expectedVersion) {
    return {
      success: false,
      error: `Versão solicitada v${expectedVersion} não corresponde à versão carregada v${loadedVersion}. A exportação foi bloqueada.`
    };
  }

  if (sourceKind === 'catalog' && document.id !== sourceId) {
    return {
      success: false,
      error: `O catálogo carregado (${document.id}) não corresponde ao catálogo solicitado (${sourceId}).`
    };
  }

  const clonedDocument = structuredClone(document);
  return {
    success: true,
    snapshot: {
      sourceKind,
      sourceId,
      version: expectedVersion,
      identity: `${sourceKind}:${sourceId}:v${expectedVersion}`,
      document: clonedDocument
    }
  };
}

function publicationDatumReferenceKey(reference: TableCellBoundContent): string {
  return JSON.stringify(reference);
}

/**
 * Materializa a verdade factual usada na publicação antes do preflight.
 * O resolver retornado é cache-only: qualquer referência que não existia no
 * snapshot no momento da materialização falha fechada em vez de consultar o
 * runtime mutável depois da auditoria.
 */
export function createPinnedPublicationDatumResolver(params: {
  document: Catalog;
  sourceResolver: TableDatumResolver;
}): TableDatumResolver {
  const { document, sourceResolver } = params;
  const pinned = new Map<string, TableDatumResolutionResult | undefined>();

  const pinReference = (reference: TableCellBoundContent) => {
    const key = publicationDatumReferenceKey(reference);
    if (pinned.has(key)) return;
    const resolved = sourceResolver(reference);
    pinned.set(key, resolved ? structuredClone(resolved) : undefined);
  };

  for (const page of document.pages || []) {
    for (const block of page.blocks || []) {
      for (const row of block.tableRows || []) {
        for (const binding of Object.values(row.cellBindings || {})) {
          pinReference({
            kind: 'datum_reference',
            productId: binding.productId,
            datumKey: binding.semanticKey,
            moduleKey: binding.moduleKey,
            datasetId: binding.datasetId,
            sourceRevision: binding.sourceRevision,
            bindingMode: binding.bindingMode,
            snapshot: binding.snapshot
          } as TableCellBoundContent);
        }
      }

      const adapted = adaptLegacyBlockToTableCore(block);
      if (!adapted.supported) continue;

      for (const cell of Object.values(adapted.table.cells)) {
        if (cell.content.kind === 'datum_reference') {
          pinReference(cell.content);
        }
      }
    }
  }

  return (reference) => {
    const key = publicationDatumReferenceKey(reference);
    return pinned.has(key) ? pinned.get(key) : undefined;
  };
}
