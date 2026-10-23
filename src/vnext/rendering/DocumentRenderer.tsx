import type { CatalogDocument } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { PageRenderer } from './PageRenderer';
import './styles.css';

export interface DocumentRendererProps {
  document: CatalogDocument;
  plans: ReadonlyMap<string, TablePlan>;
  assetUrls: ReadonlyMap<string, string>;
  /**
   * "Imprimir rascunho": while a draft is printed, every page carries the draft word of the catalog's language
   * ("RASCUNHO", "DRAFT"…, from the domain registry, never free text) diagonally. Drawing only: it is never part of
   * the catalog and the publication checks never see it.
   */
  draft?: boolean;
}

/**
 * Onda 4 (FR-55): where the drawn pages sit in the whole catalog, for a drawing of only some of its pages (the
 * editor's page, a thumbnail). Numbers only: the footer words always come from the document itself.
 */
export interface PageSliceNumbering {
  /** Number of the first drawn page in the whole catalog (1 = cover). */
  firstPageNumber: number;
  /** Pages in the whole catalog. */
  pageCount: number;
}

export function DocumentRenderer({document,plans,assetUrls,draft}:DocumentRendererProps) {
  return <DocumentSliceRenderer document={document} plans={plans} assetUrls={assetUrls} draft={draft}
    numbering={{firstPageNumber:1,pageCount:document.pages.length}}/>;
}

/** The same drawing as DocumentRenderer, for some pages of a longer catalog: "Página 4 de 11" stays right. */
export function DocumentSliceRenderer({document,plans,assetUrls,numbering,draft}:DocumentRendererProps&{numbering:PageSliceNumbering}) {
  const count=Math.max(numbering.pageCount,numbering.firstPageNumber+document.pages.length-1);
  return <div data-editorial-root="" lang={document.locale}>
    {document.pages.map((page,i)=><PageRenderer key={page.id} page={page} document={document} pageNumber={numbering.firstPageNumber+i} pageCount={count}
      plans={plans} assetUrls={assetUrls} draft={draft}/>)}
  </div>;
}
