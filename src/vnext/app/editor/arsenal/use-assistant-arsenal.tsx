import React from 'react';
import {
  arsenalPresetMatchesQuery,
  type ArsenalPreset,
  type ArsenalPresetSummary,
} from '../../../arsenal';
import {
  createAssistantArsenal,
  type AssistantArsenal,
  type AssistantArsenalSaveRequest,
} from '../../../arsenal/assistant-arsenal';
import { analyzeLocalRequest } from '../../../arsenal/local-router';
import { ArsenalService, type ArsenalServiceSnapshot } from '../../../arsenal/service';
import type { PageThumbnailDocument } from '../PageThumbnail';
import { ArsenalPresetThumbnail } from './ArsenalThumbnail';
import { arsenalRandomId, type ArsenalEditorRuntime } from './arsenal-runtime';

/**
 * Onda 4.5 — the arsenal as the assistant sees it (integration of the screen and the AI slices): the same
 * repository, insertion and capture as the "Arsenal" panel, the list kept by `ArsenalService` (read once when the
 * editor opens, again after something is saved and when the panel closes) and the cards' pictures drawn by the
 * panel's thumbnail. Using a preset from the chat never calls the AI.
 */

export interface UseAssistantArsenalOptions {
  readonly runtime: ArsenalEditorRuntime | undefined;
  /** The open catalog and its image addresses (the cards' pictures). */
  readonly document: PageThumbnailDocument;
  readonly assetUrls: ReadonlyMap<string, string>;
  /** Changes after something was saved in the arsenal (the list is read again). */
  readonly refreshKey: number;
  /** Whether the panel is open: closing it reads the list again (renamed, deleted or used presets). */
  readonly galleryOpen: boolean;
  /** "Ver outros" → "Abrir o arsenal" with these words in the search. */
  readonly openGallery?: (query: string) => void;
  /** After the chat saved a page in the arsenal (the panel reads its list again). */
  readonly onSaved?: () => void;
}

const EMPTY_SNAPSHOT: ArsenalServiceSnapshot = Object.freeze({ status: 'idle', presets: Object.freeze([]) });
const noSubscription = () => () => undefined;
const emptySnapshot = () => EMPTY_SNAPSHOT;

/**
 * The words of a chat request worth putting in the panel's search: the words that carry meaning ("bota a capa azul"
 * → "capa azul"), keeping only those that still find something, so "Ver outros" never opens an empty gallery.
 */
export function arsenalGalleryQueryFor(message: string, presets: readonly ArsenalPresetSummary[]): string {
  const words = [...new Set(analyzeLocalRequest(message).content.map((token) => token.word).filter((word) => !/^\d+$/.test(word)))];
  const kept: string[] = [];
  for (const word of words) {
    const query = [...kept, word].join(' ');
    if (presets.some((preset) => arsenalPresetMatchesQuery(preset, query))) kept.push(word);
  }
  return kept.join(' ');
}

/** A card picture in the chat: the preset is loaded once (the service keeps it by revision). */
function AssistantArsenalThumbnail({ summary, service, document, assetUrls, runtime }: {
  readonly summary: ArsenalPresetSummary;
  readonly service: ArsenalService;
  readonly document: PageThumbnailDocument;
  readonly assetUrls: ReadonlyMap<string, string>;
  readonly runtime: ArsenalEditorRuntime;
}) {
  const [preset, setPreset] = React.useState<ArsenalPreset | null>(null);
  React.useEffect(() => {
    let alive = true;
    void service.load([summary.id]).then((result) => {
      if (alive && result.ok && result.value[0]) setPreset(result.value[0]);
    }, () => undefined);
    return () => { alive = false; };
  }, [service, summary.id, summary.revision]);
  if (!preset || preset.revision !== summary.revision) {
    return <span className="vnext-arsenal-thumb is-empty" aria-hidden="true" data-arsenal-thumb="loading" />;
  }
  return <ArsenalPresetThumbnail preset={preset} document={document} assetUrls={assetUrls} builder={runtime.previewBuilder} />;
}

export function useAssistantArsenal({
  runtime, document, assetUrls, refreshKey, galleryOpen, openGallery, onSaved,
}: UseAssistantArsenalOptions): AssistantArsenal | undefined {
  const service = React.useMemo(() => runtime
    ? runtime.service ?? new ArsenalService({ repository: runtime.repository, createId: () => arsenalRandomId(runtime), viewer: runtime.viewer })
    : undefined, [runtime]);
  const snapshot = React.useSyncExternalStore(service?.subscribe ?? noSubscription, service?.getSnapshot ?? emptySnapshot, service?.getSnapshot ?? emptySnapshot);

  // Read when the editor opens, after a save and when the panel closes; never per request (the router is local).
  React.useEffect(() => {
    if (service && !galleryOpen) void service.refresh().catch(() => undefined);
  }, [service, galleryOpen, refreshKey]);

  // The latest look and callbacks without rebuilding the assistant's arsenal on every edit.
  const look = React.useRef({ document, assetUrls });
  look.current = { document, assetUrls };
  const callbacks = React.useRef({ openGallery, onSaved });
  callbacks.current = { openGallery, onSaved };
  const hasGallery = Boolean(openGallery);

  return React.useMemo(() => {
    if (!runtime || !service) return undefined;
    const presets = snapshot.presets;
    const base = createAssistantArsenal({
      repository: runtime.repository,
      insertion: runtime.insertion,
      capture: runtime.capture,
      presets,
      isAssetAvailable: runtime.isAssetAvailable ?? (async () => false),
      createId: () => arsenalRandomId(runtime),
      ...(hasGallery ? { openGallery: (message: string) => callbacks.current.openGallery?.(arsenalGalleryQueryFor(message, presets)) } : {}),
      renderThumbnail: (summary) => (
        <AssistantArsenalThumbnail key={`${summary.id}@${summary.revision}`} summary={summary} service={service}
          document={look.current.document} assetUrls={look.current.assetUrls} runtime={runtime} />
      ),
    });
    const save = base.save;
    return {
      ...base,
      ...(save ? {
        async save(request: AssistantArsenalSaveRequest) {
          const result = await save(request);
          if (result.ok) callbacks.current.onSaved?.();
          return result;
        },
      } : {}),
    };
  }, [hasGallery, runtime, service, snapshot.presets]);
}
