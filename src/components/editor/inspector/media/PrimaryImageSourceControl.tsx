// src/components/editor/inspector/media/PrimaryImageSourceControl.tsx
// Componente compartilhado de controle de fonte fotográfica primária (CORE.E5B).
// Reutilizado por ImageInspector e HeroBannerInspector.
// Mantém as primitives CORE.E3 puras e store-agnostic, centralizando a integração de mídia.

import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { ProductAssetRole } from '../../../../domain/asset.schema';
import { useMediaStore } from '../../../../stores/useMediaStore';
import { useAssetStore } from '../../../../stores/useAssetStore';
import {
  PrimaryImageTarget,
  PrimaryImagePatch,
  resolvePrimaryImageSource,
  setPrimaryImageAsset,
  setPrimaryImageUrl,
  removePrimaryImage
} from '../../../../domain/primary-image.engine';
import {
  InspectorField,
  InspectorTextInput,
  InspectorActionRow
} from '../components';

export interface PrimaryImageSourceControlProps {
  block: PrimaryImageTarget;
  onPatch: (patch: PrimaryImagePatch) => void;
  uploadRole?: ProductAssetRole;
  uploadCaption?: string;
  isPrimary?: boolean;
  urlInputId?: string;
}

export const PrimaryImageSourceControl: React.FC<PrimaryImageSourceControlProps> = ({
  block,
  onPatch,
  uploadRole = 'application',
  uploadCaption,
  isPrimary,
  urlInputId = 'image-field-url'
}) => {
  const openGallery = useMediaStore((state) => state.openGallery);
  const uploadAndLinkAsset = useAssetStore((state) => state.uploadAndLinkAsset);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const source = resolvePrimaryImageSource(block);

  // Rascunho local de URL externa com commit idempotente (sem dependência de re-render)
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
    onPatch(setPrimaryImageUrl(trimmed));
  };

  const handleSelectAsset = (assetId: string) => {
    onPatch(setPrimaryImageAsset(assetId));
  };

  const handleSelectDirectUrl = (url: string) => {
    onPatch(setPrimaryImageUrl(url));
  };

  const handleRemove = () => {
    onPatch(removePrimaryImage());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await uploadAndLinkAsset(file, {
        role: uploadRole,
        isPrimary,
        caption: uploadCaption
      });
      if (res?.assetId) {
        handleSelectAsset(res.assetId);
      }
    } catch (err) {
      console.error('Falha no upload da imagem primária:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Indicador de Fonte Autoritativa Ativa */}
      <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-700">Fonte Ativa:</span>
          <span className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded uppercase font-bold">
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
            Nenhuma fotografia selecionada.
          </p>
        )}
      </div>

      {/* Botões de Ação: Acervo e Upload */}
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
          className="px-3 py-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Abrir Acervo</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <Upload className="w-3.5 h-3.5 text-slate-600" />
          <span>Upload do PC</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Campo de URL Externa com Draft e Commit no Blur/Enter */}
      <InspectorField label="Ou Cole a URL da Imagem">
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
          placeholder="https://exemplo.com/fotografia.png"
        />
      </InspectorField>

      {/* Ação Explícita de Remoção */}
      {source.kind !== 'none' && (
        <InspectorActionRow
          actions={[
            {
              label: 'Remover Imagem',
              onClick: handleRemove,
              variant: 'danger',
              title: 'Remover fotografia e limpar todos os fallbacks'
            }
          ]}
        />
      )}
    </div>
  );
};
