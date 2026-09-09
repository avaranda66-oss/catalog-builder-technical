import type { CatalogDocument } from './proof-model';
import type { TablePlan } from './proof-render-plan';
import { ProofPage } from './ProofPage';
export function ProofDocument({document,plans,assetUrls}:{document:CatalogDocument;plans:ReadonlyMap<string,TablePlan>;assetUrls:ReadonlyMap<string,string>}) {
  return <div data-editorial-root="" lang={document.locale}>
    {document.pages.map((page,i)=><ProofPage key={page.id} page={page} document={document} pageNumber={i+1} pageCount={document.pages.length} plans={plans} assetUrls={assetUrls}/>)}
  </div>;
}
