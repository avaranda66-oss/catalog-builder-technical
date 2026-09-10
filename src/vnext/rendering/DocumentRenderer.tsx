import type { CatalogDocument } from '../domain/editorial-model';
import type { TablePlan } from './render-plan';
import { PageRenderer } from './PageRenderer';
import './styles.css';

export interface DocumentRendererProps {
  document: CatalogDocument;
  plans: ReadonlyMap<string, TablePlan>;
  assetUrls: ReadonlyMap<string, string>;
}

export function DocumentRenderer({document,plans,assetUrls}:DocumentRendererProps) {
  return <div data-editorial-root="" lang={document.locale}>
    {document.pages.map((page,i)=><PageRenderer key={page.id} page={page} document={document} pageNumber={i+1} plans={plans} assetUrls={assetUrls}/>)}
  </div>;
}
