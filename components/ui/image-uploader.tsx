'use client'

import React, { useRef, useState, useCallback } from 'react'
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react'
import { fileToDataUrl, uploadImage } from '../../lib/supabase/api'
import { isSupabaseConfigured } from '../../lib/supabase/client'

interface ImageUploaderProps {
  /** Current image URLs */
  images: string[]
  /** Callback when images change */
  onChange: (images: string[]) => void
  /** Maximum number of images allowed */
  maxImages?: number
  /** Label shown above the uploader */
  label?: string
  /** CSS class for the container */
  className?: string
  /** Product SKU for organizing uploads */
  productSku?: string
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onChange,
  maxImages = 6,
  label = 'Imagens do Produto',
  className = '',
  productSku = 'unknown',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(async (files: FileList) => {
    const remaining = maxImages - images.length
    if (remaining <= 0) return

    setIsUploading(true)
    const newImages = [...images]

    const fileArray = Array.from(files).slice(0, remaining)

    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue

      try {
        // Try Supabase Storage first, fallback to Data URL
        if (isSupabaseConfigured()) {
          const path = `products/${productSku}/${Date.now()}-${file.name}`
          const publicUrl = await uploadImage(file, path)
          if (publicUrl) {
            newImages.push(publicUrl)
            continue
          }
        }

        // Fallback: convert to Data URL (works offline, stored in localStorage)
        const dataUrl = await fileToDataUrl(file)
        newImages.push(dataUrl)
      } catch (err) {
        console.error('[ImageUploader] Failed to process file:', file.name, err)
      }
    }

    onChange(newImages)
    setIsUploading(false)
  }, [images, maxImages, onChange, productSku])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    const updated = [...images]
    const temp = updated[index]
    updated[index] = updated[target]
    updated[target] = temp
    onChange(updated)
  }

  const handleRemove = (index: number) => {
    const updated = images.filter((_, i) => i !== index)
    onChange(updated)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-[#525252]">
          {label} ({images.length}/{maxImages})
        </label>
        {images.length > 1 && (
          <span className="text-[10px] text-[#2563EB]">
            Use as setas para reordenar / definir principal
          </span>
        )}
      </div>

      {/* Thumbnails Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {images.map((src, i) => (
            <div
              key={i}
              className="relative group border border-[#D4D4D4] bg-[#F8FAFC] aspect-square flex flex-col items-center justify-center p-1 overflow-hidden rounded-xs shadow-2xs"
            >
              <img
                src={src}
                alt={`Imagem ${i + 1}`}
                className="max-w-full max-h-full object-contain"
              />

              {/* Position Badge */}
              <span className={`absolute top-1 left-1 text-[9px] px-1.5 py-0.5 font-bold uppercase rounded-xs shadow-2xs ${
                i === 0 ? 'bg-[#003366] text-white' : 'bg-[#1E293B]/80 text-white'
              }`}>
                {i === 0 ? '1ª Principal' : `${i + 1}ª Foto`}
              </span>

              {/* Controls Bar */}
              <div className="absolute inset-x-0 bottom-0 bg-black/70 p-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(i, -1)}
                    disabled={i === 0}
                    title="Mover para a esquerda"
                    className="p-1 text-white hover:bg-white/20 disabled:opacity-30 rounded-xs text-xs font-bold"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(i, 1)}
                    disabled={i === images.length - 1}
                    title="Mover para a direita"
                    className="p-1 text-white hover:bg-white/20 disabled:opacity-30 rounded-xs text-xs font-bold"
                  >
                    →
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="p-1 text-red-400 hover:text-red-300 hover:bg-white/20 rounded-xs"
                  title="Remover imagem"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop Zone / Upload Button */}
      {images.length < maxImages && (
        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed cursor-pointer transition-colors ${
            dragOver
              ? 'border-[#2563EB] bg-[#EFF6FF]'
              : 'border-[#D4D4D4] bg-[#FAFAFA] hover:border-[#A3A3A3] hover:bg-[#F5F5F5]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          {isUploading ? (
            <>
              <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin" />
              <span className="text-xs text-[#525252]">Enviando...</span>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                <Upload className="w-4 h-4 text-[#2563EB]" />
              </div>
              <span className="text-xs text-[#525252]">
                Arraste fotos ou clique para enviar
              </span>
              <span className="text-[10px] text-[#A3A3A3]">
                JPG, PNG, WebP • máx. {maxImages - images.length} imagem(ns)
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
