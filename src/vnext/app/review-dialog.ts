import React from 'react';

const controls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),select:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')];

export function useReviewDialog(ref: React.RefObject<HTMLElement>, phase: string): void {
  const trigger = React.useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  React.useLayoutEffect(() => {
    const background = document.querySelector<HTMLElement>('[data-vnext-shell]');
    const wasInert = background?.inert ?? false;
    const openingTrigger = trigger.current;
    if (background) background.inert = true;
    return () => {
      if (background) background.inert = wasInert;
      if (openingTrigger?.isConnected) openingTrigger.focus();
    };
  }, []);
  React.useLayoutEffect(() => {
    const root = ref.current;
    if (root && (!root.contains(document.activeElement) || document.activeElement?.matches(':disabled'))) (controls(root)[0] ?? root).focus();
  }, [phase, ref]);
}

export function trapReviewTab(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const list = controls(event.currentTarget), first = list[0], last = list.at(-1);
  if (!first) { event.preventDefault(); event.currentTarget.focus(); }
  else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
