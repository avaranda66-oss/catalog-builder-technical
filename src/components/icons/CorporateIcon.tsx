// src/components/icons/CorporateIcon.tsx
// Componente de Renderização Determinística de Ícones Corporativos PRESYS (Fase 3A.3)
// Garante resolução SVG estrita, contrato de tamanhos, herança de cor (currentColor),
// e isolamento fail-safe: fallback discreto no Editor e silêncio absoluto (null) no PDF.

import React from 'react';
import { HelpCircle } from 'lucide-react';
import { getCorporateIcon } from './corporate-icon.registry';

export type CorporateIconSize = 'xs' | 'sm' | 'md' | 'lg';
export type CorporateIconContext = 'section' | 'card' | 'picker';
export type CorporateIconEnvironment = 'editor' | 'document';

export interface CorporateIconProps {
  iconId?: string | null;
  context?: CorporateIconContext;
  size?: CorporateIconSize | number;
  className?: string;
  isExport?: boolean;
  environment?: CorporateIconEnvironment;
  'aria-hidden'?: boolean | 'true' | 'false';
}

const SIZE_MAP: Record<CorporateIconSize, { px: number; stroke: number }> = {
  xs: { px: 14, stroke: 1.75 },
  sm: { px: 16, stroke: 1.75 },
  md: { px: 20, stroke: 2.0 },
  lg: { px: 24, stroke: 2.0 }
};

export const CorporateIcon: React.FC<CorporateIconProps> = ({
  iconId,
  context = 'card',
  size,
  className = 'text-current',
  isExport = false,
  environment,
  'aria-hidden': ariaHidden = true
}) => {
  // Determina se estamos em ambiente de exportação / documento estrito
  const isDocumentEnvironment = isExport || environment === 'document';

  // Se nenhum iconId foi fornecido, nada a renderizar
  if (!iconId) {
    return null;
  }

  // Resolução canônica pelo CorporateIconRegistry
  const definition = getCorporateIcon(iconId);

  // Cálculo de dimensões e espessura do stroke
  let px: number;
  let stroke: number;

  if (typeof size === 'number') {
    px = size;
    stroke = size >= 20 ? 2.0 : 1.75;
  } else if (size && SIZE_MAP[size]) {
    px = SIZE_MAP[size].px;
    stroke = SIZE_MAP[size].stroke;
  } else {
    // Default derivado do contexto
    const defaultToken: CorporateIconSize =
      context === 'section' ? 'md' : context === 'picker' ? 'lg' : 'sm';
    px = SIZE_MAP[defaultToken].px;
    stroke = SIZE_MAP[defaultToken].stroke;
  }

  // 1. Caso Sucesso: Ícone conhecido no catálogo corporativo
  if (definition) {
    const IconComponent = definition.component;
    return (
      <IconComponent
        size={px}
        strokeWidth={stroke}
        className={className}
        aria-hidden={ariaHidden}
        data-corporate-icon-id={definition.id}
      />
    );
  }

  // 2. Caso Ícone Desconhecido (Unknown Icon Policy)
  // No PDF / Documento de Exportação: Silêncio absoluto (ZERO poluição visual, ZERO texto)
  if (isDocumentEnvironment) {
    return null;
  }

  // No Editor Visual: Placeholder discreto de ajuda para o operador corrigir a referência
  return (
    <span
      title={`Ícone indisponível: ${iconId}`}
      className="inline-flex items-center justify-center rounded border border-dashed border-amber-300 bg-amber-50/70 text-amber-600 p-0.5 cursor-help"
      data-corporate-icon-fallback="true"
      data-corporate-icon-id={iconId}
      aria-hidden="true"
    >
      <HelpCircle size={px} strokeWidth={stroke} />
    </span>
  );
};
