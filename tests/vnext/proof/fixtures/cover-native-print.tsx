// Prova "tela = PDF" (Onda 3.5, S2): desenha só as páginas pedidas com o MESMO DocumentRenderer da publicação, para
// a prova tirar a captura de tela e imprimir o PDF (window.print / page.pdf) do mesmo DOM.
//   ?dir=/scratch/cover-audit  ?catalog=PCON-HIBRIDO-NATIVO  ?pages=0,1
import ReactDOM from 'react-dom/client';
import { CatalogDocumentSchema } from '@/vnext/domain';
import { compilePlans, DocumentRenderer } from '@/vnext/rendering';
import '@/vnext/rendering/styles.css';

const params = new URLSearchParams(window.location.search);
const dir = params.get('dir') ?? '/scratch/cover-audit';
const name = params.get('catalog') ?? 'PCON-HIBRIDO-NATIVO';
const pages = (params.get('pages') ?? '0').split(',').map(Number);

async function boot() {
  const document = CatalogDocumentSchema.parse(await (await fetch(`${dir}/catalogs/${name}.catalog.json`)).json());
  const subset = { ...document, pages: pages.map((index) => document.pages[index]) };
  const urls = new Map(document.assets.map((asset) => [asset.id, `${dir}/assets/${asset.name}`]));
  ReactDOM.createRoot(window.document.getElementById('root')!).render(
    <DocumentRenderer document={subset} plans={compilePlans(subset).plans} assetUrls={urls} />
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.document.fonts.ready;
  await Promise.all([...window.document.images].map((image) => image.decode().catch(() => undefined)));
  await new Promise((resolve) => setTimeout(resolve, 300));
  (window as unknown as { __READY__: boolean }).__READY__ = true;
}
void boot();
