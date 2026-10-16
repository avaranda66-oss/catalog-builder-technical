import React from 'react';
import type { ManualSaveResult } from '../../persistence/save-coordinator';
import type { SavePhase } from '../../persistence';

export interface PublishActionProps {
  /** Finishes open text/cell edits; returns false when the editor cannot leave the current edit. */
  prepare: () => boolean;
  /** Present for saved catalogs: the review only runs on the saved version, so Publicar saves first. */
  save?: { readonly phase: SavePhase; readonly run: () => Promise<ManualSaveResult> };
  onOpen: () => void;
  onMessage: (message: string) => void;
}

const SAVE_NEEDED_MESSAGE = 'Para publicar, o catálogo precisa estar salvo, e não foi possível salvar agora. '
  + 'Confira o aviso de salvamento e clique em Publicar / PDF novamente.';

/**
 * FR-50: "Publicar / PDF" saves before opening the review. The button keeps focus while saving (it is never
 * `disabled`), so closing the review returns the person to it.
 */
export function PublishAction({ prepare, save, onOpen, onMessage }: PublishActionProps) {
  const [saving, setSaving] = React.useState(false);
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const publish = async () => {
    if (busy.current || !prepare()) return;
    if (!save) { onOpen(); return; }
    if (save.phase === 'conflict') {
      onMessage('Antes de publicar, escolha o que fazer com o conflito de salvamento, no aviso acima da página.');
      return;
    }
    busy.current = true;
    setSaving(true);
    try {
      const result = await save.run();
      if (!mounted.current) return;
      if (!result.ok && result.error.code !== 'SAVE_IN_FLIGHT_NEWER_WORK') {
        onMessage(SAVE_NEEDED_MESSAGE);
        return;
      }
      onOpen();
    } catch {
      // The save itself threw (for example, the browser storage failed): explain instead of failing silently.
      if (mounted.current) onMessage(SAVE_NEEDED_MESSAGE);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <button
      type="button"
      className="vnext-action-publish"
      data-editor-action="publish"
      data-authoring-context-transition=""
      aria-busy={saving || undefined}
      onClick={() => { void publish(); }}
    >
      {saving ? 'Salvando…' : 'Publicar / PDF'}
    </button>
  );
}
