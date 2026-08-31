'use client'

import React, { useRef, useState } from 'react'
import { Globe, X, Loader2 } from 'lucide-react'
import { useEditorStore } from '../../features/editor/editor-store'
import { authenticatedAiFetch } from '../../lib/ai/client'
import { collectTranslatableFields, TranslationSchema } from '../../lib/ai/contracts'
import { ProductTranslation } from '../../lib/ai/translations'
import { errorMessage } from '../../lib/import/schema'

interface TranslationModalProps { isOpen: boolean; onClose: () => void }
interface TranslationDraft { productId: string; sku: string; locale: string; baseVersion: number; sourceFields: Record<string, string>; translation: ProductTranslation; accepted: boolean }
const LANGUAGES = [{ code: 'en', label: 'English' }, { code: 'pt', label: 'Português' }, { code: 'es', label: 'Español' }, { code: 'fr', label: 'Français' }, { code: 'de', label: 'Deutsch' }, { code: 'it', label: 'Italiano' }]

export const TranslationModal: React.FC<TranslationModalProps> = ({ isOpen, onClose }) => {
  const [locale, setLocale] = useState('en')
  const [all, setAll] = useState(false)
  const [pageTitles, setPageTitles] = useState(true)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [drafts, setDrafts] = useState<TranslationDraft[]>([])
  const controller = useRef<AbortController | null>(null)
  if (!isOpen) return null

  const close = () => { controller.current?.abort(); setDrafts([]); setErrors([]); setProgress(''); setLoading(false); onClose() }
  const generate = async () => {
    const state = useEditorStore.getState()
    const selected = all ? state.products : state.products.filter((product) => product.id === state.selectedProductId)
    setErrors([]); setDrafts([])
    if (!selected.length || selected.length > 10) { setErrors(['Selecione entre 1 e 10 produtos por lote. Para catálogos maiores, traduza o produto selecionado.']); return }
    const abort = new AbortController(); controller.current = abort
    setLoading(true)
    try {
      for (const [index, product] of selected.entries()) {
        if (abort.signal.aborted) break
        setProgress(`Gerando rascunho ${index + 1}/${selected.length}: ${product.sku}`)
        try {
          const response = await authenticatedAiFetch('/api/ai/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45_000)]), body: JSON.stringify({ product, targetLanguage: locale, pages: pageTitles ? state.pages.map((page) => ({ id: page.id, title: page.title })) : [] }) })
          const body = await response.json() as { translation?: Record<string, unknown>; productId?: string; baseVersion?: number }
          const translated = TranslationSchema.parse({ fields: body.translation?.fields, pageTitles: body.translation?.pageTitles })
          if (body.productId !== product.id || body.baseVersion !== product.version) throw new Error('O serviço retornou uma revisão incompatível.')
          if (!abort.signal.aborted) setDrafts((previous) => [...previous, { productId: product.id, sku: product.sku, locale, baseVersion: product.version, sourceFields: collectTranslatableFields(product.data), translation: { ...translated, sourceFields: collectTranslatableFields(product.data), sourcePageTitles: pageTitles ? Object.fromEntries(state.pages.map((page) => [page.id, page.title])) : {}, sourceVersion: product.version, status: 'draft', createdAt: new Date().toISOString() }, accepted: false }])
        } catch (cause) { if (!abort.signal.aborted) setErrors((previous) => [...previous, `${product.sku}: ${errorMessage(cause)}`]) }
      }
    } finally { if (!abort.signal.aborted) { setLoading(false); setProgress('Revise os rascunhos abaixo. Falhas não alteraram produtos.') } }
  }
  const apply = () => {
    const selected = drafts.filter((draft) => draft.accepted)
    if (!selected.length) return
    const state = useEditorStore.getState()
    if (!state.localMode && (!state.currentUser || state.currentUser.role === 'viewer')) { setErrors(['Entre com uma conta de edição.']); return }
    for (const draft of selected) {
      const current = state.products.find((product) => product.id === draft.productId)
      if (!current || current.version !== draft.baseVersion || JSON.stringify(collectTranslatableFields(current.data)) !== JSON.stringify(draft.sourceFields)) { setErrors([`O produto ${draft.sku} mudou durante a tradução. Gere novamente; nenhum rascunho deste lote foi aplicado.`]); return }
    }
    for (const draft of selected) {
      state.updateProductData(draft.productId, `translations.${draft.locale}`, draft.translation)
      if (useEditorStore.getState().lastError) { setErrors([useEditorStore.getState().lastError || 'Não foi possível aplicar a tradução.']); return }
    }
    state.addAuditLog(`Armazenou ${selected.length} traduções em rascunho`, 'product', locale, 'Textos originais preservados. Números/unidades verificados; revisão editorial selecionada pelo usuário.')
    close()
  }
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="translation-title">
      <div className="bg-white border border-slate-300 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between"><h2 id="translation-title" className="font-bold text-sm flex gap-2"><Globe className="w-4 h-4" />Traduções por idioma, com revisão</h2><button aria-label="Fechar" onClick={close}><X className="w-5 h-5" /></button></div>
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <p>Os originais e as especificações permanecem intactos. Cada idioma é salvo separadamente como rascunho. A tradução não certifica a conformidade técnica do produto.</p>
          <label>Idioma <select disabled={loading || drafts.length > 0} value={locale} onChange={(event) => setLocale(event.target.value)} className="border p-2 ml-2">{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
          <label className="flex gap-2"><input type="checkbox" disabled={loading} checked={all} onChange={(event) => setAll(event.target.checked)} />Traduzir todos os produtos (máximo de 10 por lote)</label>
          <label className="flex gap-2"><input type="checkbox" disabled={loading} checked={pageTitles} onChange={(event) => setPageTitles(event.target.checked)} />Incluir títulos das páginas, preservando os títulos originais</label>
          <button onClick={() => void generate()} disabled={loading} className="bg-blue-700 text-white p-2 disabled:opacity-40 flex gap-2">{loading && <Loader2 className="w-4 h-4 animate-spin" />}Gerar rascunhos para revisar</button>
          {progress && <p role="status">{progress}</p>}
          {errors.map((message, index) => <p key={index} role="alert" className="bg-red-50 text-red-800 p-2">{message}</p>)}
          {drafts.map((draft) => <details key={draft.productId} className="border p-3" open><summary className="font-semibold cursor-pointer">{draft.sku} — {draft.locale}</summary>
            <table className="w-full mt-2 border-collapse"><thead><tr><th className="border p-2 text-left">Original</th><th className="border p-2 text-left">Tradução proposta</th></tr></thead><tbody>{Object.entries(draft.translation.fields).map(([path, value]) => <tr key={path}><td className="border p-2 align-top"><span className="text-slate-500 block">{path}</span>{draft.sourceFields[path]}</td><td className="border p-2 align-top">{value}</td></tr>)}</tbody></table>
            <label className="flex gap-2 p-3 bg-slate-50 mt-2"><input type="checkbox" checked={draft.accepted} onChange={(event) => setDrafts((previous) => previous.map((item) => item.productId === draft.productId ? { ...item, accepted: event.target.checked } : item))} />Revisei esta tradução e quero armazená-la como rascunho.</label>
          </details>)}
        </div>
        <div className="p-4 border-t flex justify-end gap-2"><button onClick={close} className="border px-3 py-2 text-xs">Cancelar</button><button onClick={apply} disabled={loading || !drafts.some((draft) => draft.accepted)} className="bg-blue-700 text-white px-4 py-2 text-xs disabled:opacity-40">Salvar traduções selecionadas</button></div>
      </div>
    </div>
  )
}
