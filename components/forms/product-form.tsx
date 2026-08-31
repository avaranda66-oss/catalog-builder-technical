'use client'

import React, { useState } from 'react'
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react'
import { useEditorStore } from '@/features/editor/editor-store'
import type { PageSection } from '@/lib/types/catalog-builder'
import type { Product, ProductStatus } from '@/lib/types/database'
import { formatValue, imageItems, productPath, record, rows, sectionContent, sectionDataSource, sectionProduct, strings, tableCells, type DataRecord } from '@/lib/catalog/section-data'
import { TECHNICAL_TABLES } from '@/components/preview/sections/catalog-sections'
import { ImageUploader } from '../ui/image-uploader'

const inputClass = 'w-full rounded border border-gray-300 bg-white px-2 py-2 text-xs focus:border-blue-500 focus:outline-none'

function Field({ label, value, onChange, multiline = false, type = 'text', min, max }: {
  label: string; value: unknown; onChange: (value: string) => void; multiline?: boolean; type?: string; min?: number; max?: number;
}) {
  return <label className="block space-y-1 text-xs font-medium text-gray-600"><span>{label}</span>{multiline ? <textarea className={inputClass} rows={5} value={formatValue(value)} onChange={event => onChange(event.target.value)} /> : <input className={inputClass} type={type} min={min} max={max} value={formatValue(value)} onChange={event => onChange(event.target.value)} />}</label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>
}

function RowEditor({ values, keys, labels, onChange }: { values: DataRecord[]; keys: readonly string[]; labels: readonly string[]; onChange: (values: DataRecord[]) => void }) {
  return <div className="space-y-3">
    {values.map((row, index) => <fieldset key={index} className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
      <legend className="px-1 text-[10px] font-semibold text-gray-500">Linha {index + 1}</legend>
      <div className="grid grid-cols-2 gap-2">{keys.map((key, column) => <Field key={key} label={labels[column]} value={row[key]} onChange={value => onChange(values.map((item, ri) => ri === index ? { ...item, [key]: key === 'options' ? value.split(',').map(option => option.trim()).filter(Boolean) : value } : item))} />)}</div>
      <button type="button" aria-label={`Remover linha ${index + 1}`} onClick={() => onChange(values.filter((_, ri) => ri !== index))} className="flex items-center gap-1 text-xs text-red-700"><Trash2 size={13} />Remover linha</button>
    </fieldset>)}
    <button type="button" onClick={() => onChange([...values, Object.fromEntries(keys.map(key => [key, '']))])} className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800"><Plus size={13} />Adicionar linha</button>
  </div>
}

function ListEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  return <div className="space-y-2">{items.map((item, index) => <div key={index} className="flex items-center gap-2"><input aria-label={`Destaque ${index + 1}`} className={inputClass} value={item} onChange={event => onChange(items.map((old, i) => i === index ? event.target.value : old))} /><button type="button" aria-label={`Remover destaque ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}<button type="button" onClick={() => onChange([...items, ''])} className="text-xs font-semibold text-blue-800">+ Adicionar destaque</button></div>
}

export function ProductForm() {
  const store = useEditorStore()
  const { products, pages, selectedProductId, selectedPageId, setSelectedPageId, updateProductField, isVisualEditMode, setIsVisualEditMode } = store
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const product = products.find(item => item.id === selectedProductId) ?? products[0] ?? null
  const page = pages.find(item => item.id === selectedPageId) ?? pages[0]
  const section = page?.sections.find(item => item.id === activeSectionId) ?? page?.sections[0]
  return <div className="flex h-full flex-1 flex-col overflow-hidden bg-white">
    <header className="space-y-3 border-b bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold">Dados e conteúdo</h2><button type="button" onClick={() => setIsVisualEditMode(!isVisualEditMode)} className="flex items-center gap-1 text-xs font-medium text-blue-800"><SlidersHorizontal size={14} />{isVisualEditMode ? 'Encerrar edição visual' : 'Editar visualmente'}</button></div>
      {product && <><Field label="Nome do produto selecionado" value={product.name} onChange={name => updateProductField(product.id, { name })} /><div className="grid grid-cols-3 gap-2"><Field label="SKU" value={product.sku} onChange={sku => updateProductField(product.id, { sku })} /><Field label="Família" value={product.family} onChange={family => updateProductField(product.id, { family })} /><label className="space-y-1 text-xs text-gray-600">Status<select aria-label="Status do produto" className={inputClass} value={product.status} onChange={event => updateProductField(product.id, { status: event.target.value as ProductStatus })}>{[['draft','Rascunho'],['review','Em revisão'],['approved','Aprovado'],['published','Publicado'],['archived','Arquivado']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></>}
    </header>
    <nav aria-label="Páginas do documento" className="flex shrink-0 gap-2 overflow-x-auto border-b p-2">{pages.map(item => <button type="button" key={item.id} onClick={() => { setSelectedPageId(item.id); setActiveSectionId(null) }} className={`shrink-0 rounded px-3 py-2 text-xs ${page?.id === item.id ? 'bg-slate-900 text-white' : 'bg-gray-100'}`}>{item.title}{!item.visible && ' (oculta)'}</button>)}</nav>
    <nav aria-label="Blocos da página" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2">{page?.sections.toSorted((a,b) => a.sort_order - b.sort_order).map(item => <button type="button" key={item.id} onClick={() => setActiveSectionId(item.id)} className={`shrink-0 rounded px-3 py-2 text-xs ${section?.id === item.id ? 'bg-blue-100 text-blue-900' : 'bg-gray-50'}`}>{item.title}{!item.visible && ' (oculto)'}</button>)}</nav>
    <div className="flex-1 overflow-y-auto p-4">{page && section ? <SectionEditor key={`${section.id}-${selectedProductId}`} pageId={page.id} section={section} selectedProduct={product} products={products} /> : <p className="p-4 text-sm text-gray-500">Adicione páginas e blocos pelo gerenciador de páginas.</p>}</div>
  </div>
}

function SectionEditor({ pageId, section, selectedProduct, products }: { pageId: string; section: PageSection; selectedProduct: Product | null; products: Product[] }) {
  const { updateSection, updateSectionContent, updateProductData, contact } = useEditorStore()
  const config = section.config
  const product = sectionProduct(section, selectedProduct, products)
  const source = sectionDataSource(section)
  const content = sectionContent(section, product)
  const setConfig = (patch: DataRecord) => updateSection(pageId, section.id, { config: { ...config, ...patch } })
  const setContent = (field: string, value: unknown) => {
    const path = productPath(section.type, field)
    if (source === 'product') {
      if (product && path) updateProductData(product.id, path, value)
    } else updateSectionContent(pageId, section.id, { ...record(section.content), [field]: value })
  }
  const supportsBinding = !['blank_spacer', 'comparison_grid', 'contact_footer', 'custom_table', 'single_image'].includes(section.type)
  const technicalKind = section.type in TECHNICAL_TABLES ? section.type as keyof typeof TECHNICAL_TABLES : null
  const technical = technicalKind ? TECHNICAL_TABLES[technicalKind] : null
  const disabled = supportsBinding && source === 'product' && !product
  return <div className="space-y-5">
    <Field label="Título do bloco" value={section.title} onChange={title => updateSection(pageId, section.id, { title })} />
    <Toggle label="Exibir bloco no documento" checked={section.visible} onChange={visible => updateSection(pageId, section.id, { visible })} />
    {supportsBinding && <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
      <label className="block space-y-1 text-xs font-semibold">Origem dos dados<select className={inputClass} value={source} onChange={event => setConfig({ dataSource: event.target.value })}><option value="product">Cadastro do produto (vinculado)</option><option value="section">Conteúdo editorial deste bloco</option></select></label>
      {source === 'product' && <label className="block space-y-1 text-xs">Produto vinculado<select className={inputClass} value={formatValue(config.productId)} onChange={event => setConfig({ productId: event.target.value })}><option value="">Acompanhar produto selecionado</option>{products.map(item => <option key={item.id} value={item.id}>{item.sku} — {item.name}</option>)}</select></label>}
      <p className="text-[11px] text-blue-900">{source === 'product' ? `As alterações abaixo atualizam somente o cadastro de ${product?.sku ?? 'um produto não encontrado'}. O bloco não guarda cópias das especificações.` : 'As alterações ficam somente neste bloco; os produtos permanecem intactos.'}</p>
    </div>}
    {disabled && <p role="alert" className="rounded bg-red-50 p-3 text-xs text-red-800">Selecione um produto existente antes de editar este bloco.</p>}
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-50">
      {section.type === 'hero_banner' && <>
        <Field label="Título comercial" value={content.title} onChange={value => setContent('title', value)} />
        <Field label="Subtítulo" value={content.subtitle} onChange={value => setContent('subtitle', value)} />
        <Field label="Descrição e aplicações" value={content.overview} multiline onChange={value => setContent('overview', value)} />
        <ListEditor items={strings(content.features)} onChange={value => setContent('features', value)} />
        <ImageUploader images={imageItems(content.images).map(image => image.url)} onChange={value => setContent('images', value)} maxImages={3} productSku={product?.sku} />
        <div className="grid grid-cols-2 gap-3">{[['showLogo','Exibir logo'],['showSubtitle','Exibir subtítulo'],['showImage','Exibir imagens']].map(([key,label]) => <Toggle key={key} label={label} checked={config[key] !== false} onChange={value => setConfig({ [key]: value })} />)}</div>
        <Field label="Altura da imagem (px)" type="number" min={60} max={500} value={config.imageHeightPx ?? 160} onChange={value => setConfig({ imageHeightPx: Math.max(60, Math.min(500, Number(value))) })} />
        <label className="block text-xs">Layout da capa<select className={inputClass} value={formatValue(config.imageLayout ?? 'auto')} onChange={event => setConfig({ imageLayout: event.target.value })}><option value="auto">Texto e foto em colunas</option><option value="stacked">Texto e foto empilhados</option></select></label>
        <label className="block text-xs">Enquadramento<select className={inputClass} value={formatValue(config.imageFit ?? 'contain')} onChange={event => setConfig({ imageFit: event.target.value })}><option value="contain">Mostrar imagem completa</option><option value="cover">Preencher área (recorta)</option></select></label>
      </>}
      {section.type === 'text_block' && <Field label="Texto do bloco" value={content.text} multiline onChange={value => setContent('text', value)} />}
      {section.type === 'features_list' && <><ListEditor items={strings(content.items)} onChange={value => setContent('items', value)} /><Field label="Quantidade máxima de destaques" type="number" min={1} max={100} value={config.maxItems ?? 8} onChange={value => setConfig({ maxItems: Math.max(1, Number(value)) })} /><Field label="Colunas" type="number" min={1} max={4} value={config.columns ?? 1} onChange={value => setConfig({ columns: Math.max(1, Math.min(4, Number(value))) })} /></>}
      {technical && <><Toggle label="Exibir cabeçalho da tabela" checked={config.showHeader !== false} onChange={showHeader => setConfig({ showHeader })} /><div className="grid grid-cols-2 gap-2">{technical.labels.map((label,index) => <Field key={index} label={`Nome da coluna ${index+1}`} value={strings(config.columns)[index] ?? label} onChange={value => setConfig({ columns: technical.labels.map((old,i) => i === index ? value : strings(config.columns)[i] ?? old) })} />)}</div><RowEditor keys={technical.keys} labels={technical.labels} values={rows(content.rows)} onChange={value => setContent('rows', value)} /></>}
      {section.type === 'custom_table' && <CustomTableEditor section={section} pageId={pageId} />}
      {section.type === 'comparison_grid' && <><p className="text-xs text-gray-600">Selecione os modelos; nenhum selecionado compara todos. As linhas incluem os parâmetros de todos os modelos.</p>{products.map(item => <Toggle key={item.id} label={`${item.sku} — ${item.name}`} checked={strings(config.models).includes(item.id)} onChange={checked => setConfig({ models: checked ? [...strings(config.models), item.id] : strings(config.models).filter(id => id !== item.id) })} />)}</>}
      {section.type === 'ordering_codes' && <RowEditor keys={['segment','description','options']} labels={['Segmento / código','Descrição','Opções separadas por vírgula']} values={rows(content.segments)} onChange={value => setContent('segments', value)} />}
      {section.type === 'image_gallery' && <>
        <Field label="Colunas da galeria" type="number" min={1} max={4} value={config.columns ?? 3} onChange={value => setConfig({ columns: Math.max(1, Math.min(4, Number(value))) })} />
        <Toggle label="Mostrar legendas" checked={config.showCaptions !== false} onChange={showCaptions => setConfig({ showCaptions })} />
        <ImageUploader images={imageItems(content.images).map(image => image.url)} onChange={urls => setContent('images', source === 'product' ? urls : urls.map(url => imageItems(content.images).find(image => image.url === url) ?? { url, caption: '' }))} maxImages={12} productSku={product?.sku} />
        {source === 'section' && imageItems(content.images).map((image,index) => <Field key={image.url} label={`Legenda da imagem ${index+1}`} value={image.caption} onChange={caption => setContent('images', imageItems(content.images).map((old,i) => i === index ? {...old,caption} : old))} />)}
      </>}
      {section.type === 'single_image' && <>
        <ImageUploader images={formatValue(content.imageUrl) ? [formatValue(content.imageUrl)] : []} onChange={urls => updateSectionContent(pageId, section.id, { ...record(section.content), imageUrl: urls[0] ?? '', url: urls[0] ?? '' })} maxImages={1} label="Foto ou diagrama deste bloco" productSku={product?.sku} />
        <Field label="Legenda" value={content.caption ?? config.caption} onChange={caption => updateSectionContent(pageId, section.id, { ...record(section.content), caption })} />
        <Field label="Altura máxima (mm)" type="number" min={10} max={220} value={config.maxHeightMm ?? 60} onChange={value => setConfig({ maxHeightMm: Math.max(10, Math.min(220, Number(value))) })} />
        <label className="block text-xs">Alinhamento<select className={inputClass} value={formatValue(config.align ?? 'center')} onChange={event => setConfig({ align: event.target.value })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label>
      </>}
      {section.type === 'blank_spacer' && <Field label="Altura do espaço (mm)" type="number" min={0} max={250} value={config.heightMm ?? 20} onChange={value => setConfig({ heightMm: Math.max(0, Math.min(250, Number(value))) })} />}
      {section.type === 'contact_footer' && <><Toggle label="Usar dados de contato específicos neste bloco" checked={Boolean(config.overrideContact)} onChange={overrideContact => setConfig({ overrideContact })} />{config.overrideContact ? [['companyName','Empresa'],['website','Website'],['phone','Telefone'],['email','E-mail'],['address','Endereço']].map(([key,label]) => <Field key={key} label={label} value={record(section.content)[key] ?? contact[key]} onChange={value => updateSectionContent(pageId, section.id, { ...record(section.content), [key]: value })} />) : <p className="text-xs text-gray-600">O rodapé acompanha os dados da aba Marca: {contact.companyName}.</p>}</>}
    </fieldset>
  </div>
}

function CustomTableEditor({ section, pageId }: { section: PageSection; pageId: string }) {
  const { updateSection } = useEditorStore()
  const columns = strings(section.config.columns)
  const content = record(section.content)
  const values = Array.isArray(content.rows) ? content.rows : []
  const normalized = values.map(row => Object.fromEntries(columns.map((column, i) => [column, tableCells(row, columns)[i]])))
  const [columnText, setColumnText] = useState(columns.join(' | '))
  const [error, setError] = useState('')
  const applyColumns = () => {
    const next = columnText.split('|').map(item => item.trim())
    if (next.some(item => !item) || new Set(next).size !== next.length || next.length > 12) { setError('Use entre 1 e 12 títulos únicos, separados por |.'); return }
    updateSection(pageId, section.id, { config: { ...section.config, columns: next }, content: { ...content, rows: values.map(row => Object.fromEntries(next.map((column,index) => [column, tableCells(row, columns)[index] ?? '']))) } })
    setError('')
  }
  return <div className="space-y-3"><Field label="Títulos das colunas (separar por |; a ordem das posições é preservada)" value={columnText} onChange={setColumnText} /><button type="button" onClick={applyColumns} className="rounded bg-slate-900 px-3 py-2 text-xs text-white">Aplicar colunas</button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}<RowEditor keys={columns} labels={columns} values={normalized} onChange={newRows => updateSection(pageId, section.id, { content: { ...content, rows: newRows } })} /></div>
}
