import type { Catalog, Product } from '../types/database'
import type { CatalogPage, ContactInfo, DesignTokens } from '../types/catalog-builder'
import { CatalogPageSchema, ContactInfoSchema, DesignTokensSchema } from '../validators/catalog-schemas'
import { formatValue, imageItems, record, rows, sectionContent, sectionDataSource, sectionProduct } from '../catalog/section-data'

export interface PrintDocumentInput {
  catalog: Catalog | null
  products: Product[]
  pages: CatalogPage[]
  designTokens: DesignTokens
  contact: ContactInfo
  selectedProductId: string | null
}
export interface PrintSnapshot extends PrintDocumentInput { schemaVersion: 1; createdAt: string }
export interface PreflightIssue { severity: 'error' | 'warning'; message: string; pageId?: string; sectionId?: string }

const PREFIX = 'catalog-builder-print:'
const MAX_SNAPSHOT_BYTES = 4_000_000

export function createPrintSnapshot(input: PrintDocumentInput): PrintSnapshot {
  return JSON.parse(JSON.stringify({ ...input, schemaVersion: 1, createdAt: new Date().toISOString() })) as PrintSnapshot
}

/** New same-origin window receives a copy of sessionStorage; it never reads the live editor store. */
export async function openPrintDocument(input: PrintDocumentInput): Promise<void> {
  const printWindow = window.open('about:blank', '_blank')
  if (!printWindow) throw new Error('Permita abrir a janela de impressão neste navegador e tente novamente.')
  printWindow.document.title = 'Preparando PDF'
  printWindow.document.body.textContent = 'Preparando snapshot e renovando o acesso às imagens…'
  const id = crypto.randomUUID()
  const key = `${PREFIX}${id}`
  try {
    const { refreshMediaUrls } = await import('../supabase/api')
    const snapshot = createPrintSnapshot(await refreshMediaUrls(input))
    const serialized = JSON.stringify(snapshot)
    if (new Blob([serialized]).size > MAX_SNAPSHOT_BYTES) throw new Error('Documento excede 4 MB. Envie as imagens para a biblioteca em nuvem antes de exportar.')
    printWindow.sessionStorage.setItem(key, serialized)
    printWindow.opener = null
    printWindow.location.replace(`/print?document=${encodeURIComponent(id)}`)
  } catch (error) {
    printWindow.close()
    if (error instanceof DOMException && error.name === 'QuotaExceededError') throw new Error('Espaço local insuficiente para preparar o PDF. Reduza imagens locais ou use a biblioteca em nuvem.')
    throw error
  }
}

export function readPrintSnapshot(storage: Pick<Storage, 'getItem' | 'removeItem'>, id: string): PrintSnapshot {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Identificador de impressão inválido.')
  const key = `${PREFIX}${id}`
  const raw = storage.getItem(key)
  if (!raw) throw new Error('Esta sessão de impressão expirou. Prepare o PDF novamente no editor.')
  const snapshot = record(JSON.parse(raw))
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.pages) || !Array.isArray(snapshot.products)) throw new Error('Snapshot de impressão inválido.')
  snapshot.pages.forEach(page => CatalogPageSchema.parse(page))
  DesignTokensSchema.parse(snapshot.designTokens)
  ContactInfoSchema.parse(snapshot.contact)
  if (snapshot.products.some(product => typeof record(product).id !== 'string' || typeof record(product).sku !== 'string' || typeof record(product).name !== 'string' || !record(product).data)) throw new Error('Produto inválido no snapshot de impressão.')
  storage.removeItem(key)
  return snapshot as unknown as PrintSnapshot
}

export function preflightDocument(input: PrintDocumentInput): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const visible = input.pages.filter(page => page.visible)
  if (!visible.length) issues.push({ severity: 'error', message: 'O documento não possui páginas visíveis.' })
  if (!input.catalog?.name.trim()) issues.push({ severity: 'error', message: 'Preencha o nome do catálogo.' })
  if (!input.contact.companyName.trim()) issues.push({ severity: 'error', message: 'Preencha o nome da empresa.' })
  const selected = input.products.find(product => product.id === input.selectedProductId) ?? input.products[0] ?? null
  for (const page of visible) {
    const sections = page.sections.filter(section => section.visible)
    if (!sections.length) issues.push({ severity: 'error', pageId: page.id, message: `${page.title}: página vazia.` })
    for (const section of sections) {
      const add = (severity: PreflightIssue['severity'], message: string) => issues.push({ severity, pageId: page.id, sectionId: section.id, message: `${page.title} / ${section.title}: ${message}` })
      const product = sectionProduct(section, selected, input.products)
      if (sectionDataSource(section) === 'product' && !product) { add('error', 'produto vinculado não encontrado.'); continue }
      if (sectionDataSource(section) === 'product' && product) {
        if (!product.sku.trim() || !product.name.trim()) add('error', 'nome e SKU do produto são obrigatórios.')
        if (!['approved', 'published'].includes(product.status)) add('warning', `o produto ${product.sku} ainda não está aprovado.`)
      }
      const content = sectionContent(section, product)
      if (section.type === 'text_block' && !formatValue(content.text).trim()) add('error', 'texto vazio.')
      if (section.type === 'single_image' && !formatValue(content.imageUrl)) add('error', 'imagem/diagrama ausente.')
      if (section.type === 'image_gallery' && !imageItems(content.images).length) add('error', 'galeria sem imagens.')
      if (section.type === 'hero_banner') {
        if (!formatValue(content.title).trim()) add('error', 'título comercial não preenchido.')
        if (section.config.showImage !== false && !imageItems(content.images).length) add('error', 'foto da capa ausente.')
      }
      if (['specs_table', 'electrical_table', 'general_specs_table', 'accessories_table', 'custom_table'].includes(section.type)) {
        if (!rows(content.rows).length) add('error', 'tabela sem dados.')
        const required: Record<string, string[]> = { specs_table: ['param', 'value'], electrical_table: ['signal', 'range', 'accuracy'], general_specs_table: ['param', 'desc'], accessories_table: ['code', 'description'] }
        if (rows(content.rows).some(row => (required[section.type] ?? []).some(key => !formatValue(row[key]).trim()))) add('error', 'tabela possui campos técnicos obrigatórios vazios.')
      }
      if (section.type === 'ordering_codes' && !rows(content.segments).length) add('error', 'código de encomenda vazio.')
    }
  }
  return issues
}

export async function waitForPrintAssets(root: HTMLElement): Promise<void> {
  const timeout = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))
  await Promise.race([document.fonts.ready, timeout(15_000)])
  await Promise.all(Array.from(root.querySelectorAll('img')).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    const finish = () => { image.removeEventListener('load', finish); image.removeEventListener('error', finish); resolve() }
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
    window.setTimeout(finish, 15_000)
  })))
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export function preflightLayout(root: HTMLElement): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  root.querySelectorAll<HTMLElement>('[data-page-id]').forEach(page => {
    const pageId = page.dataset.pageId
    if (page.scrollHeight > page.clientHeight + 2 || page.scrollWidth > page.clientWidth + 2) issues.push({ severity: 'error', pageId, message: `${page.getAttribute('aria-label')}: conteúdo excede a folha A4. Mova blocos para outra página ou reduza dimensões.` })
    page.querySelectorAll<HTMLImageElement>('img').forEach(image => {
      if (!image.complete || image.naturalWidth === 0) issues.push({ severity: 'error', pageId, message: `${image.alt || 'Imagem'}: arquivo não carregado. Verifique o endereço e o acesso.` })
      else if (image.naturalWidth < image.clientWidth * 2) issues.push({ severity: 'warning', pageId, message: `${image.alt || 'Imagem'}: resolução abaixo de 192 dpi no tamanho utilizado.` })
    })
    if (page.querySelector('[role="alert"]')) issues.push({ severity: 'error', pageId, message: 'Um bloco falhou na renderização. Corrija os dados antes de exportar.' })
  })
  return issues
}
