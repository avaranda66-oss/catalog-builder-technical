// src/components/editor/inspector/components/InspectorSegmentedControl.tsx
// Primitive canônica de Segmented Control para escolhas mutuamente exclusivas no Inspector PRESYS (CORE.E3).
// Utiliza semântica WAI-ARIA formal de radiogroup/radio, estados de seleção nítidos e suporte a tipos genéricos.

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
  return (
    <div
      role="radiogroup"
      aria-label={propAriaLabel}
      aria-disabled={disabled}
      className={`grid grid-flow-col auto-cols-fr gap-1 p-0.5 bg-slate-200/80 rounded-md border border-slate-200 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const isOptionDisabled = disabled || option.disabled;

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={isOptionDisabled}
            title={option.title}
            onClick={() => {
              if (!isOptionDisabled && !isSelected) {
                onChange(option.value);
              }
            }}
            className={`px-2 py-1 text-[10px] font-semibold rounded transition-all text-center truncate select-none ${
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
