// src/components/editor/inspector/components/InspectorSegmentedControl.tsx
// Seletor segmentado compacto para opções mutuamente exclusivas

interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface InspectorSegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function InspectorSegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false
}: InspectorSegmentedControlProps<T>) {
  return (
    <div className={`grid grid-flow-col auto-cols-fr gap-1 p-0.5 bg-slate-200/80 rounded-md ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {options.map((option) => {
        const isSelected = option.value === value;
        const isOptionDisabled = disabled || option.disabled;

        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={isOptionDisabled}
            onClick={() => onChange(option.value)}
            className={`px-2 py-1 text-[10px] font-semibold rounded transition-all text-center truncate ${
              isSelected
                ? 'bg-white text-[#003366] shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
            } ${isOptionDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
