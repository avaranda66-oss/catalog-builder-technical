'use client'

import React, { useRef, useState } from 'react'
import { Upload, X, Loader2, AlertCircle } from 'lucide-react'
import { useEditorStore } from '../../features/editor/editor-store'
import { authenticatedAiFetch } from '../../lib/ai/client'
import { ImportedData, ImportedDataSchema, ImportedProductSchema, errorMessage } from '../../lib/import/schema'

interface PdfImporterModalProps { isOpen: boolean; onClose: () => void }
interface Candidate { sku: string; name: string; family: string; data: ImportedData }

export const PdfImporterModal: React.FC<PdfImporterModalProps> = ({ isOpen, onClose }) => {
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const requestId = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  if (!isOpen) return null

  const close = () => {
    requestId.current++
    setCandidate(null); setWarnings([]); setError(null); setReviewed(false); setProcessing(false)
    onClose()
  }
  const processFile = async (file?: File) => {
    if (!file || processing) return
    setCandidate(null); setError(null); setWarnings([]); setReviewed(false)
    if (!/\.pdf$/i.test(file.name) || file.size > 5 * 1024 * 1024) { setError('Selecione um PDF com até 5 MB.'); return }
    const id = ++requestId.current
    setProcessing(true)
    try {
      const form = new FormData(); form.append('file', file)
      const response = await authenticatedAiFetch('/api/ai/import-pdf', { method: 'POST', body: form })
      const result = await response.json() as { product?: { sku?: string; name?: string; family?: string; data?: unknown }; warnings?: unknown }
      const data = ImportedDataSchema.parse(result.product?.data)
      if (id !== requestId.current) return
      setCandidate({ sku: result.product?.sku || '', name: result.product?.name || '', family: result.product?.family || '', data })
      setWarnings(Array.isArray(result.warnings) ? result.warnings.filter((item): item is string => typeof item === 'string') : [])
    } catch (cause) { if (id === requestId.current) setError(errorMessage(cause)) }
    finally { if (id === requestId.current) setProcessing(false) }
  }
  const confirm = () => {
    if (!candidate || !reviewed) return
    const parsed = ImportedProductSchema.safeParse(candidate)
    if (!parsed.success) { setError('Preencha SKU e Nome e revise o formato dos dados.'); return }
    const state = useEditorStore.getState()
    if (!state.catalog) { setError('Abra um catálogo antes de importar.'); return }
    if (!state.localMode && (!state.currentUser || state.currentUser.role === 'viewer')) { setError('Entre com uma conta de edição para importar.'); return }
    if (state.products.some((product) => product.sku.toLocaleUpperCase() === candidate.sku.trim().toLocaleUpperCase())) { setError('Já existe um produto com este SKU. A importação não substitui produtos existentes.'); return }
    state.addProduct({ ...parsed.data, catalog_id: state.catalog.id, status: 'draft', sort_order: state.products.length })
    if (useEditorStore.getState().lastError) { setError(useEditorStore.getState().lastError); return }
    state.addAuditLog(`Importou texto do PDF ${candidate.data.source.document}`, 'pdf_import', candidate.sku, 'Rascunho revisado pelo usuário; fonte preservada, sem inferência de especificações ou layout.')
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="pdf-import-title">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="bg-slate-900 text-white flex justify-between items-center p-4">
          <h2 id="pdf-import-title" className="font-bold text-sm">Importar dados de PDF para revisão</h2>
          <button onClick={close} aria-label="Fechar importação"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          <p className="text-slate-600">Extração determinística de texto, sem IA generativa. PDF digitalizado, fontes especiais, imagens e layout original não são reproduzidos. Valores ausentes permanecem vazios.</p>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={(event) => { void processFile(event.target.files?.[0]); event.target.value = '' }} />
          <button disabled={processing} onClick={() => inputRef.current?.click()} className="w-full border-2 border-dashed border-slate-300 p-5 flex justify-center gap-2 disabled:opacity-50">
            {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {processing ? 'Extraindo texto do documento…' : 'Selecionar PDF (até 5 MB)'}
          </button>
          {error && <p role="alert" className="p-3 bg-red-50 border border-red-200 text-red-800">{error}</p>}
          {warnings.map((warning) => <p key={warning} className="p-3 bg-amber-50 text-amber-900 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{warning}</p>)}
          {candidate && <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['sku', 'name', 'family'] as const).map((field) => <label key={field} className="text-xs font-semibold">{({ sku: 'SKU (obrigatório)', name: 'Nome (obrigatório)', family: 'Família' })[field]}
                <input value={candidate[field]} onChange={(event) => { setCandidate({ ...candidate, [field]: event.target.value }); setReviewed(false) }} className="border border-slate-300 w-full p-2 mt-1" />
              </label>)}
            </div>
            <p className="text-xs text-slate-600">Fonte: {candidate.data.source.document}. Página não determinada pelo extrator. Campos ausentes: {candidate.data.source.missingFields.join(', ')}.</p>
            <table className="w-full text-xs border-collapse"><thead><tr><th className="text-left border p-2">Campo extraído</th><th className="text-left border p-2">Valor para revisão</th></tr></thead><tbody>
              {candidate.data.specs.map((spec, index) => <tr key={index}><td className="border p-2">{spec.param}</td><td className="border p-2"><input className="w-full p-1" value={spec.value} onChange={(event) => { const specs = candidate.data.specs.map((item, i) => i === index ? { ...item, value: event.target.value } : item); setCandidate({ ...candidate, data: { ...candidate.data, specs } }); setReviewed(false) }} /></td></tr>)}
              {!candidate.data.specs.length && <tr><td colSpan={2} className="border p-3 text-slate-500">Nenhuma especificação reconhecida. Cadastre manualmente a partir da fonte.</td></tr>}
            </tbody></table>
            {!!candidate.data.marketing?.features?.length && <ul className="list-disc pl-5 text-xs">{candidate.data.marketing.features.map((feature, index) => <li key={index}>{feature}</li>)}</ul>}
            <label className="flex items-start gap-2 p-3 bg-slate-50 text-xs"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />Revisei os dados contra o documento original. Criar como rascunho técnico; nenhuma certificação ou aprovação é inferida.</label>
          </>}
        </div>
        <div className="p-4 border-t flex justify-end gap-3"><button onClick={close} className="border px-3 py-2 text-xs">Cancelar</button><button onClick={confirm} disabled={!candidate || !reviewed || processing || !candidate.sku.trim() || !candidate.name.trim()} className="bg-blue-700 text-white px-4 py-2 text-xs font-semibold disabled:opacity-40">Criar produto em rascunho</button></div>
      </div>
    </div>
  )
}
