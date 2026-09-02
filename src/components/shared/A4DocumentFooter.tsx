// src/components/shared/A4DocumentFooter.tsx
// Rodapé Técnico Editorial Compartilhado da Folha A4 (Fase 3A.5C)
// Garante 100% de paridade de conteúdo, classes, borders e internacionalização
// entre o Editor (A4Canvas) e o PDF Export (CleanA4Document).
// Não introduz novos PrintableTextNode IDs e respeita estritamente o PrintStringRegistry.

import React from 'react';
import { PrintStringRegistry } from '../../translation/print-strings.registry';

export interface A4DocumentFooterProps {
  locale?: string;
  pageNumber: number | string;
  localizedSystemStrings?: Record<string, string>;
  className?: string;
}

export const A4DocumentFooter: React.FC<A4DocumentFooterProps> = ({
  locale = 'pt-BR',
  pageNumber,
  localizedSystemStrings,
  className = ''
}) => {
  const resolveSystemString = (key: string): string => {
    if (localizedSystemStrings && localizedSystemStrings[key]) {
      return localizedSystemStrings[key];
    }
    return PrintStringRegistry.get(key as any, locale);
  };

  return (
    <div
      data-testid="a4-document-footer"
      className={`pt-2 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-400 font-mono flex-shrink-0 ${className}`}
    >
      <span data-print-string-key="company_brand_footer">
        {resolveSystemString('company_brand_footer')}
      </span>
      <span>
        <span data-print-string-key="page_label">
          {resolveSystemString('page_label')}
        </span>{' '}
        {pageNumber}
      </span>
    </div>
  );
};
