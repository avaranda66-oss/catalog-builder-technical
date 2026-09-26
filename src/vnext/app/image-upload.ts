import type { DocumentSession } from '../application';
import type { CellContent, CellContentPresentation } from '../domain/editorial-model';
import type { AssetLineageContext, AssetPersistenceBridge } from '../asset';
import type { VNextPersistenceRuntime } from '../persistence';
import { createInsertSpec } from './editor-defaults';

export type ImageUploadIntent = {
  readonly session: DocumentSession;
  readonly lineage: AssetLineageContext;
} & (
  | { readonly type: 'insert'; readonly pageId: string }
  | { readonly type: 'replace'; readonly objectId: string }
  | {
      readonly type: 'table-cell';
      readonly pageId: string;
      readonly objectId: string;
      readonly tableId: string;
      readonly cellId: string;
      readonly expectedContent: CellContent;
      readonly expectedContentPresentation?: CellContentPresentation;
      readonly fit: 'contain' | 'cover';
      readonly targetWidthU: number;
      readonly targetHeightU: number;
    }
);

export function imageUploadLineage(runtime: VNextPersistenceRuntime): AssetLineageContext {
  const snapshot = runtime.workspace.getSnapshot();
  return {
    authLineage: snapshot.binding.authLineage,
    authorityScopeId: snapshot.activeAuthorityScopeId,
    openSessionId: snapshot.binding.openSessionId,
    catalogId: snapshot.binding.kind === 'PERSISTED' ? snapshot.binding.catalogId : undefined,
  };
}

export function imageUploadErrorMessage(code: string): string {
  switch (code) {
    case 'UNSUPPORTED_MEDIA': return 'Formato não suportado. Escolha uma imagem PNG, JPEG ou WebP.';
    case 'INVALID_DIMENSIONS': return 'Não foi possível ler as dimensões da imagem. Escolha outra imagem.';
    case 'OFFLINE': return 'Sem conexão. Tente enviar a imagem novamente quando estiver conectado.';
    case 'STALE_RESULT': return 'Envio descartado: o catálogo, a sessão ou a página mudou. Selecione a imagem novamente.';
    case 'AMBIGUOUS_COMMIT_OUTCOME': return 'Não foi possível confirmar o envio. Tente novamente para verificar o resultado.';
    case 'UPLOAD_FAILED': return 'Não foi possível enviar a imagem. Tente novamente.';
    default: return 'Não foi possível concluir o envio da imagem. Tente novamente.';
  }
}

/** UI orchestration only. Durable bytes can remain orphaned after a stale/failed link. */
export async function uploadWorkspaceImage(input: {
  intent: ImageUploadIntent;
  file: Pick<File, 'name' | 'type' | 'arrayBuffer'>;
  runtime: VNextPersistenceRuntime;
  bridge: Pick<AssetPersistenceBridge, 'upload'>;
  getActivePageId(): string;
  isCurrent(): boolean;
}): Promise<{ message: string; objectId?: string }> {
  const { intent, runtime } = input;
  const current = () => {
    const lineage = imageUploadLineage(runtime);
    return input.isCurrent()
      && runtime.workspace.getSnapshot().session === intent.session
      && lineage.authLineage === intent.lineage.authLineage
      && lineage.authorityScopeId === intent.lineage.authorityScopeId
      && lineage.openSessionId === intent.lineage.openSessionId
      && lineage.catalogId === intent.lineage.catalogId
      && ((intent.type === 'replace') || (input.getActivePageId() === intent.pageId
        && intent.session.getSnapshot().document.pages.some((page) => page.id === intent.pageId)));
  };
  const stale = { message: imageUploadErrorMessage('STALE_RESULT') };
  try {
    if (!current()) return stale;
    const bytes = await input.file.arrayBuffer();
    if (!current()) return stale;
    const upload = await input.bridge.upload({ bytes, filename: input.file.name, mimeHint: input.file.type, context: intent.lineage });
    if (!current()) return stale;
    if (!upload.ok) return { message: imageUploadErrorMessage(upload.error.code) };
    const page = intent.type === 'insert'
      ? intent.session.getSnapshot().document.pages.find((candidate) => candidate.id === intent.pageId)
      : undefined;
    const spec = page ? createInsertSpec('image', page) : undefined;
    const result = intent.type === 'insert' && spec?.type === 'image'
      ? intent.session.execute({ type: 'object.insert', pageId: intent.pageId, object: { ...spec, assetId: upload.asset.id, asset: upload.asset } })
      : intent.type === 'replace'
        ? intent.session.execute({ type: 'image.replace', objectId: intent.objectId, assetId: upload.asset.id, asset: upload.asset })
        : intent.type === 'table-cell'
          ? intent.session.execute({
              type: 'table.cell.setImage',
              pageId: intent.pageId,
              objectId: intent.objectId,
              tableId: intent.tableId,
              cellId: intent.cellId,
              expectedContent: intent.expectedContent,
              expectedContentPresentation: intent.expectedContentPresentation,
              assetId: upload.asset.id,
              asset: upload.asset,
              fit: intent.fit,
              targetWidthU: intent.targetWidthU,
              targetHeightU: intent.targetHeightU,
            })
          : undefined;
    if (!result?.ok) return { message: 'Não foi possível vincular a imagem ao documento. Tente novamente.' };
    runtime.workspace.setAssetRuntimeState(upload.asset.id, upload.runtimeState);
    if (upload.runtimeState.status === 'resolved') runtime.workspace.setAssetUrl(upload.asset.id, upload.runtimeState.url);
    const verb = intent.type === 'insert' ? 'adicionada' : intent.type === 'replace' ? 'substituída' : 'vinculada à célula';
    return {
      objectId: intent.type === 'insert' ? result.metadata.createdIds[0] : intent.objectId,
      message: upload.runtimeState.status === 'resolved'
        ? `Imagem ${verb}.`
        : `Imagem ${verb}, mas a pré-visualização está temporariamente indisponível.`,
    };
  } catch {
    return current() ? { message: imageUploadErrorMessage('UNKNOWN') } : stale;
  }
}
