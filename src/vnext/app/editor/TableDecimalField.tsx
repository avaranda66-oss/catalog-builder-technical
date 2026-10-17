import React from 'react';
import { formatDecimalPtBr, parseDecimalPtBr, sameDecimal } from '../../editor/decimal-ptbr';
import './TablePanel.css';

type DataAttributes = Readonly<Record<`data-${string}`, string>>;

export interface TableDecimalFieldProps {
  /** Name used in the message under the field, e.g. "Altura" or "Espaço interno". */
  readonly name: string;
  readonly value: number | 'mixed' | undefined;
  /** Shown after the number ("mm", "pt") and used in the message. */
  readonly unit?: 'mm' | 'pt';
  /** `positive` (default): more than zero; `zeroOrMore`: zero is accepted. */
  readonly range?: 'positive' | 'zeroOrMore';
  readonly integer?: boolean;
  /** An empty field is accepted and sent as null (back to the inherited value). */
  readonly allowEmpty?: boolean;
  /** Example in the message: "como 1,5". */
  readonly example: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly describedBy?: string;
  readonly ariaLabel?: string;
  /** Class of the box around the number and its unit (the existing "vnext-dimension-value" or "vnext-style-number"). */
  readonly className?: string;
  readonly inputProps?: DataAttributes;
  /** Sends every valid number while typing (fields read by a later button, like the size of a cell image). */
  readonly live?: boolean;
  readonly onCommit: (value: number | null) => void;
}

const UNIT_WORDS = { mm: ' em milímetros', pt: ' em pontos' } as const;

let fieldSequence = 0;

/**
 * FR-10 (2D): number field of the table panel. Accepts "1,5" and "1.5"; Enter or leaving the field applies the
 * value; Esc puts the current value back. A value that is not a number (or out of range) never reaches the catalog:
 * the field shows the current value again and a plain message right below it.
 */
export function TableDecimalField({
  name, value, unit, range = 'positive', integer = false, allowEmpty = false, example, placeholder, disabled,
  describedBy, ariaLabel, className, inputProps, live = false, onCommit,
}: TableDecimalFieldProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorId] = React.useState(() => `vnext-table-field-error-${++fieldSequence}`);
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    // A live field keeps what the person is typing ("2," before "2,5"); any other field shows the new value.
    if (live && focusedRef.current) return;
    setDraft(null);
    setError(null);
  }, [live, value]);

  const message = `${name}: digite um número${integer ? ' inteiro' : ''}${unit ? UNIT_WORDS[unit] : ''}, como ${example}`
    + ` (${range === 'zeroOrMore' ? 'zero ou mais' : 'maior que zero'}). O valor anterior foi mantido.`;
  const check = (text: string): { ok: true; value: number | null } | { ok: false } => {
    const parsed = parseDecimalPtBr(text);
    if (!parsed.ok) return parsed.reason === 'EMPTY' && allowEmpty ? { ok: true, value: null } : { ok: false };
    if (integer && !Number.isInteger(parsed.value)) return { ok: false };
    if (range === 'positive' ? parsed.value <= 0 : parsed.value < 0) return { ok: false };
    return { ok: true, value: parsed.value };
  };
  const unchanged = (next: number | null) => next === null
    ? value === undefined
    : typeof value === 'number' && sameDecimal(next, value);

  const commit = () => {
    if (draft === null) return;
    const result = check(draft);
    setDraft(null);
    if (!result.ok) {
      setError(message);
      return;
    }
    setError(null);
    if (!live && !unchanged(result.value)) onCommit(result.value);
  };

  const shown = draft ?? (typeof value === 'number' ? formatDecimalPtBr(value) : '');
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <>
      <span className={[className, error ? 'is-invalid' : undefined].filter(Boolean).join(' ') || undefined}>
        <input
          {...inputProps}
          type="text"
          inputMode="decimal"
          value={shown}
          placeholder={value === 'mixed' ? 'Vários valores' : placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={description}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (error) setError(null);
            if (live) {
              const result = check(text);
              if (result.ok && !unchanged(result.value)) onCommit(result.value);
            }
          }}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => {
            focusedRef.current = false;
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape' && (draft !== null || error)) {
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
              setError(null);
            }
          }}
        />
        {unit && <span>{unit}</span>}
      </span>
      {error && <span id={errorId} className="vnext-table-field-error" data-table-field-error="" aria-live="polite">{error}</span>}
    </>
  );
}
