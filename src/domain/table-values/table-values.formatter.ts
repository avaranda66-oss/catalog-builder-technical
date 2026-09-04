// src/domain/table-values/table-values.formatter.ts
// Formatador puro e determinístico de TableCellLiteralContent para string.
// Zero dependências externas ou de UI.

import type { TableCellLiteralContent } from './table-values.types';

/**
 * Formata qualquer TableCellLiteralContent em sua representação textual canônica.
 * Útil para espelhamento em localOverrides legado, buscas, logs ou fallback de renderização.
 */
export function formatTableCellLiteral(content: TableCellLiteralContent | undefined | null): string {
  if (!content) return '';

  switch (content.kind) {
    case 'empty':
      return '';

    case 'text':
      return content.text;

    case 'number': {
      const decimals = content.format?.decimals;
      const valStr = typeof decimals === 'number'
        ? content.value.toFixed(decimals)
        : String(content.value);
      const prefix = content.format?.prefix ?? '';
      const suffix = content.format?.suffix ?? '';
      return `${prefix}${valStr}${suffix}`;
    }

    case 'value_unit': {
      const qualifier = content.qualifier ? `${content.qualifier} ` : '';
      return `${qualifier}${content.amount} ${content.unit}`.trim();
    }

    case 'badge':
      return content.label;

    case 'asset_reference':
      return content.caption || content.altText || `[Asset: ${content.assetId}]`;

    case 'range': {
      const parts: string[] = [];
      if (content.prefix) parts.push(content.prefix);
      const hasLower = content.lower !== undefined && content.lower !== null;
      const hasUpper = content.upper !== undefined && content.upper !== null;
      if (hasLower && hasUpper) {
        parts.push(`${content.lower} a ${content.upper}`);
      } else if (hasLower) {
        parts.push(`≥ ${content.lower}`);
      } else if (hasUpper) {
        parts.push(`≤ ${content.upper}`);
      }
      if (content.unit) parts.push(content.unit);
      return parts.join(' ').trim();
    }

    case 'boolean': {
      if (content.format === 'check_cross') {
        return content.value ? '✓' : '✗';
      }
      if (content.format === 'yes_no') {
        return content.value ? 'YES' : 'NO';
      }
      return content.value ? 'Sim' : 'Não';
    }

    case 'enum':
      return content.label || content.code;

    case 'technical_token':
      return content.token;

    case 'unknown':
      return content.reason ? `[?] ${content.reason}` : '[?]';

    default:
      return '';
  }
}
