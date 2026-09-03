// src/components/editor/inspector/BottomHeaderInspector.tsx
// Inspector canônico para o bloco bottom_header (Rodapé Técnico Metrológico).
// Construído com as Primitives CORE.E3 e integrado ao domínio de paletas e contraste.

import React from 'react';
import { Building2, PhoneCall, Palette, Check } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  InspectorSection,
  InspectorField,
  InspectorTextInput
} from './components';
import {
  BOTTOM_HEADER_PALETTES,
  resolveBottomHeaderPaletteId,
  setBottomHeaderPalette,
  BottomHeaderPaletteId
} from '../../../domain/bottom-header.appearance';

export interface BottomHeaderInspectorProps {
  block: ContentBlock;
  pageId: string;
}

export const BottomHeaderInspector: React.FC<BottomHeaderInspectorProps> = ({
  block,
  pageId
}) => {
  const updateBlock = useCatalogStore((state) => state.updateBlock);
  const custom = block.customData || {};

  const handleFieldChange = (field: string, value: unknown) => {
    updateBlock(pageId, block.id, { [field]: value });
  };

  const handleCustomFieldChange = (field: string, value: unknown) => {
    updateBlock(pageId, block.id, {
      customData: {
        ...(block.customData || {}),
        [field]: value
      }
    });
  };

  const activePaletteId = resolveBottomHeaderPaletteId(block);

  const handlePaletteSelect = (paletteId: BottomHeaderPaletteId) => {
    const patch = setBottomHeaderPalette(block, paletteId);
    updateBlock(pageId, block.id, patch);
  };

  return (
    <div className="space-y-4">
      {/* 1. SEÇÃO CONTEÚDO */}
      <InspectorSection
        id="bottom-inspector-content"
        title="Dados Institucionais"
        icon={<Building2 className="w-4 h-4 text-blue-600" />}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <InspectorField
            htmlFor="bottom-field-badge-text"
            label="Selo / Certificação"
            description="Ex: PRESYS METROLOGIA, ISO 9001, RBC"
          >
            <InspectorTextInput
              id="bottom-field-badge-text"
              value={block.badgeText || ''}
              placeholder="PRESYS METROLOGIA"
              onChange={(e) => handleFieldChange('badgeText', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="bottom-field-title"
            label="Título da Empresa"
            description="Razão social ou marca institucional"
          >
            <InspectorTextInput
              id="bottom-field-title"
              value={block.title || ''}
              placeholder="PRESYS INSTRUMENTOS & SISTEMAS LTDA"
              onChange={(e) => handleFieldChange('title', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="bottom-field-subtitle"
            label="Subtítulo"
            description="Atuação metrológica ou frase corporativa"
          >
            <InspectorTextInput
              id="bottom-field-subtitle"
              value={block.subtitle || ''}
              placeholder="Soluções completas para calibração de processos"
              onChange={(e) => handleFieldChange('subtitle', e.target.value)}
            />
          </InspectorField>
        </div>
      </InspectorSection>

      {/* 2. SEÇÃO CONTATO */}
      <InspectorSection
        id="bottom-inspector-contact"
        title="Informações de Contato"
        icon={<PhoneCall className="w-4 h-4 text-emerald-600" />}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <InspectorField
            htmlFor="bottom-field-phone"
            label="Telefone Corporativo"
            description="Ex: +55 (11) 3038-1300"
          >
            <InspectorTextInput
              id="bottom-field-phone"
              value={typeof custom.phone === 'string' ? custom.phone : ''}
              placeholder="+55 (11) 3038-1300"
              onChange={(e) => handleCustomFieldChange('phone', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="bottom-field-email"
            label="E-mail de Contato / Vendas"
            description="Ex: vendas@presys.com.br"
          >
            <InspectorTextInput
              id="bottom-field-email"
              value={typeof custom.email === 'string' ? custom.email : ''}
              placeholder="vendas@presys.com.br"
              onChange={(e) => handleCustomFieldChange('email', e.target.value)}
            />
          </InspectorField>

          <InspectorField
            htmlFor="bottom-field-website"
            label="Website Oficial"
            description="Ex: www.presys.com.br"
          >
            <InspectorTextInput
              id="bottom-field-website"
              value={typeof custom.website === 'string' ? custom.website : ''}
              placeholder="www.presys.com.br"
              onChange={(e) => handleCustomFieldChange('website', e.target.value)}
            />
          </InspectorField>
        </div>
      </InspectorSection>

      {/* 3. SEÇÃO APARÊNCIA */}
      <InspectorSection
        id="bottom-inspector-appearance"
        title="Aparência & Paleta Visual"
        icon={<Palette className="w-4 h-4 text-purple-500" />}
        defaultOpen={false}
      >
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            Paleta Corporativa de Fundo
          </label>

          {activePaletteId === 'legacy_custom' && (
            <div className="p-2 mb-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
              <span className="font-bold">Estilo Legado Ativo:</span> este elemento utiliza um gradiente personalizado anterior. Ao selecionar uma paleta oficial abaixo, o estilo será migrado para o padrão canônico.
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            {BOTTOM_HEADER_PALETTES.map((pal) => {
              const isSelected = activePaletteId === pal.id;
              return (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() => handlePaletteSelect(pal.id)}
                  className={`p-1.5 rounded border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#003366] bg-blue-50/50 shadow-xs ring-1 ring-[#003366]'
                      : 'border-slate-200 bg-white hover:border-slate-400'
                  }`}
                  title={pal.label}
                >
                  <div
                    style={{ backgroundColor: pal.hex }}
                    className="w-5 h-5 rounded-full border border-black/10 shadow-2xs flex items-center justify-center"
                  >
                    {isSelected && (
                      <Check
                        className={`w-3 h-3 ${
                          pal.foregroundTone === 'dark' ? 'text-slate-900' : 'text-white'
                        }`}
                      />
                    )}
                  </div>
                  <span className="text-[9px] font-medium text-slate-700 truncate max-w-full leading-tight">
                    {pal.label.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </InspectorSection>
    </div>
  );
};
