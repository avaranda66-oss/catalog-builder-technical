import { parseCanonicalDocument, type DocumentSession } from '@/vnext/application';
import { sha256, sniffImageDimensions, sniffImageMime, type AssetLineageContext, type AssetPersistenceBridge, type AssetRuntimeState } from '@/vnext/asset';
import type { AssetRef, CatalogDocument, EditorialObject } from '@/vnext/domain';
import type { CatalogStarterDefinition } from './starter-registry';
import { PRESYS_IMAGE_MANIFEST, PRESYS_PRESENTATION_PAGE_ID, PRESYS_SPECIFICATIONS_PAGE_ID, type createPresysPageTemplateRegistry } from './presys-ta25n-starter';

export interface StarterAssetManifest {
  readonly seedAssetId: string;
  readonly runtimePackagedPath: string;
  readonly sha256: string;
  readonly mime: AssetRef['mime'];
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteLength: number;
  readonly version: string;
  readonly name: string;
  readonly alt: string;
}

export class StarterDependencyError extends Error {
  constructor(readonly code: 'STARTER_DEPENDENCY_UNAVAILABLE' | 'STALE_RESULT', message: string) {
    super(message);
    this.name = 'StarterDependencyError';
  }
}

type Current = () => boolean;
function requireCurrent(current: Current): void {
  if (!current()) throw new StarterDependencyError('STALE_RESULT', 'Starter authority changed during preparation');
}

export function matchesStarterAsset(asset: AssetRef, manifest: StarterAssetManifest): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(asset.id)
    && asset.id !== manifest.seedAssetId && asset.version === manifest.version && asset.sha256 === manifest.sha256
    && asset.mime === manifest.mime && asset.widthPx === manifest.widthPx && asset.heightPx === manifest.heightPx
    && asset.name === manifest.name && asset.alt === manifest.alt;
}

export interface StarterDependencyPreparer {
  prepare(starter: CatalogStarterDefinition, context: AssetLineageContext, current: Current): Promise<CatalogDocument>;
}

/** Composition over the existing bridge, not an asset/create persistence authority. Cache is authority-scoped. */
export class DefaultStarterDependencyPreparer implements StarterDependencyPreparer {
  private readonly finalized = new Map<string, AssetRef>();
  private readonly inFlight = new Map<string, Promise<{ asset: AssetRef; state: AssetRuntimeState & { status: 'resolved' } }>>();

  constructor(private readonly bridge: AssetPersistenceBridge,
    private readonly fetchBytes: (path: string) => Promise<Uint8Array> = async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Required packaged starter image is unavailable');
      return new Uint8Array(await response.arrayBuffer());
    }) {}

  async prepareAsset(manifest: StarterAssetManifest, context: AssetLineageContext, current: Current, existing?: AssetRef) {
    requireCurrent(current);
    if (!context.authLineage || !context.authorityScopeId) throw new StarterDependencyError('STALE_RESULT', 'Starter requires active authority');
    const key = JSON.stringify([context.authorityScopeId, context.authLineage, manifest]);
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.resolveRequired(manifest, context, current, key, existing);
      this.inFlight.set(key, pending);
    }
    try {
      const prepared = await pending;
      requireCurrent(current);
      return prepared;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  private async resolveRequired(manifest: StarterAssetManifest, context: AssetLineageContext, current: Current, key: string, existing?: AssetRef) {
    try {
      let asset = existing ?? this.finalized.get(key);
      if (!asset) {
        const bytes = await this.fetchBytes(manifest.runtimePackagedPath);
        requireCurrent(current);
        const dimensions = sniffImageDimensions(bytes);
        if (bytes.byteLength !== manifest.byteLength || sniffImageMime(bytes) !== manifest.mime
          || dimensions?.widthPx !== manifest.widthPx || dimensions.heightPx !== manifest.heightPx
          || await sha256(bytes) !== manifest.sha256) throw new Error('Required starter bytes do not match the approved manifest');
        requireCurrent(current);
        const finalized = await this.bridge.finalizeUpload({ bytes, name: manifest.name, alt: manifest.alt, version: manifest.version }, context);
        requireCurrent(current);
        if (!finalized.ok) throw new Error(finalized.error.code);
        asset = finalized.asset;
        if (!matchesStarterAsset(asset, manifest)) throw new Error('Finalized starter metadata does not match approval');
        // Keep this identity if resolution fails: retry resolve, never upload a second immutable object.
        this.finalized.set(key, asset);
      }
      if (!matchesStarterAsset(asset, manifest)) throw new Error('Starter asset metadata does not match approval');
      requireCurrent(current);
      const resolved = await this.bridge.resolve(asset, { ...context, forceRefresh: true });
      requireCurrent(current);
      if (!resolved.ok || resolved.state.status !== 'resolved' || !matchesStarterAsset(resolved.state.asset, manifest)
        || resolved.state.asset.id !== asset.id || !resolved.state.url) throw new Error('Required durable starter image is not resolved');
      return { asset, state: resolved.state };
    } catch (error) {
      if (error instanceof StarterDependencyError) throw error;
      throw new StarterDependencyError('STARTER_DEPENDENCY_UNAVAILABLE', error instanceof Error ? error.message : 'Starter preparation failed');
    }
  }

  async prepare(starter: CatalogStarterDefinition, context: AssetLineageContext, current: Current): Promise<CatalogDocument> {
    const doc = structuredClone(starter.sourceDocument);
    const replacements = new Map<string, string>();
    for (const manifest of starter.requiredAssets ?? []) {
      const { asset } = await this.prepareAsset(manifest, context, current);
      replacements.set(manifest.seedAssetId, asset.id);
      doc.assets = doc.assets.map(ref => ref.id === manifest.seedAssetId ? asset : ref);
    }
    const remap = (object: EditorialObject): void => {
      if (object.type === 'image' || object.type === 'icon') object.assetId = replacements.get(object.assetId) ?? object.assetId;
      if (object.type === 'group') object.objects.forEach(remap);
      if (object.type === 'table') for (const cell of object.table.cells) {
        if (cell.content.type === 'image') cell.content.assetId = replacements.get(cell.content.assetId) ?? cell.content.assetId;
      }
    };
    doc.pages.forEach(page => page.objects.forEach(remap));
    requireCurrent(current);
    return parseCanonicalDocument(doc);
  }
}

interface PageReuseBinding {
  readonly templates: ReturnType<typeof createPresysPageTemplateRegistry>;
  readonly preparer: DefaultStarterDependencyPreparer;
  readonly getLineage: () => AssetLineageContext;
  readonly isCurrent: Current;
  readonly installRuntimeAsset: (asset: AssetRef, state: AssetRuntimeState & { status: 'resolved' }) => void;
}
const pageReuse = new WeakMap<DocumentSession, PageReuseBinding>();
export function bindPresysPageReuse(session: DocumentSession, binding: PageReuseBinding): void { pageReuse.set(session, binding); }
export function hasPresysPageReuse(session: DocumentSession): boolean { return pageReuse.has(session); }

export async function insertPresysPage(session: DocumentSession, templateId: string, afterPageId: string, intentCurrent: Current = () => true): Promise<
  { ok: true; pageId: string } | { ok: false; code: string }
> {
  const binding = pageReuse.get(session);
  if (!binding || ![PRESYS_PRESENTATION_PAGE_ID, PRESYS_SPECIFICATIONS_PAGE_ID].includes(templateId)) return { ok: false, code: 'TEMPLATE_NOT_FOUND' };
  const lineage = binding.getLineage();
  const current = () => intentCurrent() && binding.isCurrent() && JSON.stringify(binding.getLineage()) === JSON.stringify(lineage)
    && session.getSnapshot().document.pages.some(page => page.id === afterPageId);
  try {
    requireCurrent(current);
    const existing = session.getSnapshot().document.assets.find(ref => matchesStarterAsset(ref, PRESYS_IMAGE_MANIFEST));
    const prepared = await binding.preparer.prepareAsset(PRESYS_IMAGE_MANIFEST, lineage, current, existing);
    requireCurrent(current);
    binding.templates.install(prepared.asset);
    const transactionId = globalThis.crypto.randomUUID();
    const registered = session.execute({ type: 'asset.register', asset: prepared.asset }, { transactionId });
    if (!registered.ok) return { ok: false, code: registered.error.code };
    requireCurrent(current);
    const inserted = session.execute({ type: 'page.template.insert', templateId, afterPageId }, { transactionId });
    if (!inserted.ok) return { ok: false, code: inserted.error.code };
    binding.installRuntimeAsset(prepared.asset, prepared.state);
    return { ok: true, pageId: inserted.metadata.createdIds[0] };
  } catch (error) {
    return { ok: false, code: error instanceof StarterDependencyError ? error.code : 'STARTER_DEPENDENCY_UNAVAILABLE' };
  }
}
