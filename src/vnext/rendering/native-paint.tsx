import React, { type CSSProperties } from 'react';
import type { Border, LineObject, Paint, PolygonObject, StrokeDash, TextLeader } from '../domain/editorial-model';
import { mmToU, qCss, uToQ } from '../domain/physical';

/**
 * Onda 3.5 (P1/P2): native paint for the cover art that used to be baked into PNGs (polygon with solid, gradient
 * or pattern fill; styled lines; callout pointers). Everything is plain SVG/CSS inside the object box, so the
 * screen and the printed PDF (the same DOM, `window.print`) draw the same thing, and the measured box of every
 * object stays its authored frame (no transforms).
 */

export const PT_TO_MM = 25.4 / 72;
const px = (mm: number) => qCss(uToQ(mmToU(mm)));
const round = (value: number) => Math.round(value * 1000) / 1000;

/** SVG dash pattern for a stroke `widthMm` wide; undefined means a continuous stroke. */
export function svgDashArray(dash: StrokeDash | undefined, widthMm: number): string | undefined {
  if (!dash || dash === 'solid') return undefined;
  if (dash === 'dashed') return `${round(Math.max(3 * widthMm, 1.2))} ${round(Math.max(2 * widthMm, 0.8))}`;
  return `0 ${round(Math.max(2 * widthMm, 0.6))}`;
}

/** CSS border shorthand of a shape stroke, honouring the dash style. */
export function cssStroke(stroke: Border | undefined, dash: StrokeDash | undefined): CSSProperties['border'] {
  if (!stroke || stroke.pattern === 'none') return 'none';
  return `${stroke.thicknessPt}pt ${dash ?? 'solid'} ${stroke.color}`;
}

/** Endpoints of a linear gradient across the object box, 0° = left to right, 90° = top to bottom. */
export function gradientVector(angleDeg: number): { x1: number; y1: number; x2: number; y2: number } {
  const radians = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(radians) / 2, dy = Math.sin(radians) / 2;
  return { x1: round(0.5 - dx), y1: round(0.5 - dy), x2: round(0.5 + dx), y2: round(0.5 + dy) };
}

function domId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '');
}

function PaintDefs({ paint, id }: { paint: Paint; id: string }): React.ReactElement | null {
  if (paint.kind === 'linear') {
    const vector = gradientVector(paint.angleDeg);
    return <linearGradient id={id} gradientUnits="objectBoundingBox" {...vector}>
      <stop offset="0" stopColor={paint.from} />
      <stop offset="1" stopColor={paint.to} />
    </linearGradient>;
  }
  if (paint.kind === 'pattern') {
    const s = paint.spacingMm;
    const ink = paint.pattern === 'dots'
      ? <circle cx={round(s / 2)} cy={round(s / 2)} r={round(s * 0.18)} fill={paint.color} />
      : paint.pattern === 'lines'
        ? <path d={`M0 ${s} L${s} 0 M${round(-s / 4)} ${round(s / 4)} L${round(s / 4)} ${round(-s / 4)} M${round(3 * s / 4)} ${round(5 * s / 4)} L${round(5 * s / 4)} ${round(3 * s / 4)}`}
          stroke={paint.color} strokeWidth={round(s * 0.12)} fill="none" />
        : <path d={`M0 ${round(s / 2)} Q${round(s / 4)} ${round(s * 0.2)} ${round(s / 2)} ${round(s / 2)} T${s} ${round(s / 2)}`}
          stroke={paint.color} strokeWidth={round(s * 0.08)} fill="none" />;
    return <pattern id={id} patternUnits="userSpaceOnUse" width={s} height={s}>{ink}</pattern>;
  }
  return null;
}

/** The polygon in its box: vertices are fractions of the frame, the drawing unit is the millimetre. */
export function PolygonPaint({ object }: { object: PolygonObject }): React.ReactElement {
  const reactId = domId(React.useId());
  const { widthMm: w, heightMm: h } = object.frame;
  const points = object.points.map((point) => `${round(point.x * w)},${round(point.y * h)}`).join(' ');
  const fill = object.style.fill;
  const paintId = `vnext-paint-${reactId}`;
  const stroke = object.style.stroke && object.style.stroke.pattern === 'solid' ? object.style.stroke : undefined;
  const strokeMm = stroke ? stroke.thicknessPt * PT_TO_MM : 0;
  const fillValue = !fill ? 'none' : fill.kind === 'solid' ? fill.color : `url(#${paintId})`;
  return <svg data-primitive-type="polygon" className="editorial-polygon" aria-hidden="true" width="100%" height="100%"
    viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
    style={{ display: 'block', overflow: 'visible', opacity: object.style.opacity }}>
    {fill && fill.kind !== 'solid' && <defs><PaintDefs paint={fill} id={paintId} /></defs>}
    {fill?.kind === 'pattern' && fill.background && <polygon points={points} fill={fill.background} />}
    <polygon points={points} fill={fillValue}
      stroke={stroke?.color ?? 'none'} strokeWidth={stroke ? round(strokeMm) : undefined}
      strokeDasharray={stroke ? svgDashArray(object.style.strokeDash, strokeMm) : undefined}
      strokeLinecap={object.style.strokeDash === 'dotted' ? 'round' : undefined} strokeLinejoin="round" />
  </svg>;
}

/** True when a line uses any Onda 3.5 style; a plain line keeps the original full-box paint. */
export function lineHasStyle(line: LineObject): boolean {
  return line.thicknessPt !== undefined || (line.dash !== undefined && line.dash !== 'solid') || line.opacity !== undefined;
}

/**
 * A styled line runs through the middle of its box. Without `thicknessPt` it is as thick as the box (the original
 * meaning of a line's height/width); with it, the box only reserves room.
 */
export function LinePaint({ object }: { object: LineObject }): React.ReactElement {
  const { widthMm: w, heightMm: h } = object.frame;
  const horizontal = object.axis === 'horizontal';
  const thicknessMm = object.thicknessPt !== undefined ? object.thicknessPt * PT_TO_MM : horizontal ? h : w;
  const dotted = object.dash === 'dotted';
  const inset = dotted ? thicknessMm / 2 : 0;
  const coordinates = horizontal
    ? { x1: round(inset), y1: round(h / 2), x2: round(w - inset), y2: round(h / 2) }
    : { x1: round(w / 2), y1: round(inset), x2: round(w / 2), y2: round(h - inset) };
  return <svg data-primitive-type="line" data-line-axis={object.axis} className="editorial-line" aria-hidden="true"
    width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
    style={{ display: 'block', overflow: 'visible', opacity: object.opacity }}>
    <line {...coordinates} stroke={object.color} strokeWidth={round(thicknessMm)}
      strokeDasharray={svgDashArray(object.dash, thicknessMm)} strokeLinecap={dotted ? 'round' : 'butt'} />
  </svg>;
}

export interface LeaderGeometry {
  /** Polyline from the label to the anchor, in mm from the box's top-left corner. Empty: the anchor is inside the box. */
  points: readonly (readonly [number, number])[];
  /** Painted extent (line, head) in mm from the box's top-left corner. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  headMm: number;
}

/** Where the pointer leaves the label and how far its paint reaches; shared by the renderer and the preflight. */
export function leaderGeometry(size: { widthMm: number; heightMm: number }, leader: TextLeader): LeaderGeometry {
  const w = size.widthMm, h = size.heightMm, ax = leader.anchorXMm, ay = leader.anchorYMm;
  const strokeMm = leader.thicknessPt * PT_TO_MM;
  const headMm = leader.head === 'arrow' ? Math.max(1.6, strokeMm * 4) : leader.head === 'dot' ? Math.max(0.9, strokeMm * 2.5) : strokeMm;
  let attach: [number, number] | undefined;
  let elbow: [number, number] | undefined;
  if (ax < 0 || ax > w) {
    attach = [ax < 0 ? 0 : w, h / 2];
    if (leader.elbow) elbow = [attach[0] + (ax - attach[0]) / 2, attach[1]];
  } else if (ay < 0 || ay > h) {
    attach = [w / 2, ay < 0 ? 0 : h];
    if (leader.elbow) elbow = [attach[0], attach[1] + (ay - attach[1]) / 2];
  }
  const points = attach ? [attach, ...(elbow ? [elbow] : []), [ax, ay] as [number, number]] : [];
  const xs = points.map((point) => point[0]), ys = points.map((point) => point[1]);
  const bounds = points.length
    ? { minX: Math.min(0, ...xs.map((x) => x - headMm)), minY: Math.min(0, ...ys.map((y) => y - headMm)),
      maxX: Math.max(w, ...xs.map((x) => x + headMm)), maxY: Math.max(h, ...ys.map((y) => y + headMm)) }
    : { minX: 0, minY: 0, maxX: w, maxY: h };
  return { points: points.map(([x, y]) => [round(x), round(y)] as const), bounds, headMm: round(headMm) };
}

/** The pointer of a callout: drawn outside the label box, never moving or resizing that box. */
export function LeaderPaint({ size, leader }: { size: { widthMm: number; heightMm: number }; leader: TextLeader }): React.ReactElement | null {
  const geometry = leaderGeometry(size, leader);
  if (geometry.points.length < 2) return null;
  const { minX, minY, maxX, maxY } = geometry.bounds;
  const width = maxX - minX, height = maxY - minY;
  const strokeMm = leader.thicknessPt * PT_TO_MM;
  const local = geometry.points.map(([x, y]) => [round(x - minX), round(y - minY)] as const);
  const [tipX, tipY] = local[local.length - 1], [fromX, fromY] = local[local.length - 2];
  const length = Math.hypot(tipX - fromX, tipY - fromY) || 1;
  const ux = (tipX - fromX) / length, uy = (tipY - fromY) / length;
  const head = geometry.headMm;
  // The line stops at the base of the arrow, so a thick stroke never pokes through the tip.
  const lineEnd = leader.head === 'arrow' ? [round(tipX - ux * head * 0.9), round(tipY - uy * head * 0.9)] : [tipX, tipY];
  const linePoints = [...local.slice(0, -1), lineEnd].map(([x, y]) => `${x},${y}`).join(' ');
  const arrow = leader.head === 'arrow'
    ? [[tipX, tipY], [tipX - ux * head - uy * head * 0.45, tipY - uy * head + ux * head * 0.45],
      [tipX - ux * head + uy * head * 0.45, tipY - uy * head - ux * head * 0.45]].map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
    : undefined;
  return <svg data-callout-leader="" className="editorial-leader" aria-hidden="true"
    viewBox={`0 0 ${round(width)} ${round(height)}`} preserveAspectRatio="none"
    style={{ position: 'absolute', left: px(minX), top: px(minY), width: px(width), height: px(height), overflow: 'visible', pointerEvents: 'none' }}>
    <polyline points={linePoints} fill="none" stroke={leader.color} strokeWidth={round(strokeMm)} strokeLinejoin="round" strokeLinecap="round" />
    {arrow && <polygon points={arrow} fill={leader.color} />}
    {leader.head === 'dot' && <circle cx={tipX} cy={tipY} r={head} fill={leader.color} />}
  </svg>;
}

/**
 * "Ajustar texto ao selo": the words stay on one line and get smaller (down to 40%) until they fit the box. The
 * scale is measured in the page itself, so the printed PDF keeps it. Returns the scale to apply to the font size.
 */
export function useTextFitScale(flowRef: React.RefObject<HTMLElement>, enabled: boolean, availableWidthMm: number, resetKey: string): number {
  const [state, setState] = React.useState({ key: resetKey, scale: 1, fonts: 0 });
  const scale = state.key === resetKey ? state.scale : 1;
  React.useEffect(() => {
    const fonts = globalThis.document?.fonts;
    if (!fonts?.addEventListener) return;
    const reset = () => setState((current) => ({ key: current.key, scale: 1, fonts: current.fonts + 1 }));
    fonts.addEventListener('loadingdone', reset);
    return () => fonts.removeEventListener('loadingdone', reset);
  }, []);
  React.useLayoutEffect(() => {
    if (state.key !== resetKey) { setState((current) => ({ ...current, key: resetKey, scale: 1 })); return; }
    const flow = flowRef.current;
    if (!enabled || !flow || typeof globalThis.document?.createRange !== 'function') return;
    const range = globalThis.document.createRange();
    range.selectNodeContents(flow);
    const natural = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect().width : 0;
    const available = flow.parentElement?.clientWidth ?? 0;
    if (!(natural > 0) || !(available > 0) || natural <= available + 0.5 || scale <= 0.4) return;
    const next = Math.max(0.4, Math.floor(scale * (available / natural) * 100) / 100);
    if (next < scale) setState((current) => ({ ...current, scale: next }));
  }, [enabled, availableWidthMm, resetKey, scale, state.key, state.fonts, flowRef]);
  return enabled ? scale : 1;
}
