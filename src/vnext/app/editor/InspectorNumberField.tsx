import type { InspectorFrameField } from '../../editor/inspector-frame-draft';
import './InspectorNumberField.css';

export type InspectorNumberFieldProps = {
  readonly field: InspectorFrameField;
  readonly label: string;
  readonly value: string;
  /** Short message shown right under the field; the previous value is already back in place. */
  readonly error?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly describedBy?: string;
  readonly onFocus: () => void;
  readonly onChange: (value: string) => void;
  /** Leaving the field (Tab, Enter or clicking elsewhere) applies the value. */
  readonly onCommit: () => void;
  /** Esc puts back the current value without changing the object. */
  readonly onRevert: () => void;
};

/** Millimetre field of the object panel. Accepts "12,5" and "12.5"; Esc reverts; never locks the editor. */
export function InspectorNumberField({
  field, label, value, error, disabled, readOnly, describedBy, onFocus, onChange, onCommit, onRevert,
}: InspectorNumberFieldProps) {
  const errorId = `vnext-inspector-error-${field}`;
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <label>
      <span>{label}</span>
      <div className={error ? 'is-invalid' : undefined}>
        <input
          type="text"
          inputMode="decimal"
          data-inspector-field={field}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={description}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onRevert();
            }
          }}
        />
        <span>mm</span>
      </div>
      {error && <span id={errorId} className="vnext-inspector-field-error" data-inspector-error={field}>{error}</span>}
    </label>
  );
}
