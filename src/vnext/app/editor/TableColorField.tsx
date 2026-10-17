import React from 'react';
import './TablePanel.css';

type DataAttributes = Readonly<Record<`data-${string}`, string>>;

export interface TableColorFieldProps {
  /** Start of each swatch name, e.g. "Cor do texto" gives "Cor do texto #003366". */
  readonly swatchLabel: string;
  /** Name of the colour picker, e.g. "Outra cor do texto". */
  readonly pickerLabel: string;
  /** Current colour (#RRGGBB), several colours ('mixed') or none. */
  readonly value: string | 'mixed' | undefined;
  /** The catalog colours, offered first. */
  readonly palette: readonly string[];
  readonly disabled?: boolean;
  readonly describedBy?: string;
  /** Attributes of the colour picker (kept stable for the browser proofs). */
  readonly pickerProps?: DataAttributes;
  /** Draw the catalog colours (off for a compact border colour). */
  readonly showSwatches?: boolean;
  readonly onPick: (color: string) => void;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * FR-10 (2D): colour without typing a code. The catalog colours come first as swatches; "Outra cor" opens the
 * browser's colour picker. The colour is applied once, when the picker is closed (the native "change" event),
 * not on every movement inside it.
 */
export function TableColorField({
  swatchLabel, pickerLabel, value, palette, disabled, describedBy, pickerProps, showSwatches = true, onPick,
}: TableColorFieldProps) {
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const onPickRef = React.useRef(onPick);
  onPickRef.current = onPick;
  const current = typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : undefined;
  React.useEffect(() => {
    // The picker is a new element whenever the colour changes (key below), so the listener follows it.
    const picker = pickerRef.current;
    if (!picker) return;
    const listener = () => {
      const color = picker.value.toUpperCase();
      if (HEX.test(color)) onPickRef.current(color);
    };
    picker.addEventListener('change', listener);
    return () => picker.removeEventListener('change', listener);
  }, [current]);
  return (
    <div className="vnext-table-color-field">
      {showSwatches && (
        <div className="vnext-style-palette" data-style-palette={pickerProps?.['data-style-property']}>
          {palette.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`${swatchLabel} ${color}`}
              aria-pressed={current === color.toUpperCase()}
              title={color}
              disabled={disabled}
              aria-describedby={describedBy}
              style={{ background: color }}
              onClick={() => onPick(color.toUpperCase())}
            />
          ))}
        </div>
      )}
      <label className="vnext-table-color-picker">
        <input
          {...pickerProps}
          ref={pickerRef}
          key={current ?? 'none'}
          type="color"
          defaultValue={(current ?? '#FFFFFF').toLowerCase()}
          disabled={disabled}
          aria-describedby={describedBy}
        />
        <span>{value === 'mixed' ? `${pickerLabel} (vários valores)` : pickerLabel}</span>
      </label>
    </div>
  );
}
