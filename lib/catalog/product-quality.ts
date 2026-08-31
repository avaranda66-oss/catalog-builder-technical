import type { Product } from '../types/database'

export interface ProductQuality { score: number; missing: string[]; warnings: string[] }
export function productQuality(product: Product): ProductQuality {
  const missing: string[] = []
  const warnings: string[] = []
  const checks = [
    [Boolean(product.sku.trim()), 'SKU'], [Boolean(product.name.trim()), 'Nome'],
    [Boolean(product.family.trim()), 'Família'], [Boolean(product.data.marketing?.overview?.trim()), 'Descrição'],
    [Boolean(product.data.specs?.length), 'Especificações'],
    [Boolean(product.data.marketing?.images?.length || product.data.media?.length), 'Imagem ou anexo'],
  ] as const
  checks.forEach(([valid, name]) => { if (!valid) missing.push(name) })
  if (product.data.specs?.some(r => !r.param.trim() || r.value === '' || r.value === null || r.value === undefined)) warnings.push('Há especificações incompletas.')
  if (product.data.marketing?.images?.some(url => url.startsWith('data:'))) warnings.push('Há imagens locais incorporadas; envie-as à biblioteca antes da publicação.')
  if (!product.data.source) warnings.push('Origem dos dados ainda não registrada.')
  return {score: Math.round((checks.length - missing.length) / checks.length * 100), missing, warnings}
}

export function documentIssues(products: Product[]): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  for (const p of products) {
    const sku = p.sku.trim().toLowerCase()
    if (!sku || !p.name.trim()) issues.push('Produto sem SKU ou nome.')
    if (seen.has(sku)) issues.push('SKU duplicado: ' + p.sku)
    seen.add(sku)
    if (p.data.specs?.some(r => !r.param.trim() || r.value === '' || r.value === null || r.value === undefined)) issues.push(p.sku + ': especificação incompleta.')
  }
  return issues
}
