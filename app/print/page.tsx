'use client'

import { useEffect, useRef, useState } from 'react'
import { CatalogPages } from '@/components/preview/catalog-pages'
import { preflightDocument, preflightLayout, readPrintSnapshot, waitForPrintAssets, type PreflightIssue, type PrintSnapshot } from '@/lib/pdf/print-document'

export default function PrintPage() {
  const [snapshot, setSnapshot] = useState<PrintSnapshot | null>(null)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState<PreflightIssue[]>([])
  const [ready, setReady] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const loaded = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    Promise.resolve().then(() => {
      try {
        const documentId = new URLSearchParams(window.location.search).get('document') ?? ''
        const data = readPrintSnapshot(sessionStorage, documentId)
        document.title = `${data.catalog?.name ?? 'Catálogo'} — PDF`
        setSnapshot(data)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a impressão.') }
    })
  }, [])
  useEffect(() => {
    if (!snapshot || !root.current) return
    let cancelled = false
    const element = root.current
    waitForPrintAssets(element).then(() => {
      if (cancelled) return
      const checks = [...preflightDocument(snapshot), ...preflightLayout(element)]
      setIssues(checks)
      setReady(true)
      if (!checks.length) window.print()
    })
    return () => { cancelled = true }
  }, [snapshot])
  const errors = issues.filter(issue => issue.severity === 'error')
  const warnings = issues.filter(issue => issue.severity === 'warning')
  return <main className="print-workspace min-h-screen bg-gray-200 p-4">
    <aside className="no-print mx-auto mb-5 max-w-3xl space-y-3 rounded border bg-white p-4 text-sm">
      <h1 className="font-bold">Preparação do PDF</h1>
      {error ? <p role="alert" className="text-red-800">{error}</p> : <>
        <p>{ready ? `${errors.length} erro(s), ${warnings.length} aviso(s).` : 'Carregando fontes, imagens e verificando paginação…'}</p>
        {snapshot && <p className="text-xs text-gray-600">Snapshot de {new Date(snapshot.createdAt).toLocaleString('pt-BR')}. Alterações no editor não modificam este documento.</p>}
        {issues.length > 0 && <ul className="max-h-64 list-disc space-y-1 overflow-auto pl-5">{issues.map((issue,index) => <li key={index} className={issue.severity === 'error' ? 'text-red-800' : 'text-amber-800'}>{issue.message}</li>)}</ul>}
        {warnings.length > 0 && !errors.length && <label className="flex items-center gap-2"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />Revisei os avisos e desejo continuar.</label>}
        <p className="text-xs text-gray-600">Na janela do navegador: papel A4, escala 100%, margens nenhuma, cabeçalhos e rodapés desativados, gráficos de fundo ativados.</p>
        <button type="button" disabled={!ready || !!errors.length || (!!warnings.length && !acknowledged)} onClick={() => window.print()} className="rounded bg-blue-800 px-4 py-2 text-white disabled:opacity-40">Imprimir / salvar PDF</button>
      </>}
    </aside>
    <div ref={root} className={!ready || errors.length ? 'print-blocked' : ''}>{snapshot && <CatalogPages pages={snapshot.pages} product={snapshot.products.find(product => product.id === snapshot.selectedProductId) ?? snapshot.products[0] ?? null} allProducts={snapshot.products} tokens={snapshot.designTokens} contact={snapshot.contact} locale={snapshot.catalog?.locale} />}</div>
  </main>
}
