// src/components/editor/inspector/components/InspectorColorInput.tsx
// Primitive canônica CORE.E3 para edição de cores (#RRGGBB).
// Store-agnostic, acessível e com validação estrita.

import React, { useState, useEffect, useRef } from 'react';

export interface InspectorColorInputProps {
  id: string;
  value: string;
  onChange: (colorHex: string) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
}

/**
 * Normaliza #RGB ou #RRGGBB para formato canônico #RRGGBB em caixa alta.
 * Retorna null se for inválido.
 */
export function normalizeHexColor(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const hexMatch = trimmed.match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (!hexMatch) return null;

  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${hex.toUpperCase()}`;
}

export const InspectorColorInput: React.FC<InspectorColorInputProps> = ({
  id,
  value,
  onChange,
  disabled = false,
  label,
  ariaLabel
}) => {
  const canonicalInitial = normalizeHexColor(value) || '#000000';
  const [draftHex, setDraftHex] = useState<string>(canonicalInitial);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const lastCommittedRef = useRef<string>(canonicalInitial);

  useEffect(() => {
    const canonical = normalizeHexColor(value);
    if (canonical) {
      setDraftHex(canonical);
      lastCommittedRef.current = canonical;
    }
  }, [value]);

  const commitDraft = () => {
    const raw = textInputRef.current ? textInputRef.current.value : draftHex;
    const normalized = normalizeHexColor(raw);
    if (normalized) {
      setDraftHex(normalized);
      if (textInputRef.current) {
        textInputRef.current.value = normalized;
      }
      if (normalized !== lastCommittedRef.current) {
        lastCommittedRef.current = normalized;
        onChange(normalized);
      }
    } else {
      // Valor inválido: restaura o último valor válido comitado sem chamar onChange
      const fallback = lastCommittedRef.current;
      setDraftHex(fallback);
      if (textInputRef.current) {
        textInputRef.current.value = fallback;
      }
    }
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeHexColor(e.target.value);
    if (normalized) {
      setDraftHex(normalized);
      if (textInputRef.current) {
        textInputRef.current.value = normalized;
      }
      if (normalized !== lastCommittedRef.current) {
        lastCommittedRef.current = normalized;
        onChange(normalized);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Swatch Clicável conectado ao input nativo de cor */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => colorInputRef.current?.click()}
        className="w-7 h-7 rounded border border-slate-300 shadow-2xs flex-shrink-0 cursor-pointer overflow-hidden p-0.5 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
        title="Abrir seletor de cor"
        aria-label={ariaLabel || label || 'Selecionar cor'}
      >
        <div
          style={{ backgroundColor: normalizeHexColor(draftHex) || '#000000' }}
          className="w-full h-full rounded-xs border border-black/10"
        />
      </button>

      <input
        ref={colorInputRef}
        type="color"
        value={normalizeHexColor(draftHex) || '#000000'}
        onChange={handleNativeColorChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Input de Texto Hexadecimal com Validação no Enter e Blur */}
      <input
        ref={textInputRef}
        id={id}
        type="text"
        value={draftHex}
        disabled={disabled}
        onChange={(e) => setDraftHex(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft();
          }
        }}
        placeholder="#003366"
        maxLength={7}
        aria-label={ariaLabel || label || 'Código hexadecimal da cor'}
        className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs font-mono text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#003366] focus:border-[#003366] disabled:bg-slate-100 disabled:text-slate-400"
      />
    </div>
  );
};
