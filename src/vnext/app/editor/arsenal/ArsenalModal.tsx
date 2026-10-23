import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { trapReviewTab, useReviewDialog } from '../../review-dialog';

export interface ArsenalModalProps {
  readonly titleId: string;
  readonly descriptionId?: string;
  readonly title: React.ReactNode;
  /** `alertdialog` for "Apagar?" confirmations. */
  readonly role?: 'dialog' | 'alertdialog';
  /** Changes when the content changes, so the focus moves to the first control again when it was lost. */
  readonly phase: string;
  readonly className?: string;
  readonly onClose: () => void;
  /** Where the focus goes back when the dialog closes (the menu that opened it is gone by then). */
  readonly returnFocus?: HTMLElement | null;
  readonly children: React.ReactNode;
  readonly onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}

/**
 * The arsenal dialogs (Guardar, Renomear, Apagar): same look and keyboard as the other editor dialogs — the editor
 * behind is inert, Tab stays inside, Esc and "Fechar" close it and the focus goes back to what opened it. Drawn on
 * the page body, outside the editor.
 */
export function ArsenalModal({
  titleId, descriptionId, title, role = 'dialog', phase, className, onClose, returnFocus, children, onSubmit,
}: ArsenalModalProps) {
  const ref = React.useRef<HTMLElement>(null);
  useReviewDialog(ref, phase);
  const returnTo = React.useRef(returnFocus);
  returnTo.current = returnFocus;
  React.useEffect(() => () => {
    const target = returnTo.current;
    // After the editor stops being inert (the hook's own cleanup runs in the layout phase, before this one).
    if (target?.isConnected) queueMicrotask(() => { if (target.isConnected) target.focus(); });
  }, []);
  const props = {
    role,
    'aria-modal': true as const,
    'aria-labelledby': titleId,
    ...(descriptionId ? { 'aria-describedby': descriptionId } : {}),
    tabIndex: -1,
    className: ['vnext-arsenal-dialog', className].filter(Boolean).join(' '),
    'data-arsenal-dialog': '',
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      trapReviewTab(event);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    },
  };
  const content = (
    <>
      <button type="button" className="vnext-arsenal-dialog-close" aria-label="Fechar" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      <h2 id={titleId}>{title}</h2>
      {children}
    </>
  );
  return createPortal(
    <div className="vnext-arsenal-dialog-backdrop">
      {onSubmit
        ? <form ref={ref as React.RefObject<HTMLFormElement>} {...props} onSubmit={onSubmit}>{content}</form>
        : <section ref={ref as React.RefObject<HTMLElement>} {...props}>{content}</section>}
    </div>,
    document.body,
  );
}
