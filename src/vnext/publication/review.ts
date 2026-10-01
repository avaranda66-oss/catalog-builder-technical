import { parseCanonicalDocument } from '../application';
import { VNextError, diagnostic, type CatalogDocument, type Diagnostic } from '../domain';
import { captureSnapshot, compareSnapshots, compilePlans, decodeImages, loadFonts, measureTables, resolveAssets, type LayoutSnapshot, type TablePlan } from '../rendering';
import { layoutReport } from './preflight';

export interface PublicationSource {
  document: CatalogDocument;
  openSessionId: string;
  remoteRevision: number;
  authLineage: string;
  authorityScopeId: string;
  assetUrls: ReadonlyMap<string, string>;
}

export function samePublicationSource(captured: PublicationSource, current?: PublicationSource): boolean {
  return Boolean(current && current.document === captured.document
    && current.openSessionId === captured.openSessionId && current.remoteRevision === captured.remoteRevision
    && current.authLineage === captured.authLineage && current.authorityScopeId === captured.authorityScopeId
    && current.assetUrls === captured.assetUrls);
}

export interface PublicationReviewResult {
  status: 'READY' | 'BLOCKED';
  document: CatalogDocument;
  plans: Map<string, TablePlan>;
  urls: Map<string, string>;
  diagnostics: Diagnostic[];
  snapshot?: LayoutSnapshot;
}

export function releasePublicationResources(result: Pick<PublicationReviewResult, 'urls'>): void {
  result.urls.forEach(url => URL.revokeObjectURL(url));
}

function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new VNextError('PUBLICATION_SOURCE_CHANGED');
}

function issue(error: unknown): Diagnostic {
  // Resource errors may contain signed URLs; never surface raw transport details.
  return diagnostic(error instanceof VNextError ? error.code : 'PUBLICATION_CHECK_FAILED', 'Não foi possível verificar esta versão para publicação.');
}

/** Composition of the existing canonical renderer pipeline; never edits authored state. */
export async function reviewPublication(source: PublicationSource, root: HTMLElement,
  render: (value: PublicationReviewResult) => void, isCurrent: () => boolean): Promise<PublicationReviewResult> {
  const result: PublicationReviewResult = { status: 'BLOCKED', document: source.document, plans: new Map(), urls: new Map(), diagnostics: [] };
  try {
    assertCurrent(isCurrent);
    result.document = parseCanonicalDocument(source.document);
    const compiled = compilePlans(result.document);
    result.plans = compiled.plans;
    result.diagnostics.push(...compiled.diagnostics);
    render({ ...result, urls: new Map(source.assetUrls) });
    await loadFonts(result.document, root);
    assertCurrent(isCurrent);
    const resources = await resolveAssets(result.document, asset => source.assetUrls.get(asset.id));
    result.urls = resources.urls;
    assertCurrent(isCurrent);
    render(result);
    await decodeImages(root, result.document, result.urls);
    assertCurrent(isCurrent);
    measureTables(result.document, result.plans, root);
    render(result);
    const first = await captureSnapshot(result.document, result.plans, root);
    assertCurrent(isCurrent);
    const second = await captureSnapshot(result.document, result.plans, root);
    assertCurrent(isCurrent);
    result.diagnostics.push(...layoutReport(result.document, result.plans, second, root), ...compareSnapshots(first, second));
    result.snapshot = second;
    result.status = result.diagnostics.some(item => item.severity === 'ERROR') ? 'BLOCKED' : 'READY';
  } catch (error) { result.diagnostics.push(issue(error)); }
  return result;
}

export async function verifyPublicationForPrint(result: PublicationReviewResult, root: HTMLElement, isCurrent: () => boolean): Promise<void> {
  assertCurrent(isCurrent);
  if (result.status !== 'READY' || !result.snapshot) throw new VNextError('PDF_EXPORT_BLOCKED');
  await loadFonts(result.document, root);
  assertCurrent(isCurrent);
  await decodeImages(root, result.document, result.urls);
  assertCurrent(isCurrent);
  const first = await captureSnapshot(result.document, result.plans, root);
  assertCurrent(isCurrent);
  const second = await captureSnapshot(result.document, result.plans, root);
  assertCurrent(isCurrent);
  const issues = [...layoutReport(result.document, result.plans, second, root),
    ...compareSnapshots(result.snapshot, first), ...compareSnapshots(first, second)];
  if (issues.some(item => item.severity === 'ERROR')) throw new VNextError('PDF_EXPORT_BLOCKED');
}
