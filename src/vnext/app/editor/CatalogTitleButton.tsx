import React from 'react';
import { Pencil } from 'lucide-react';
import type { DocumentSession } from '../../application';
import { CATALOG_TITLE_MAX_LENGTH, normalizeCatalogTitle } from '../../library/service';
import './entry-and-title.css';

export interface CatalogTitleButtonProps {
  /** The live editor session: the rename is one undoable `document.rename` saved by autosave. */
  readonly session: DocumentSession;
  readonly title: string;
  readonly disabled?: boolean;
}

export const CATALOG_TITLE_MESSAGES = {
  hint: 'Clique para mudar o nome do catálogo.',
  editingHint: 'Enter salva o nome. Esc cancela.',
  empty: 'O nome não pode ficar vazio. O nome anterior foi mantido.',
  failed: 'Não foi possível mudar o nome agora. Tente novamente.',
} as const;

/**
 * Editor title that renames the open catalog in place. It never calls the Library service, which
 * saves outside the open session and would conflict with it.
 */
export function CatalogTitleButton({ session, title, disabled = false }: CatalogTitleButtonProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const editingRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const hintId = React.useId();
  const editing = draft !== null;

  React.useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  React.useEffect(() => {
    if (disabled && editingRef.current) {
      editingRef.current = false;
      setDraft(null);
    }
  }, [disabled]);

  const startEditing = () => {
    if (disabled) return;
    editingRef.current = true;
    setError(undefined);
    setDraft(title);
  };

  const finish = (mode: 'save' | 'cancel', restoreFocus: boolean) => {
    // Enter and the blur that follows must not rename twice.
    if (!editingRef.current) return;
    editingRef.current = false;
    if (mode === 'save' && draft !== null) {
      const next = normalizeCatalogTitle(draft);
      if (!next) {
        setError(CATALOG_TITLE_MESSAGES.empty);
      } else if (next !== title) {
        const result = session.execute({ type: 'document.rename', title: next });
        setError(result.ok ? undefined : CATALOG_TITLE_MESSAGES.failed);
      }
    }
    setDraft(null);
    if (restoreFocus) queueMicrotask(() => buttonRef.current?.focus());
  };

  return (
    <>
      <h1 className="vnext-catalog-title" data-catalog-title="">
        {editing ? (
          <input
            ref={inputRef}
            className="vnext-catalog-title-input"
            aria-label="Nome do catálogo"
            aria-describedby={hintId}
            value={draft ?? ''}
            maxLength={CATALOG_TITLE_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                finish('save', true);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finish('cancel', true);
              }
            }}
            onBlur={() => finish('save', false)}
          />
        ) : (
          <button
            ref={buttonRef}
            type="button"
            className="vnext-catalog-title-button"
            data-editor-action="rename-catalog"
            title={CATALOG_TITLE_MESSAGES.hint}
            aria-describedby={hintId}
            disabled={disabled}
            onClick={startEditing}
          >
            <span className="vnext-catalog-title-text">{title}</span>
            <Pencil className="vnext-catalog-title-icon" size={14} aria-hidden="true" />
          </button>
        )}
      </h1>
      <span id={hintId} hidden>{editing ? CATALOG_TITLE_MESSAGES.editingHint : CATALOG_TITLE_MESSAGES.hint}</span>
      {error && <span className="vnext-catalog-title-error" role="alert">{error}</span>}
    </>
  );
}
