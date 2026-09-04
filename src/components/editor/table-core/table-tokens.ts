// src/components/editor/table-core/table-tokens.ts
// Mapeamento Centralizado de Tokens Semânticos de Apresentação para Classes CSS.
// Concentra todas as variantes visuais em uma única camada declarativa.
// Zero explicit any.

import React from 'react';
import {
  TableColorToken,
  TableColorValue,
  HexColor,
  TableDensityToken,
  TableBorderToken,
  TableStripeToken,
  TableCellBadgeContent
} from '../../../domain/table-core/table.types';

export interface TablePresentationStyles {
  headerBgClass: string;
  headerTextClass: string;
  headerBorderClass: string;
  cellPaddingClass: string;
  fontSizeClass: string;
  tableBorderClass: string;
  cellBorderClass: string;
  stripeClass: string;
}

export const TABLE_COLOR_TOKEN_HEX_MAP: Record<TableColorToken, string> = {
  transparent: 'transparent',
  surface: '#ffffff',
  surface_subtle: '#f8fafc',
  surface_header: '#0f172a',
  text_primary: '#0f172a',
  text_secondary: '#475569',
  text_muted: '#94a3b8',
  text_on_header: '#ffffff',
  brand_primary: '#001f3f',
  brand_secondary: '#003366',
  brand_navy: '#001f3f',
  technical_blue: '#003366',
  accent: '#2563eb',
  success: '#059669',
  warning: '#d97706',
  critical: '#e11d48',
  white: '#ffffff',
  slate_900: '#0f172a',
  slate_800: '#1e293b',
  slate_200: '#e2e8f0',
  slate_100: '#f1f5f9'
};

export function isHexColor(value?: string): value is HexColor {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function normalizeHexColor(hex: string): HexColor {
  const clean = hex.trim().toLowerCase();
  if (clean.length === 4) {
    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}` as HexColor;
  }
  return clean as HexColor;
}

export interface ResolvedTableColor {
  className: string;
  styleColor?: string;
  style?: React.CSSProperties;
}

/**
 * Resolve deterministicamente uma cor de tabela (token ou HEX) para uso em Canvas, Preview e PDF/Export.
 * Garante paridade absoluta entre todos os renderers (Emenda 8).
 */
export function resolveTableColor(
  value: TableColorValue | undefined,
  type: 'bg' | 'text' | 'border'
): ResolvedTableColor {
  if (!value) {
    return { className: '' };
  }

  if (isHexColor(value)) {
    const hex = normalizeHexColor(value);
    if (type === 'bg') {
      return { className: '', styleColor: hex, style: { backgroundColor: hex } };
    }
    if (type === 'text') {
      return { className: '', styleColor: hex, style: { color: hex } };
    }
    return { className: '', styleColor: hex, style: { borderColor: hex } };
  }

  // Token semântico
  const token = value as TableColorToken;
  const hex = TABLE_COLOR_TOKEN_HEX_MAP[token];

  if (type === 'bg') {
    return {
      className: getBackgroundColorClass(token),
      styleColor: hex,
      style: hex && hex !== 'transparent' ? { backgroundColor: hex } : undefined
    };
  }
  if (type === 'text') {
    return {
      className: getTextColorClass(token),
      styleColor: hex,
      style: hex ? { color: hex } : undefined
    };
  }
  return {
    className: getBorderColorClass(token),
    styleColor: hex,
    style: hex ? { borderColor: hex } : undefined
  };
}

/**
 * Mapeia um TableColorValue de fundo para classe CSS do Tailwind.
 */
export function getBackgroundColorClass(token?: TableColorValue): string {
  if (!token) return '';
  if (isHexColor(token)) return '';
  switch (token) {
    case 'surface':
      return 'bg-white';
    case 'surface_subtle':
      return 'bg-slate-50';
    case 'surface_header':
      return 'bg-slate-900';
    case 'brand_primary':
      return 'bg-[#001f3f]';
    case 'brand_secondary':
      return 'bg-[#003366]';
    case 'brand_navy':
      return 'bg-[#001f3f]';
    case 'technical_blue':
      return 'bg-[#003366]';
    case 'slate_900':
      return 'bg-slate-900';
    case 'slate_800':
      return 'bg-slate-800';
    case 'slate_200':
      return 'bg-slate-200';
    case 'slate_100':
      return 'bg-slate-100';
    case 'white':
      return 'bg-white';
    case 'transparent':
      return 'bg-transparent';
    default:
      return '';
  }
}

/**
 * Mapeia um TableColorValue de texto para classe CSS do Tailwind.
 */
export function getTextColorClass(token?: TableColorValue): string {
  if (!token) return '';
  if (isHexColor(token)) return '';
  switch (token) {
    case 'text_primary':
      return 'text-slate-900';
    case 'text_secondary':
      return 'text-slate-600';
    case 'text_muted':
      return 'text-slate-400';
    case 'text_on_header':
      return 'text-white';
    case 'brand_primary':
      return 'text-[#001f3f]';
    case 'brand_secondary':
      return 'text-[#003366]';
    case 'brand_navy':
      return 'text-[#001f3f]';
    case 'technical_blue':
      return 'text-[#003366]';
    case 'accent':
      return 'text-blue-600';
    case 'success':
      return 'text-emerald-600';
    case 'warning':
      return 'text-amber-600';
    case 'critical':
      return 'text-rose-600';
    case 'white':
      return 'text-white';
    case 'slate_900':
      return 'text-slate-900';
    case 'slate_800':
      return 'text-slate-800';
    case 'slate_200':
      return 'text-slate-200';
    case 'slate_100':
      return 'text-slate-100';
    default:
      return '';
  }
}

/**
 * Retorna classes de densidade e preenchimento (padding e tamanho de fonte base).
 */
export function getDensityClasses(density: TableDensityToken): {
  cellPadding: string;
  fontSize: string;
} {
  switch (density) {
    case 'compact':
      return { cellPadding: 'py-1 px-1.5', fontSize: 'text-[9px]' };
    case 'spacious':
      return { cellPadding: 'py-2.5 px-3.5', fontSize: 'text-[11px]' };
    case 'regular':
    default:
      return { cellPadding: 'py-1.5 px-2.5', fontSize: 'text-[10px]' };
  }
}

/**
 * Retorna classes para bordas estruturais da tabela e células.
 */
export function getBorderClasses(borderStyle: TableBorderToken): {
  tableBorder: string;
  cellBorder: string;
} {
  switch (borderStyle) {
    case 'horizontal_only':
      return {
        tableBorder: 'border-b border-slate-300',
        cellBorder: 'border-b border-slate-200'
      };
    case 'outer_only':
      return {
        tableBorder: 'border border-slate-300',
        cellBorder: 'border-0'
      };
    case 'none':
      return {
        tableBorder: 'border-0',
        cellBorder: 'border-0'
      };
    case 'all':
    default:
      return {
        tableBorder: 'border border-slate-300',
        cellBorder: 'border-r border-b border-slate-200 last:border-r-0'
      };
  }
}

/**
 * Retorna classe para estilo zebrado de linhas.
 */
export function getStripeClass(stripeStyle: TableStripeToken): string {
  switch (stripeStyle) {
    case 'subtle_zebra':
      return 'even:bg-slate-50/60';
    case 'high_contrast_zebra':
      return 'even:bg-slate-100';
    case 'none':
    default:
      return '';
  }
}

/**
 * Retorna as classes CSS para variantes semânticas de badges.
 */
export function getBadgeVariantClasses(
  variant: TableCellBadgeContent['variant']
): string {
  switch (variant) {
    case 'info':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'critical':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'neutral':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function getBorderEmphasisClass(
  emphasis?: 'none' | 'bottom_thick' | 'all_subtle' | 'accent'
): string {
  switch (emphasis) {
    case 'bottom_thick':
      return 'border-b-2 border-b-slate-700';
    case 'all_subtle':
      return 'border border-slate-300';
    case 'accent':
      return 'border-l-2 border-l-blue-600 bg-blue-50/20';
    case 'none':
    default:
      return '';
  }
}

export function getFontScaleClass(scale?: 'compact' | 'normal' | 'large'): string {
  switch (scale) {
    case 'compact':
      return 'text-[8.5px]';
    case 'large':
      return 'text-[11.5px]';
    case 'normal':
    default:
      return 'text-[10px]';
  }
}

export function getCellPaddingTokenClass(
  token?: 'dense' | 'normal' | 'spacious'
): string {
  switch (token) {
    case 'dense':
      return 'py-1 px-1.5';
    case 'spacious':
      return 'py-2.5 px-3.5';
    case 'normal':
    default:
      return 'py-1.5 px-2.5';
  }
}

export function getLineHeightClass(
  lineHeight?: 'tight' | 'normal' | 'relaxed'
): string {
  switch (lineHeight) {
    case 'tight':
      return 'leading-tight';
    case 'relaxed':
      return 'leading-relaxed';
    case 'normal':
    default:
      return 'leading-normal';
  }
}

export function getBorderColorClass(token?: TableColorValue): string {
  if (!token) return 'border-slate-200';
  if (isHexColor(token)) return '';
  switch (token) {
    case 'brand_primary':
    case 'brand_navy':
      return 'border-[#001f3f]';
    case 'brand_secondary':
    case 'technical_blue':
      return 'border-[#003366]';
    case 'slate_900':
      return 'border-slate-900';
    case 'slate_800':
      return 'border-slate-800';
    case 'slate_200':
      return 'border-slate-200';
    case 'slate_100':
      return 'border-slate-100';
    case 'white':
      return 'border-white';
    case 'accent':
      return 'border-blue-600';
    default:
      return 'border-slate-200';
  }
}

export function getOuterBorderWidthClass(
  outerWidth?: 'none' | 'thin' | 'thick'
): string {
  switch (outerWidth) {
    case 'none':
      return 'border-0';
    case 'thick':
      return 'border-2';
    case 'thin':
    default:
      return 'border';
  }
}

export function getCornerRoundnessClass(
  roundness?: 'none' | 'small' | 'medium'
): string {
  switch (roundness) {
    case 'small':
      return 'rounded-sm overflow-hidden';
    case 'medium':
      return 'rounded-md overflow-hidden';
    case 'none':
    default:
      return '';
  }
}

