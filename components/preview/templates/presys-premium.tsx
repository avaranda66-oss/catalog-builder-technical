import type { Product, Catalog } from '@/lib/types/database'
import { DEFAULT_PAGES, PRESYS_CONTACT, PRESYS_DESIGN_TOKENS } from '@/lib/data/initial-data'
import { CatalogPages } from '../catalog-pages'

/** Compatibility entrypoint; all documents now use the same data bindings and A4 renderer. */
export function PresysPremiumTemplate({ product, catalog, allProducts }: { product: Product; catalog: Catalog | null; allProducts: Product[] }) {
  const contact = { ...PRESYS_CONTACT, companyName: catalog?.brand.companyName ?? PRESYS_CONTACT.companyName, logoUrl: catalog?.brand.logoUrl ?? '', website: catalog?.brand.website ?? '', phone: catalog?.brand.phone ?? '', email: catalog?.brand.email ?? '' }
  return <CatalogPages pages={DEFAULT_PAGES} product={product} allProducts={allProducts} locale={catalog?.locale} tokens={{ ...PRESYS_DESIGN_TOKENS, colors: { ...PRESYS_DESIGN_TOKENS.colors, primary: catalog?.brand.primaryColor ?? PRESYS_DESIGN_TOKENS.colors.primary } }} contact={contact} />
}
