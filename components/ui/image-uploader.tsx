'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Upload, X, Loader2 } from 'lucide-react'
import { fileToDataUrl, uploadImage } from '@/lib/supabase/api'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { IMAGE_TYPES, mediaUploadPath, validateImageFile } from '@/lib/catalog/media'

interface ImageUploaderProps {
  images: string[]
  onChange: (images: string[]) => void
  maxImages?: number
  label?: string
  className?: string
  productSku?: string
}

export function ImageUploader({ images, onChange, maxImages = 6, label = 'Imagens', className = '', productSku = 'produto' }: ImageUploaderProps) {
  const input = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [localMode, setLocalMode] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const upload = async (files: FileList | File[]) => {
    if (busy.current) return
    setError(''); setMessage('')
    if (!localMode && !isSupabaseConfigured()) { setError('A biblioteca em nuvem não está configurada. Selecione explicitamente o modo local para continuar offline.'); return }
    const remaining = maxImages - images.length
    if (remaining <= 0) { setError('Limite de imagens deste bloco atingido.'); return }
    if (files.length > remaining) { setError(`Selecione no máximo ${remaining} imagem(ns). Nenhum arquivo foi enviado.`); return }
    const fileList = Array.from(files)
    const invalid = fileList.map(file => validateImageFile(file, localMode)).filter(Boolean)
    if (invalid.length) { setError(invalid.join(' ')); return }
    busy.current = true; setUploading(true)
    const urls: string[] = []
    const failures: string[] = []
    try {
      for (const file of fileList) {
        try {
          const bitmap = await createImageBitmap(file)
          const pixels = bitmap.width * bitmap.height
          bitmap.close()
          if (pixels > 40_000_000) throw new Error('Imagem excede 40 megapixels.')
          const url = localMode ? await fileToDataUrl(file) : await uploadImage(file, mediaUploadPath(productSku, file.type, crypto.randomUUID()))
          if (!url) throw new Error('O servidor não confirmou o upload. Verifique sua sessão e permissões.')
          urls.push(url)
        } catch (cause) { failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'falha ao carregar imagem'}`) }
      }
      if (urls.length) { onChange([...images, ...urls]); setMessage(`${urls.length} imagem(ns) ${localMode ? 'adicionada(s) somente neste navegador' : 'enviada(s) à biblioteca'}.`) }
      if (failures.length) setError(failures.join(' '))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao guardar referências das imagens.') }
    finally { busy.current = false; setUploading(false) }
  }
  const move = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= images.length || busy.current) return
    const updated = [...images]
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    onChange(updated)
  }
  return <div className={`space-y-3 ${className}`}>
    <p className="text-xs font-semibold text-gray-700">{label} ({images.length}/{maxImages})</p>
    <label className="flex items-start gap-2 text-[11px] text-gray-600"><input type="checkbox" checked={localMode} disabled={uploading} onChange={event => setLocalMode(event.target.checked)} />Modo local explícito: guardar imagens neste navegador (até 500 KB cada; não compartilhadas com a equipe).</label>
    {images.some(url => url.startsWith('data:')) && <p className="rounded bg-amber-50 p-2 text-[11px] text-amber-900">Este bloco contém imagens locais. Envie os arquivos à biblioteca para compartilhar e reduzir o armazenamento do navegador.</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((src,index) => <figure key={`${src}-${index}`} className="overflow-hidden rounded border bg-gray-50 p-2">
      <Image src={src} alt={`${label} ${index + 1}`} width={180} height={130} unoptimized className="h-28 w-full object-contain" />
      <figcaption className="mt-2 flex items-center justify-between text-xs"><span>{index + 1}</span><button type="button" disabled={uploading || index === 0} aria-label={`Mover imagem ${index + 1} para esquerda`} onClick={() => move(index,-1)} className="disabled:opacity-25">←</button><button type="button" disabled={uploading || index === images.length-1} aria-label={`Mover imagem ${index+1} para direita`} onClick={() => move(index,1)} className="disabled:opacity-25">→</button><button type="button" disabled={uploading} aria-label={`Remover imagem ${index+1}`} onClick={() => onChange(images.filter((_,i) => i !== index))} className="text-red-700"><X size={14} /></button></figcaption>
    </figure>)}</div>
    {images.length < maxImages && <div onDragOver={event => { event.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={event => { event.preventDefault(); setDragOver(false); void upload(event.dataTransfer.files) }} className={`rounded border-2 border-dashed p-4 text-center ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
      <input ref={input} type="file" multiple accept={IMAGE_TYPES.join(',')} className="hidden" disabled={uploading} onChange={event => { if (event.target.files) void upload(event.target.files); event.target.value = '' }} />
      <button type="button" disabled={uploading} onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 text-xs font-semibold text-blue-800">{uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}{uploading ? 'Processando arquivos…' : 'Selecionar imagens ou arrastar aqui'}</button>
      <p className="mt-2 text-[10px] text-gray-500">JPEG, PNG, WebP · {localMode ? '500 KB' : '8 MB'} · até 40 megapixels</p>
    </div>}
    {message && <p role="status" className="text-xs text-green-800">{message}</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{error}</p>}
  </div>
}
