import React from 'react';
import { qCss, uToQ, mmToU } from '../../domain/physical';
import type { EditorialObject } from '../../domain/editorial-model';
import type { RectU } from '../../editor/object-layers';
import type { FrameU } from '../../application';
import type { ResizeHandle } from '../editor-interaction';
import { useStageZoom } from './use-stage-zoom';

const HANDLES: readonly ResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
/** Below this size on screen (the 7 px each side handle reaches inside would leave less than 14 px free) the side handles of that axis go away and the corners move fully outside. */
export const COMPACT_OBJECT_SCREEN_PX = 28;
const CSS_PX_PER_U = 96 / 25.4 / mmToU(1);

export function compactAxes(frameU: FrameU, zoom: number): { x: boolean; y: boolean } {
  return {
    x: frameU.widthU * CSS_PX_PER_U * zoom < COMPACT_OBJECT_SCREEN_PX,
    y: frameU.heightU * CSS_PX_PER_U * zoom < COMPACT_OBJECT_SCREEN_PX,
  };
}

/** Handles that stay usable for a box of this size (side handles of a compact axis are dropped). */
export function visibleHandles(compact: { x: boolean; y: boolean }): readonly ResizeHandle[] {
  return HANDLES.filter((handle) => {
    if (handle === 'n' || handle === 's') return !compact.y;
    if (handle === 'e' || handle === 'w') return !compact.x;
    return true;
  });
}

const rectStyle = (frame: RectU): React.CSSProperties => ({
  left: qCss(uToQ(frame.xU)), top: qCss(uToQ(frame.yU)), width: qCss(uToQ(frame.widthU)), height: qCss(uToQ(frame.heightU)),
});

export interface SelectionBox {
  object: EditorialObject;
  frameU: FrameU;
  /** Resize handles are offered (one object selected, in select mode, not a group, not locked). */
  resizable: boolean;
  previewing: boolean;
}

export interface SelectionLayerProps {
  boxes: readonly SelectionBox[];
  marquee?: RectU | null;
  handlers: {
    onHandlePointerDown(event: React.PointerEvent<HTMLElement>, object: EditorialObject, handle: ResizeHandle): void;
    onPointerMove(event: React.PointerEvent<HTMLElement>): void;
    onPointerUp(event: React.PointerEvent<HTMLElement>): void;
    onPointerCancel(): void;
    onLostPointerCapture(): void;
  };
}

/**
 * Onda 3.5 (S1): the selection outline and handles are drawn in their own layer above the page, so selecting an
 * object never changes which object is on top (clicks keep reaching what is visible). Only the handles take the
 * pointer; the outline lets clicks through to the objects.
 */
export function SelectionLayer({ boxes, marquee, handlers }: SelectionLayerProps) {
  const { zoom } = useStageZoom();
  return (
    <div className="vnext-selection-layer" data-selection-layer="" aria-hidden={boxes.length === 0 && !marquee ? 'true' : undefined}>
      {boxes.map(({ object, frameU, resizable, previewing }) => {
        const compact = compactAxes(frameU, zoom);
        return (
          <div key={object.id} className={'vnext-selection-box' + (compact.x || compact.y ? ' is-compact' : '')}
            data-selection-box={object.id} style={rectStyle(frameU)}>
            <div className="vnext-selection-outline" aria-hidden="true" />
            {previewing && <div className="vnext-preview-fill" aria-hidden="true" />}
            {resizable && visibleHandles(compact).map((handle) => (
              <button
                key={handle}
                type="button"
                className={'vnext-resize-handle handle-' + handle}
                data-resize-handle={handle}
                aria-label={'Redimensionar ' + handle}
                onPointerDown={(event) => handlers.onHandlePointerDown(event, object, handle)}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
                onLostPointerCapture={handlers.onLostPointerCapture}
              />
            ))}
          </div>
        );
      })}
      {marquee && <div className="vnext-selection-marquee" data-selection-marquee="" style={rectStyle(marquee)} aria-hidden="true" />}
    </div>
  );
}
