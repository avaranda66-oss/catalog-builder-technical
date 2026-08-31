'use client'

import React, { useRef, useState } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { parseExcelFile, ParsedExcelResult, ImportField, IMPORT_FIELDS } from '../../features/import/excel-parser'
import { ImportedProductSchema, errorMessage } from '../../lib/import/schema'
import { Upload, X } from 'lucide-react'

interface ExcelImportModalProps { isOpen: boolean; onClose: () => void }

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ isOpen, onClose }) => {
  const [file, setFile] = useState<File | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [parsed, setParsed] = useState<ParsedExcelResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [skipInvalid, setSkipInvalid] = useState(false)
  const requestId = useRef(0)
  if (!isOpen) return null

  const close = () => { requestId.current++; setFile(null); setBuffer(null); setParsed(null); setError(null); setReviewed(false); setSkipInvalid(false); setProcessing(false); onClose() }
  const parse = async (data: ArrayBuffer, selectedFile: File, sheetName?: string, columnMapping?: Record<string, ImportField>) => {
    const id = ++requestId.current
    setProcessing(true); setError(null); setReviewed(false); setSkipInvalid(false)
    try {
      const state = useEditorStore.getState()
      if (!state.catalog) throw new Error('Abra um catálogo antes de importar.')
      const result = await parseExcelFile(data, state.catalog.id, { fileName: selectedFile.name, sheetName, columnMapping, existingSkus: state.products.map((product) => product.sku) })
      if (id === requestId.current) setParsed(result)
    } catch (cause) { if (id === requestId.current) { setParsed(null); setError(errorMessage(cause)) } }
    finally { if (id === requestId.current) setProcessing(false) }
  }
  const selectFile = async (selected?: File) => {
    if (!selected) return
    setParsed(null); setError(null); setFile(selected)
    if (selected.size > 5 * 1024 * 1024 || !/\.(xlsx|csv)$/i.test(selected.name)) { setError('Selecione XLSX ou CSV de até 5 MB.'); return }
    try { const data = await selected.arrayBuffer(); setBuffer(data); await parse(data, selected) }
    catch (cause) { setError(errorMessage(cause)) }
  }
  const confirm = () => {
    if (!parsed || !reviewed || processing || (parsed.errors.length && !skipInvalid)) return
    const state = useEditorStore.getState()
    if (!state.catalog) return
    if (!state.localMode && (!state.currentUser || state.currentUser.role === 'viewer')) { setError('Entre com uma conta de edição ou habilite o modo local.'); return }
    const products = parsed.products.map((product) => ImportedProductSchema.parse({ sku: product.sku, name: product.name, family: product.family, data: product.data }))
    if (products.some((candidate) => state.products.some((product) => product.sku.trim().toUpperCase() === candidate.sku.toUpperCase()))) { setError('Um SKU foi cadastrado durante a revisão. Reprocesse a planilha.'); return }
    for (const [index, product] of products.entries()) {
      state.addProduct({ ...product, catalog_id: state.catalog.id, status: 'draft', sort_order: state.products.length + index })
      if (useEditorStore.getState().lastError) { setError(useEditorStore.getState().lastError); return }
    }
    state.addAuditLog(`Importou ${products.length} produtos da planilha`, 'product', file?.name || 'planilha', `${parsed.errors.length} linhas inválidas não importadas; fonte e metadados preservados.`)
    close()
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="excel-title">
      <div className="bg-white border-2 border-slate-900 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between"><h2 id="excel-title" className="font-bold text-sm">Importar planilha com mapeamento</h2><button onClick={close} aria-label="Fechar"><X className="w-5 h-5" /></button></div>
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          <p>XLSX ou CSV UTF-8, até 5 MB e 5.000 produtos por aba. Campos ausentes permanecem vazios. SKU e nome são obrigatórios; SKUs existentes não são substituídos.</p>
          <label className="border-2 border-dashed p-5 flex gap-2 justify-center cursor-pointer"><Upload className="w-5 h-5" />{file?.name || 'Selecionar planilha'}<input type="file" accept=".xlsx,.csv" disabled={processing} className="hidden" onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = '' }} /></label>
          {processing && <p role="status">Validando arquivo e mapeando colunas…</p>}
          {error && <p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
          {parsed && <>
            <label>Aba selecionada <select value={parsed.selectedSheet} disabled={processing} className="border p-2 ml-2" onChange={(event) => { if (buffer && file) void parse(buffer, file, event.target.value) }}>{parsed.sheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>
            <details open className="border p-3"><summary className="font-semibold cursor-pointer">Mapeamento das colunas</summary><div className="grid sm:grid-cols-2 gap-2 mt-3">{parsed.headers.filter(Boolean).map((header) => <label key={header} className="flex justify-between items-center gap-2">{header}<select disabled={processing} value={parsed.mapping[header] || 'metadata'} className="border p-1 max-w-40" onChange={(event) => { if (buffer && file) void parse(buffer, file, parsed.selectedSheet, { ...parsed.mapping, [header]: event.target.value as ImportField }) }}>{IMPORT_FIELDS.map((field) => <option key={field} value={field}>{field === 'metadata' ? 'Preservar em metadados' : field}</option>)}</select></label>)}</div></details>
            {parsed.warnings.map((warning) => <p key={warning} className="bg-amber-50 p-2 text-amber-900">{warning}</p>)}
            {!!parsed.errors.length && <div className="bg-red-50 p-3 text-red-900 space-y-1">{parsed.errors.slice(0, 50).map((message, index) => <p key={index}>{message}</p>)}{parsed.errors.length > 50 && <p>Mais {parsed.errors.length - 50} erros.</p>}<label className="flex gap-2 pt-2"><input type="checkbox" checked={skipInvalid} onChange={(event) => setSkipInvalid(event.target.checked)} />Entendi os erros e quero importar somente as {parsed.products.length} linhas válidas.</label></div>}
            <p className="font-semibold">Prévia: {parsed.products.length} produtos válidos (primeiros 20 abaixo)</p>
            <table className="w-full border-collapse"><thead><tr><th className="border p-2 text-left">SKU</th><th className="border p-2 text-left">Nome</th><th className="border p-2 text-left">Família</th></tr></thead><tbody>{parsed.products.slice(0, 20).map((product) => <tr key={product.sku}><td className="border p-2">{product.sku}</td><td className="border p-2">{product.name}</td><td className="border p-2">{product.family || 'Não informada'}</td></tr>)}</tbody></table>
            <label className="flex gap-2 bg-slate-50 p-3"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />Revisei o mapeamento e autorizo criar os produtos como rascunhos técnicos.</label>
          </>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2"><button onClick={close} className="border px-3 py-2 text-xs">Cancelar</button><button onClick={confirm} disabled={!parsed?.products.length || !reviewed || processing || (!!parsed?.errors.length && !skipInvalid)} className="bg-blue-700 text-white text-xs px-4 py-2 disabled:opacity-40">Importar {parsed?.products.length || 0} rascunhos</button></div>
      </div>
    </div>
  )
}
