// src/components/editor/inspector/components/InspectorSegmentedControl.tsx
// Primitive canônica de Segmented Control para escolhas mutuamente exclusivas no Inspector PRESYS (CORE.E3 / E3.1).
// Implementa semântica WAI-ARIA formal de radiogroup/radio, roving tabindex e navegação completa por teclado (Arrow, Home, End).

import React, { useRef } from 'react';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

export interface InspectorSegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function InspectorSegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  'aria-label': propAriaLabel
}: InspectorSegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabledIndices = options
    .map((opt, idx) => (!disabled && !opt.disabled ? idx : -1))
    .filter((idx) => idx !== -1);

  const selectedIndex = options.findIndex((opt) => opt.value === value);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || enabledIndices.length === 0) return;

    let targetIndex = -1;
    const currentEnabledPos = enabledIndices.indexOf(selectedIndex);

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        if (currentEnabledPos === -1) {
          targetIndex = enabledIndices[0];
        } else {
          const nextPos = (currentEnabledPos + 1) % enabledIndices.length;
          targetIndex = enabledIndices[nextPos];
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        if (currentEnabledPos === -1) {
          targetIndex = enabledIndices[enabledIndices.length - 1];
        } else {
          const prevPos = (currentEnabledPos - 1 + enabledIndices.length) % enabledIndices.length;
          targetIndex = enabledIndices[prevPos];
        }
        break;
      }
      case 'Home': {
        e.preventDefault();
        targetIndex = enabledIndices[0];
        break;
      }
      case 'End': {
        e.preventDefault();
        targetIndex = enabledIndices[enabledIndices.length - 1];
        break;
      }
      default:
        return;
    }

    if (targetIndex !== -1) {
      buttonRefs.current[targetIndex]?.focus();
      if (options[targetIndex].value !== value) {
        onChange(options[targetIndex].value);
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={propAriaLabel}
      aria-disabled={disabled}
      onKeyDown={handleKeyDown}
      className={`grid grid-flow-col auto-cols-fr gap-1 p-0.5 bg-slate-200/80 rounded-md border border-slate-200 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {options.map((option, idx) => {
        const isSelected = option.value === value;
        const isOptionDisabled = disabled || option.disabled;

        // Roving tabindex: o selecionado possui tabIndex 0; se nenhum selecionado, o 1º habilitado possui 0
        const isFirstEnabled = enabledIndices[0] === idx;
        const tabIndex = isSelected ? 0 : selectedIndex === -1 && isFirstEnabled ? 0 : -1;

        return (
          <button
            key={String(option.value)}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={tabIndex}
            disabled={isOptionDisabled}
            title={option.title}
            onClick={() => {
              if (!isOptionDisabled && !isSelected) {
                onChange(option.value);
              }
            }}
            className={`px-2 py-1 text-[10px] font-semibold rounded transition-all text-center truncate select-none focus:outline-hidden focus:ring-1 focus:ring-[#003366] ${
              isSelected
                ? 'bg-white text-[#003366] shadow-xs font-bold border border-slate-300/40'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60 border border-transparent'
            } ${isOptionDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
