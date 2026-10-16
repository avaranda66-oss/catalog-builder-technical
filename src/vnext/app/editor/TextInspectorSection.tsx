import type React from 'react';
import type { DocumentSession } from '../../application';
import type { TextObject } from '../../domain';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';

export interface TextInspectorSectionProps {
  /** The selected text box. */
  object: TextObject;
  simple: boolean;
  /** The text box is locked (or sits in a locked group): nothing here may change it. */
  disabled: boolean;
  session: DocumentSession;
  /** Latest page measurement of the current catalog, or null while it is still being measured. */
  measurement: FitHeightMeasurement | null;
  /** Finishes any open edit before a change; `false` means the change must not run. */
  prepare(): boolean;
  /** Shows a plain message in the editor notices. */
  onMessage(message: string): void;
}

/**
 * FR-92 (costura 2.0): the place in the side panel for a selected text box. Today the panel has no
 * text-only controls, so this section shows nothing. It is mounted with everything a text command
 * needs, so the text style (FR-14) and "Ajustar altura ao texto" (FR-15) are added here without
 * touching EditorWorkspace.
 */
export function TextInspectorSection(_props: TextInspectorSectionProps): React.ReactElement | null {
  return null;
}
