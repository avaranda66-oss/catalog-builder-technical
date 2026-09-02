// src/components/editor/overflow/OverflowWarningBanner.tsx
// Banner de Diagnóstico Visual Editor-Only para Overflow Vertical e Capa Mista (Fase 3A.5C)
// Utiliza AlertTriangle de lucide-react (zero emojis no código), posicionado como overlay absoluto
// sem qualquer interferência no fluxo documental de page.blocks.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageVerticalOverflowResult } from '../../../domain/overflow-guard';

export interface OverflowWarningBannerProps {
  result: PageVerticalOverflowResult;
  onRecoverMixedCover?: () => void;
  isRecoveryEligible?: boolean;
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  structural_section: 'Seção Estrutural',
  matrix_spec_table: 'Tabela de Especificações',
  custom_table: 'Tabela Customizada',
  technical_table: 'Tabela Técnica',
  table: 'Tabela Técnica',
  ordering_matrix: 'Matriz de Codificação',
  ordering_matrix_compact: 'Matriz Compacta',
  text: 'Bloco de Texto',
  image: 'Imagem',
  full_page_cover: 'Capa A4',
  highlight_banner: 'Banner de Destaque',
  contact_footer: 'Rodapé de Contato'
};

export const OverflowWarningBanner: React.FC<OverflowWarningBannerProps> = ({
  result,
  onRecoverMixedCover,
  isRecoveryEligible = false
}) => {
  const hasOverflow = result.overflowY && result.overflowMm > 0;
  const hasMixedCover = result.issues.some((i) => i.code === 'MIXED_FULL_PAGE_COVER');

  if (!hasOverflow && !hasMixedCover) {
    return null;
  }

  const offendingTypeLabel = result.firstOffendingBlockType
    ? BLOCK_TYPE_LABELS[result.firstOffendingBlockType] || result.firstOffendingBlockType
    : undefined;

  return (
    <div
      data-testid="overflow-warning-banner"
      role="alert"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 no-print editor-only max-w-[92%] shadow-md rounded-none border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 flex items-center justify-between gap-3 pointer-events-auto"
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <div className="flex flex-col gap-0.5 leading-tight">
          {hasOverflow && (
            <span data-testid="overflow-text-warning" className="font-semibold">
              Conteúdo excede a área útil da página em ~{result.overflowMm.toFixed(1).replace('.', ',')} mm.
              {offendingTypeLabel && (
                <span className="font-normal text-amber-800 ml-1">
                  (Início do excesso: {offendingTypeLabel})
                </span>
              )}
            </span>
          )}
          {hasMixedCover && (
            <span data-testid="mixed-cover-warning" className="text-amber-800 font-medium">
              Capa de página inteira combinada com outros blocos em fluxo. Elementos adicionais podem ficar ocultos na impressão.
            </span>
          )}
        </div>
      </div>

      {hasMixedCover && isRecoveryEligible && onRecoverMixedCover && (
        <button
          type="button"
          data-testid="btn-recover-mixed-cover"
          onClick={onRecoverMixedCover}
          className="px-2.5 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-none transition-colors flex-shrink-0 shadow-sm ml-2"
        >
          Mover conteúdo para nova página
        </button>
      )}
    </div>
  );
};
