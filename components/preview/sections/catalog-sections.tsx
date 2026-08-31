import React from 'react'
import Image from 'next/image'
import type { PageSection, DesignTokens, ContactInfo } from '@/lib/types/catalog-builder'
import type { Product } from '@/lib/types/database'
import { formatValue, imageItems, productRows, record, rows, sectionContent, strings, tableCells } from '@/lib/catalog/section-data'

export interface SectionProps {
  section: PageSection
  product: Product | null
  tokens: DesignTokens
  contact: ContactInfo
  allProducts?: Product[]
  onContentChange?: (field: string, value: unknown) => void
}

function Frame({ section, tokens, children, title = true }: SectionProps & { children: React.ReactNode; title?: boolean }) {
  const style = section.style ?? {}
  return <div className="catalog-block" style={{
    color: style.textColor ?? '#262626', backgroundColor: style.backgroundColor ?? tokens.colors.surface,
    fontFamily: tokens.fonts.body, fontSize: `${style.fontSizePx ?? 11}px`, textAlign: style.align,
    padding: `${style.paddingMm ?? 0}mm`, marginBottom: `${style.marginBottomMm ?? 0}mm`,
    border: style.showBorder ? `${style.borderWidthPx ?? 1}px ${style.borderStyle ?? 'solid'} ${style.borderColor ?? tokens.colors.border}` : undefined,
    overflowWrap: 'anywhere',
  }}>
    {title && !style.hideHeader && <h3 className="mb-2 border-b pb-1 font-bold uppercase tracking-wide" style={{ color: style.accentColor ?? tokens.colors.primary, borderColor: style.accentColor ?? tokens.colors.primary, fontFamily: tokens.fonts.heading, fontSize: `${style.titleFontSizePx ?? 12}px` }}>{section.title}</h3>}
    {children}
  </div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div data-empty-block="true" className="border border-dashed border-gray-300 p-3 text-xs text-gray-500">{children}</div>
}

function Editable({ value, onChange }: { value: unknown; onChange?: (value: string) => void }) {
  return onChange ? <input aria-label="Editar valor do bloco" className="w-full min-w-0 border-b border-dashed border-blue-400 bg-transparent" value={formatValue(value)} onChange={event => onChange(event.target.value)} /> : <>{formatValue(value)}</>
}

function DataTable({ columns, values, tokens, section, onCellChange }: {
  columns: string[]; values: unknown[][]; tokens: DesignTokens; section: PageSection;
  onCellChange?: (row: number, column: number, value: string) => void;
}) {
  if (!values.length) return <Empty>Nenhum dado cadastrado nesta tabela.</Empty>
  return <table className="catalog-table w-full border-collapse text-left" style={{ borderColor: section.style?.borderColor ?? tokens.colors.border, fontFamily: tokens.fonts.data }}>
    {section.config.showHeader !== false && <thead><tr style={{ backgroundColor: tokens.colors.headerBg, color: tokens.colors.headerText }}>{columns.map((column, index) => <th key={index} scope="col" className="border p-2">{column}</th>)}</tr></thead>}
    <tbody>{values.map((row, rowIndex) => <tr key={rowIndex} style={{ backgroundColor: rowIndex % 2 ? '#FFFFFF' : tokens.colors.surface }}>{columns.map((_, columnIndex) => <td key={columnIndex} className="border p-2 align-top" style={{ height: `${tokens.spacing.cellHeightPx ?? 32}px` }}><Editable value={row[columnIndex]} onChange={onCellChange ? value => onCellChange(rowIndex, columnIndex, value) : undefined} /></td>)}</tr>)}</tbody>
  </table>
}

export function CatalogImage({ src, alt, height = 180, fit = 'contain' }: { src: string; alt: string; height?: number; fit?: 'contain' | 'cover' }) {
  return <Image src={src} alt={alt} width={1200} height={800} unoptimized loading="eager" style={{ width: '100%', height, objectFit: fit, maxWidth: '100%' }} />
}

export function HeroBannerSection(props: SectionProps) {
  const { section, product, tokens, contact, onContentChange } = props
  const content = sectionContent(section, product)
  const config = section.config
  const images = imageItems(content.images)
  const features = strings(content.features)
  const split = config.layoutVariant === 'fluke_split'
  // The historical seed referenced a file that was never shipped. Treat that
  // legacy placeholder as an absent logo so preview and print do not emit a
  // guaranteed 404; teams can upload the real brand mark through the media UI.
  const logoUrl = contact.logoUrl && !contact.logoUrl.endsWith('/img/logo-presys.png') ? contact.logoUrl : ''
  return <Frame {...props} title={false}>
    <header className="mb-3 flex items-center justify-between gap-3 border-b-2 pb-3" style={{ borderColor: tokens.colors.primary }}>
      {config.showLogo !== false && <div className="flex items-center gap-3">{logoUrl ? <Image src={logoUrl} alt={contact.companyName} width={130} height={55} unoptimized loading="eager" className="max-h-14 w-auto max-w-36 object-contain" /> : <strong style={{ color: tokens.colors.primary }}>{contact.companyName}</strong>}</div>}
      <span className="text-xs font-bold" style={{ fontFamily: tokens.fonts.data }}>{product?.sku ?? ''}</span>
    </header>
    {config.showSubtitle !== false && <p className="mb-1 text-xs uppercase tracking-widest" style={{ color: tokens.colors.accent }}><Editable value={content.subtitle} onChange={onContentChange ? value => onContentChange('subtitle', value) : undefined} /></p>}
    <h1 className="mb-4 font-bold leading-tight" style={{ color: tokens.colors.dark, fontFamily: tokens.fonts.heading, fontSize: `${section.style?.titleFontSizePx ?? 25}px` }}><Editable value={content.title} onChange={onContentChange ? value => onContentChange('title', value) : undefined} /></h1>
    <div className="grid gap-4" style={{ gridTemplateColumns: config.imageLayout === 'stacked' || split ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)' }}>
      <div><p className="whitespace-pre-wrap leading-relaxed">{formatValue(content.overview)}</p><ul className="mt-3 space-y-1">{features.map((feature, index) => <li key={index}>• {feature}</li>)}</ul></div>
      {config.showImage !== false && <div className="grid gap-2">{images.length ? images.slice(0, 3).map((image, index) => <CatalogImage key={`${image.url}-${index}`} src={image.url} alt={image.caption || product?.name || 'Imagem do produto'} height={Number(config.imageHeightPx ?? 160)} fit={config.imageFit === 'cover' ? 'cover' : 'contain'} />) : <Empty>Imagem do produto não cadastrada.</Empty>}</div>}
    </div>
  </Frame>
}

export function FeaturesListSection(props: SectionProps) {
  const { section, product, onContentChange } = props
  const items = strings(sectionContent(section, product).items)
  const max = Number(section.config.maxItems ?? items.length)
  return <Frame {...props}>{items.length ? <ul className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: `repeat(${Number(section.config.columns ?? 1)}, minmax(0,1fr))` }}>{items.slice(0, max).map((item, index) => <li key={index} className="flex gap-2"><span>✓</span><Editable value={item} onChange={onContentChange ? value => onContentChange('items', items.map((old, i) => i === index ? value : old)) : undefined} /></li>)}</ul> : <Empty>Nenhum destaque cadastrado.</Empty>}</Frame>
}

export function TextBlockSection(props: SectionProps) {
  const text = formatValue(sectionContent(props.section, props.product).text)
  return <Frame {...props}>{props.onContentChange ? <textarea aria-label="Texto do bloco" value={text} rows={5} className="w-full border border-dashed border-blue-400 bg-transparent p-2" onChange={event => props.onContentChange?.('text', event.target.value)} /> : text ? <p className="whitespace-pre-wrap leading-relaxed" style={{ textAlign: props.section.style?.align ?? (props.section.config.alignment as React.CSSProperties['textAlign']) }}>{text}</p> : <Empty>Texto não preenchido.</Empty>}</Frame>
}

export const TECHNICAL_TABLES = {
  specs_table: { keys: ['param', 'value'], labels: ['Parâmetro', 'Especificação'] },
  electrical_table: { keys: ['signal', 'range', 'resolution', 'accuracy', 'note'], labels: ['Sinal', 'Faixa', 'Resolução', 'Exatidão', 'Observação'] },
  general_specs_table: { keys: ['param', 'desc'], labels: ['Parâmetro', 'Descrição'] },
  accessories_table: { keys: ['code', 'description', 'type'], labels: ['Código', 'Descrição', 'Tipo'] },
} as const

function TechnicalTable(props: SectionProps & { kind: keyof typeof TECHNICAL_TABLES }) {
  const { section, product, tokens, onContentChange, kind } = props
  const contentRows = rows(sectionContent(section, product).rows)
  const definition = TECHNICAL_TABLES[kind]
  const configured = strings(section.config.columns)
  const columns = definition.labels.map((label, index) => configured[index] ?? label)
  return <Frame {...props}><DataTable section={section} tokens={tokens} columns={columns} values={contentRows.map(row => definition.keys.map(key => row[key]))} onCellChange={onContentChange ? (ri, ci, value) => onContentChange('rows', contentRows.map((row, i) => i === ri ? { ...row, [definition.keys[ci]]: value } : row)) : undefined} /></Frame>
}

export const SpecsTableSection = (props: SectionProps) => <TechnicalTable {...props} kind="specs_table" />
export const ElectricalTableSection = (props: SectionProps) => <TechnicalTable {...props} kind="electrical_table" />
export const GeneralSpecsTableSection = (props: SectionProps) => <TechnicalTable {...props} kind="general_specs_table" />
export const AccessoriesTableSection = (props: SectionProps) => <TechnicalTable {...props} kind="accessories_table" />

export function ComparisonGridSection(props: SectionProps) {
  const ids = strings(props.section.config.models)
  const models = (props.allProducts ?? []).filter(product => !ids.length || ids.includes(product.id))
  const keys = [...new Set(models.flatMap(product => productRows(product, 'specs_table').map(row => formatValue(row.param))))]
  return <Frame {...props}>{models.length < 2 ? <Empty>Selecione pelo menos dois produtos para comparar.</Empty> : <DataTable {...props} columns={['Parâmetro', ...models.map(product => product.sku)]} values={keys.map(key => [key, ...models.map(product => productRows(product, 'specs_table').find(row => formatValue(row.param) === key)?.value ?? '—')])} />}</Frame>
}

export function CustomTableSection(props: SectionProps) {
  const columns = strings(props.section.config.columns)
  const content = record(props.section.content)
  const contentRows = Array.isArray(content.rows) ? content.rows : []
  return <Frame {...props}><DataTable {...props} columns={columns} values={contentRows.map(row => tableCells(row, columns))} onCellChange={props.onContentChange ? (ri, ci, value) => props.onContentChange?.('rows', contentRows.map((row, i) => i === ri ? (Array.isArray(row) ? columns.map((_, col) => col === ci ? value : row[col]) : { ...record(row), [columns[ci]]: value }) : row)) : undefined} /></Frame>
}

export function ContactFooterSection(props: SectionProps) {
  const info = props.section.config.overrideContact ? { ...props.contact, ...record(props.section.content) } : props.contact
  return <Frame {...props} title={false}><footer className="flex flex-wrap items-start justify-between gap-2 border-t pt-2 text-[10px]"><strong>{formatValue(info.companyName)}</strong><span>{formatValue(info.website)}</span><span>{formatValue(info.phone)}</span><span>{formatValue(info.email)}</span>{Boolean(info.address) && <span className="w-full">{formatValue(info.address)}</span>}</footer></Frame>
}

export function ImageGallerySection(props: SectionProps) {
  const images = imageItems(sectionContent(props.section, props.product).images)
  return <Frame {...props}>{images.length ? <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Number(props.section.config.columns ?? 3)}, minmax(0,1fr))` }}>{images.map((image, index) => <figure key={`${image.url}-${index}`}><CatalogImage src={image.url} alt={image.caption || `Imagem ${index + 1}`} height={Number(props.section.config.imageHeightPx ?? 130)} />{props.section.config.showCaptions !== false && image.caption && <figcaption className="mt-1 text-center text-[10px]">{image.caption}</figcaption>}</figure>)}</div> : <Empty>Galeria sem imagens.</Empty>}</Frame>
}

export function SingleImageSection(props: SectionProps) {
  const content = sectionContent(props.section, props.product)
  const url = formatValue(content.imageUrl)
  const caption = formatValue(content.caption ?? props.section.config.caption)
  return <Frame {...props}>{url ? <figure style={{ textAlign: (props.section.config.align as React.CSSProperties['textAlign']) ?? 'center' }}><CatalogImage src={url} alt={caption || props.section.title} height={Number(props.section.config.maxHeightMm ?? 60) * 96 / 25.4} />{caption && <figcaption className="mt-1 text-[10px] italic">{caption}</figcaption>}</figure> : <Empty>Nenhuma imagem ou diagrama selecionado.</Empty>}</Frame>
}

export function OrderingCodesSection(props: SectionProps) {
  const segments = rows(sectionContent(props.section, props.product).segments)
  return <Frame {...props}>{segments.length ? <DataTable {...props} columns={['Código / segmento', 'Descrição', 'Opções']} values={segments.map(segment => [segment.segment ?? segment.code, segment.description, segment.options])} /> : <Empty>Código de encomenda não preenchido.</Empty>}</Frame>
}

export function BlankSpacerSection({ section }: SectionProps) {
  return <div aria-hidden="true" style={{ height: `${Number(section.config.heightMm ?? 20)}mm` }} />
}
