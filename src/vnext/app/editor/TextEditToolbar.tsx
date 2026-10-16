import React from 'react';
import { createPortal } from 'react-dom';
import { useStageZoom } from './use-stage-zoom';

/** Element (not zoomed) that holds the bar; it scrolls together with the page. */
const TOOLBAR_LAYER_SELECTOR = '.vnext-document-preview';
const PAGE_STAGE_SELECTOR = '[data-vnext-page-stage]';
const TEXT_SESSION_SELECTOR = '[data-text-edit-session]';
/** The bar never gets narrower than this, even on a page shown very small ("Página inteira"). */
const MIN_TOOLBAR_WIDTH_PX = 280;

export interface TextEditToolbarProps {
  symbols: readonly string[];
  onSymbol: (symbol: string) => void;
  onCancel: () => void;
  onCommit: () => void;
}

export type TextEditToolbarPlacement = 'below' | 'above';

export interface TextEditToolbarPosition {
  readonly left: number;
  readonly top: number;
  readonly maxWidth: number;
  readonly placement: TextEditToolbarPlacement;
}

type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>;

/**
 * Pure placement of the bar, in the coordinates of the layer that holds it (its scroll offset
 * included). The bar starts at the left edge of the text box, is pushed left so it never goes past
 * the right edge of the page (Onda 1 finding: text boxes in the right column) and sits under the
 * box, or above it when there is no room under it on the page.
 */
export function textEditToolbarPosition(input: {
  text: Box;
  page: Box;
  layer: Box & { scrollLeft: number; scrollTop: number; clientLeft: number; clientTop: number };
  toolbar: { width: number; height: number };
}): TextEditToolbarPosition {
  const { text, page, layer, toolbar } = input;
  const originX = layer.left + layer.clientLeft - layer.scrollLeft;
  const originY = layer.top + layer.clientTop - layer.scrollTop;
  const maxWidth = Math.max(MIN_TOOLBAR_WIDTH_PX, Math.floor(page.width));
  const width = Math.min(toolbar.width, maxWidth);
  const rightmost = Math.max(page.left, page.right - width);
  const left = Math.min(Math.max(text.left, page.left), rightmost);
  const fitsBelow = text.bottom + toolbar.height <= page.bottom;
  const fitsAbove = text.top - toolbar.height >= page.top;
  const placement: TextEditToolbarPlacement = !fitsBelow && fitsAbove ? 'above' : 'below';
  const top = placement === 'below' ? text.bottom : text.top - toolbar.height;
  return { left: Math.round(left - originX), top: Math.round(top - originY), maxWidth, placement };
}

/**
 * FR-16b: the bar of a text being edited (technical symbols, Cancelar, Concluir). It is drawn
 * outside the zoomed page, at its real size, so the buttons keep 44 px at any zoom. A hidden
 * marker stays inside the text box; the bar itself goes into the page area next to the page and
 * is placed from the box measured on screen. It carries `data-text-edit-session` too, so a click
 * on it counts as a click inside the text being edited (it does not conclude the text first).
 */
export function TextEditToolbar({ symbols, onSymbol, onCancel, onCommit }: TextEditToolbarProps) {
  const markerRef = React.useRef<HTMLSpanElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const [layer, setLayer] = React.useState<HTMLElement | null>(null);
  const [position, setPosition] = React.useState<TextEditToolbarPosition | null>(null);
  const { zoom } = useStageZoom();

  React.useLayoutEffect(() => {
    setLayer(markerRef.current?.closest<HTMLElement>(TOOLBAR_LAYER_SELECTOR) ?? null);
  }, []);

  const place = React.useCallback(() => {
    const session = markerRef.current?.closest<HTMLElement>(TEXT_SESSION_SELECTOR);
    const page = session?.closest<HTMLElement>(PAGE_STAGE_SELECTOR);
    const toolbar = toolbarRef.current;
    if (!session || !page || !toolbar || !layer) return;
    const layerBox = layer.getBoundingClientRect();
    const next = textEditToolbarPosition({
      text: session.getBoundingClientRect(),
      page: page.getBoundingClientRect(),
      layer: { left: layerBox.left, top: layerBox.top, right: layerBox.right, bottom: layerBox.bottom, width: layerBox.width,
        scrollLeft: layer.scrollLeft, scrollTop: layer.scrollTop, clientLeft: layer.clientLeft, clientTop: layer.clientTop },
      toolbar: { width: toolbar.offsetWidth, height: toolbar.offsetHeight },
    });
    setPosition((current) => current && current.left === next.left && current.top === next.top
      && current.maxWidth === next.maxWidth && current.placement === next.placement ? current : next);
  }, [layer]);

  // Before paint: place the bar for the current zoom, and again when the page area changes size.
  React.useLayoutEffect(() => {
    if (!layer) return undefined;
    place();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => place());
    observer?.observe(layer);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [layer, place, zoom]);

  const bar = (
    <div
      ref={toolbarRef}
      className="vnext-text-edit-toolbar"
      role="group"
      aria-label="Ferramentas da edição de texto"
      data-text-edit-session="toolbar"
      data-text-edit-toolbar=""
      data-placement={position?.placement ?? 'below'}
      style={layer ? {
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        maxWidth: position?.maxWidth,
        visibility: position ? undefined : 'hidden',
      } : undefined}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="vnext-text-symbols" role="group" aria-label="Símbolos técnicos">
        {symbols.map((symbol, index) => (
          <button key={symbol} type="button" data-editor-symbol-index={index} aria-label={`Inserir ${symbol}`} onClick={() => onSymbol(symbol)}>
            {symbol}
          </button>
        ))}
      </div>
      <div className="vnext-text-edit-actions">
        <button type="button" data-editor-action="cancel-text" onClick={onCancel}>Cancelar</button>
        <button type="button" className="is-primary" data-editor-action="commit-text" onClick={onCommit}>Concluir</button>
      </div>
    </div>
  );

  return (
    <>
      <span ref={markerRef} hidden data-text-edit-toolbar-anchor="" />
      {layer ? createPortal(bar, layer) : null}
    </>
  );
}
