// src/components/editor/inspector/media/GalleryImageSourceControl.tsx
// Componente de controle de fonte fotográfica para itens de galeria (CORE.E6B).
// Mantém hierarquia canônica: assetId > url > none com commit idempotente e upload desacoplado.

import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { useMediaStore } from '../../../../stores/useMediaStore';
import { useAssetStore } from '../../../../stores/useAssetStore';
import {
  GalleryItem,
  resolveGalleryImageSource,
  setGalleryItemAsset,
  setGalleryItemUrl
} from '../../../../domain/gallery-image.engine';
import {
  InspectorField,
  InspectorTextInput,
  InspectorActionRow
} from '../components';

export interface GalleryImageSourceControlProps {
  item: GalleryItem;
  onPatchItem: (patchedItem: GalleryItem) => void;
  onRemoveSource: () => void;
  urlInputId?: string;
  uploadCaption?: string;
}

export const GalleryImageSourceControl: React.FC<GalleryImageSourceControlProps> = ({
  item,
  onPatchItem,
  onRemoveSource,
  urlInputId = 'gallery-item-url',
  uploadCaption
}) => {
  const openGallery = useMediaStore((state) => state.openGallery);
  const uploadAndLinkAsset = useAssetStore((state) => state.uploadAndLinkAsset);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const source = resolveGalleryImageSource(item);

  const persistedUrl = source.kind === 'url' ? source.url : '';
  const [localUrl, setLocalUrl] = useState<string>(persistedUrl);
  const lastCommittedUrlRef = useRef<string>(persistedUrl);

  useEffect(() => {
    const current = source.kind === 'url' ? source.url : '';
    setLocalUrl(current);
    lastCommittedUrlRef.current = current;
  }, [persistedUrl, source.kind]);

  const commitUrl = () => {
    const trimmed = localUrl.trim();
    if (!trimmed || trimmed === lastCommittedUrlRef.current) {
      return;
    }
    lastCommittedUrlRef.current = trimmed;
    onPatchItem(setGalleryItemUrl(item, trimmed));
  };

  const handleSelectAsset = (assetId: string) => {
    onPatchItem(setGalleryItemAsset(item, assetId));
  };

  const handleSelectDirectUrl = (url: string) => {
    onPatchItem(setGalleryItemUrl(item, url));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await uploadAndLinkAsset(file, {
        role: 'application',
        caption: uploadCaption || item.caption
      });
      if (res?.assetId) {
        handleSelectAsset(res.assetId);
      }
    } catch (err) {
      console.error('Falha no upload de imagem da galeria:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Indicador de Fonte Ativa */}
      <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-700">Fonte da Imagem:</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded uppercase font-bold">
            {source.kind}
          </span>
        </div>
        {source.kind === 'asset' && (
          <p className="text-[11px] text-slate-500 font-mono truncate">
            Asset ID: {source.assetId}
          </p>
        )}
        {source.kind === 'url' && (
          <p className="text-[11px] text-slate-500 truncate">
            URL: {source.url}
          </p>
        )}
        {source.kind === 'none' && (
          <p className="text-[11px] text-amber-700 font-medium">
            Nenhuma imagem vinculada a este item.
          </p>
        )}
      </div>

      {/* Botões: Acervo e Upload */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            openGallery((selection) => {
              if (typeof selection === 'string') {
                handleSelectDirectUrl(selection);
              } else if (selection?.assetId) {
                handleSelectAsset(selection.assetId);
              }
            }, null)
          }
          className="px-2.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Acervo</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-slate-600" />
          <span>Upload</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Input de URL com Draft e Commit Idempotente */}
      <InspectorField label="URL da Imagem">
        <InspectorTextInput
          id={urlInputId}
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          onBlur={commitUrl}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitUrl();
            }
          }}
          placeholder="https://exemplo.com/foto.jpg"
        />
      </InspectorField>

      {/* Botão de Limpar Fonte da Foto (preserva caption) */}
      {source.kind !== 'none' && (
        <InspectorActionRow
          actions={[
            {
              label: 'Limpar Imagem',
              onClick: onRemoveSource,
              variant: 'subtle',
              title: 'Remove a imagem deste item, preservando a legenda'
            }
          ]}
        />
      )}
    </div>
  );
};
