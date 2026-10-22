import React from 'react';
import type { ApplicationAction, DocumentSession } from '../../application';
import type { Border, LineObject, PolygonObject, PolygonStyle, ShapeObject, ShapeStyle, StrokeDash } from '../../domain';
import {
  DASH_OPTIONS,
  PATTERN_OPTIONS,
  POLYGON_PRESETS,
  applyNativeAction,
  brandPalette,
  currentObject,
  lineStyleAction,
  lineStyleState,
  pointFromMm,
  pointToMm,
  polygonFillOfKind,
  polygonPointsAction,
  polygonStyleAction,
  shapeStyleAction,
} from '../../editor/native-element-authoring';
import { TableColorField } from './TableColorField';
import { TableDecimalField } from './TableDecimalField';
import './NativeStyleSection.css';

export interface NativeStyleSectionProps {
  object: ShapeObject | LineObject | PolygonObject;
  disabled: boolean;
  session: DocumentSession;
  /** Finishes any open edit before a change; `false` means the change must not run. */
  prepare(): boolean;
  onMessage(message: string): void;
}

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

const percent = (opacity: number | undefined) => Math.round((opacity ?? 1) * 100);

/** "Básico" shows what most people need; "Avançado" the finer controls. The choice is per panel, not saved. */
export function AdvancedToggle({ open, onToggle, id, disabled, describedBy }: { open: boolean; onToggle(): void; id: string; disabled?: boolean; describedBy?: string }) {
  return <button type="button" className="vnext-native-advanced-toggle" data-native-advanced="" aria-expanded={open} aria-controls={id}
    disabled={disabled} aria-describedby={describedBy} onClick={onToggle}>
    {open ? 'Menos opções (Básico)' : 'Mais opções (Avançado)'}
  </button>;
}

export function DashChoice({ value, disabled, onPick, name }: { value: StrokeDash | undefined; disabled: boolean; onPick(dash: StrokeDash): void; name: string }) {
  return <div className="vnext-native-choice" role="group" aria-label={name}>
    {DASH_OPTIONS.map((option) => (
      <button key={option.value} type="button" data-native-dash={option.value} aria-pressed={(value ?? 'solid') === option.value}
        disabled={disabled} onClick={() => onPick(option.value)}>{option.label}</button>
    ))}
  </div>;
}

/**
 * Onda 3.5 (P1.1/E1/E7): the side-panel block of a selected "Forma", "Linha" or "Polígono". Every control is one
 * typed action (shape.setStyle, line.setStyle, polygon.setStyle, polygon.setPoints) and one Desfazer.
 */
export function NativeStyleSection({ object, disabled, session, prepare, onMessage }: NativeStyleSectionProps): React.ReactElement {
  const { document } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [advanced, setAdvanced] = React.useState(false);
  const current = currentObject(document, object.id, object.type) ?? object;
  const palette = brandPalette(document.style);
  const idBase = `vnext-native-${object.id}`;
  const run = (build: () => ApplicationAction | undefined) => {
    if (disabled || !prepare()) return;
    const action = build();
    if (!action) return;
    const outcome = applyNativeAction(session, action, createTransactionId());
    if (outcome.message) onMessage(outcome.message);
  };
  // Every change is prepared from the object as it is in the catalog right now.
  const latest = <T extends 'shape' | 'line' | 'polygon'>(type: T) => currentObject(session.getSnapshot().document, object.id, type);

  const heading = current.type === 'shape' ? 'Forma' : current.type === 'line' ? 'Linha' : 'Polígono';
  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-native-style" data-native-style={current.type} aria-labelledby={`${idBase}-heading`}>
        <h3 id={`${idBase}-heading`}>{heading}</h3>
        {disabled && <p className="vnext-authoring-guidance">O objeto está bloqueado. Desbloqueie para mudar a aparência.</p>}
        {current.type === 'shape' && <ShapeControls shape={current} palette={palette} advanced={advanced} disabled={disabled}
          change={(next) => run(() => { const shape = latest('shape'); return shape && shapeStyleAction(shape, next(shape.style)); })} />}
        {current.type === 'line' && <LineControls line={current} palette={palette} advanced={advanced} disabled={disabled}
          change={(next) => run(() => { const line = latest('line'); return line && lineStyleAction(line, next(lineStyleState(line))); })} />}
        {current.type === 'polygon' && <PolygonControls polygon={current} palette={palette} advanced={advanced} disabled={disabled}
          change={(next) => run(() => { const polygon = latest('polygon'); return polygon && polygonStyleAction(polygon, next(polygon.style)); })}
          changePoints={(points) => run(() => { const polygon = latest('polygon'); return polygon && polygonPointsAction(polygon, points); })} />}
        <AdvancedToggle open={advanced} onToggle={() => setAdvanced((open) => !open)} id={`${idBase}-advanced`} />
      </section>
    </>
  );
}

function OpacityField({ value, disabled, onCommit }: { value: number | undefined; disabled: boolean; onCommit(opacity: number | undefined): void }) {
  return <label className="vnext-native-field">
    <span>Opacidade</span>
    <TableDecimalField name="Opacidade" value={percent(value)} unit="%" range="zeroOrMore" max={100} integer example="80"
      className="vnext-style-number" disabled={disabled} inputProps={{ 'data-native-opacity': '' }}
      onCommit={(next) => { if (next !== null) onCommit(next >= 100 ? undefined : next / 100); }} />
  </label>;
}

function StrokeControls({ stroke, dash, palette, advanced, disabled, onStroke, onDash }: {
  stroke: Border | undefined; dash: StrokeDash | undefined; palette: readonly string[]; advanced: boolean; disabled: boolean;
  onStroke(stroke: Border | undefined): void; onDash(dash: StrokeDash): void;
}) {
  const solid = stroke?.pattern === 'solid' ? stroke : undefined;
  return <>
    <div className="vnext-native-group" role="group" aria-label="Contorno">
      <span className="vnext-text-basic-label">Contorno</span>
      <TableColorField swatchLabel="Cor do contorno" pickerLabel="Outra cor do contorno" value={solid?.color} palette={palette}
        disabled={disabled} pickerProps={{ 'data-native-stroke-picker': '' }}
        onPick={(color) => onStroke({ pattern: 'solid', thicknessPt: solid?.thicknessPt ?? 1, color })} />
      <button type="button" data-native-stroke-none="" aria-pressed={!solid} disabled={disabled || !solid} onClick={() => onStroke(undefined)}>Sem contorno</button>
    </div>
    {advanced && solid && <>
      <label className="vnext-native-field">
        <span>Espessura do contorno</span>
        <TableDecimalField name="Espessura do contorno" value={solid.thicknessPt} unit="pt" max={24} example="1,5"
          className="vnext-style-number" disabled={disabled} inputProps={{ 'data-native-stroke-width': '' }}
          onCommit={(next) => { if (next !== null) onStroke({ ...solid, thicknessPt: next }); }} />
      </label>
      <DashChoice name="Traço do contorno" value={dash} disabled={disabled} onPick={onDash} />
    </>}
  </>;
}

function ShapeControls({ shape, palette, advanced, disabled, change }: {
  shape: ShapeObject; palette: readonly string[]; advanced: boolean; disabled: boolean; change(next: (style: ShapeStyle) => ShapeStyle): void;
}) {
  const style = shape.style;
  return <>
    <div className="vnext-native-group" role="group" aria-label="Preenchimento">
      <span className="vnext-text-basic-label">Preenchimento</span>
      <TableColorField swatchLabel="Cor de preenchimento" pickerLabel="Outra cor de preenchimento" value={style.fill} palette={palette}
        disabled={disabled} pickerProps={{ 'data-native-fill-picker': '' }} onPick={(color) => change((current) => ({ ...current, fill: color }))} />
      <button type="button" data-native-fill-none="" aria-pressed={!style.fill} disabled={disabled || !style.fill}
        onClick={() => change(({ fill: _fill, ...rest }) => rest)}>Sem preenchimento</button>
    </div>
    <StrokeControls stroke={style.stroke} dash={style.strokeDash} palette={palette} advanced={advanced} disabled={disabled}
      onStroke={(stroke) => change(({ stroke: _stroke, strokeDash, ...rest }) => (stroke ? { ...rest, stroke, ...(strokeDash ? { strokeDash } : {}) } : rest))}
      onDash={(dash) => change(({ strokeDash: _dash, ...rest }) => (dash === 'solid' ? rest : { ...rest, strokeDash: dash }))} />
    {advanced && <>
      {shape.shape === 'rectangle' && <label className="vnext-native-field">
        <span>Cantos arredondados</span>
        <TableDecimalField name="Cantos arredondados" value={style.cornerRadiusMm ?? 0} unit="mm" range="zeroOrMore" max={150} example="2"
          className="vnext-style-number" disabled={disabled} inputProps={{ 'data-native-corner-radius': '' }}
          onCommit={(next) => change(({ cornerRadiusMm: _radius, ...rest }) => (next ? { ...rest, cornerRadiusMm: next } : rest))} />
      </label>}
      <OpacityField value={style.opacity} disabled={disabled}
        onCommit={(opacity) => change(({ opacity: _opacity, ...rest }) => (opacity === undefined ? rest : { ...rest, opacity }))} />
    </>}
  </>;
}

type LineState = ReturnType<typeof lineStyleState>;

function LineControls({ line, palette, advanced, disabled, change }: {
  line: LineObject; palette: readonly string[]; advanced: boolean; disabled: boolean; change(next: (style: LineState) => LineState): void;
}) {
  const horizontal = line.axis === 'horizontal';
  const boxThicknessPt = Math.round(((horizontal ? line.frame.heightMm : line.frame.widthMm) * 72 / 25.4) * 100) / 100;
  return <>
    <div className="vnext-native-group" role="group" aria-label="Cor da linha">
      <span className="vnext-text-basic-label">Cor</span>
      <TableColorField swatchLabel="Cor da linha" pickerLabel="Outra cor da linha" value={line.color} palette={palette}
        disabled={disabled} pickerProps={{ 'data-native-line-picker': '' }} onPick={(color) => change((current) => ({ ...current, color }))} />
    </div>
    <label className="vnext-native-field">
      <span>Espessura</span>
      <TableDecimalField name="Espessura da linha" value={line.thicknessPt ?? boxThicknessPt} unit="pt" max={72} example="0,75"
        className="vnext-style-number" disabled={disabled} inputProps={{ 'data-native-line-width': '' }}
        onCommit={(next) => { if (next !== null) change((current) => ({ ...current, thicknessPt: next })); }} />
    </label>
    <DashChoice name="Traço da linha" value={line.dash} disabled={disabled}
      onPick={(dash) => change(({ dash: _dash, ...rest }) => (dash === 'solid' ? rest : { ...rest, dash }))} />
    {advanced && <OpacityField value={line.opacity} disabled={disabled}
      onCommit={(opacity) => change(({ opacity: _opacity, ...rest }) => (opacity === undefined ? rest : { ...rest, opacity }))} />}
  </>;
}

function PolygonControls({ polygon, palette, advanced, disabled, change, changePoints }: {
  polygon: PolygonObject; palette: readonly string[]; advanced: boolean; disabled: boolean;
  change(next: (style: PolygonStyle) => PolygonStyle): void; changePoints(points: PolygonObject['points']): void;
}) {
  const style = polygon.style, fill = style.fill;
  const kind = fill?.kind ?? 'solid';
  return <>
    <div className="vnext-native-group" role="group" aria-label="Tipo de preenchimento">
      <span className="vnext-text-basic-label">Preenchimento</span>
      <div className="vnext-native-choice">
        {([['solid', 'Cor'], ['linear', 'Degradê'], ['pattern', 'Padrão']] as const).map(([value, label]) => (
          <button key={value} type="button" data-native-fill-kind={value} aria-pressed={kind === value} disabled={disabled}
            onClick={() => change((current) => polygonFillOfKind(current, value, palette))}>{label}</button>
        ))}
      </div>
      {(!fill || fill.kind === 'solid') && <TableColorField swatchLabel="Cor de preenchimento" pickerLabel="Outra cor de preenchimento"
        value={fill?.color} palette={palette} disabled={disabled} pickerProps={{ 'data-native-fill-picker': '' }}
        onPick={(color) => change((current) => ({ ...current, fill: { kind: 'solid', color } }))} />}
      {fill?.kind === 'linear' && <>
        <span className="vnext-text-basic-label">Cor inicial</span>
        <TableColorField swatchLabel="Cor inicial do degradê" pickerLabel="Outra cor inicial" value={fill.from} palette={palette}
          disabled={disabled} pickerProps={{ 'data-native-gradient-from': '' }}
          onPick={(color) => change((current) => ({ ...current, fill: { ...fill, from: color } }))} />
        <span className="vnext-text-basic-label">Cor final</span>
        <TableColorField swatchLabel="Cor final do degradê" pickerLabel="Outra cor final" value={fill.to} palette={palette}
          disabled={disabled} pickerProps={{ 'data-native-gradient-to': '' }}
          onPick={(color) => change((current) => ({ ...current, fill: { ...fill, to: color } }))} />
        <label className="vnext-native-field">
          <span>Direção</span>
          <TableDecimalField name="Direção do degradê" value={fill.angleDeg} unit="°" range="zeroOrMore" max={360} example="90"
            className="vnext-style-number" disabled={disabled} inputProps={{ 'data-native-gradient-angle': '' }}
            onCommit={(next) => { if (next !== null) change((current) => ({ ...current, fill: { ...fill, angleDeg: next } })); }} />
        </label>
      </>}
      {fill?.kind === 'pattern' && <>
        <div className="vnext-native-choice" role="group" aria-label="Desenho do padrão">
          {PATTERN_OPTIONS.map((option) => (
            <button key={option.value} type="button" data-native-pattern={option.value} aria-pressed={fill.pattern === option.value}
              disabled={disabled} onClick={() => change((current) => ({ ...current, fill: { ...fill, pattern: option.value } }))}>{option.label}</button>
          ))}
        </div>
        <span className="vnext-text-basic-label">Cor do desenho</span>
        <TableColorField swatchLabel="Cor do desenho" pickerLabel="Outra cor do desenho" value={fill.color} palette={palette}
          disabled={disabled} pickerProps={{ 'data-native-pattern-color': '' }}
          onPick={(color) => change((current) => ({ ...current, fill: { ...fill, color } }))} />
        <span className="vnext-text-basic-label">Cor de fundo</span>
        <TableColorField swatchLabel="Cor de fundo do padrão" pickerLabel="Outra cor de fundo" value={fill.background} palette={palette}
          disabled={disabled} pickerProps={{ 'data-native-pattern-background': '' }}
          onPick={(color) => change((current) => ({ ...current, fill: { ...fill, background: color } }))} />
        {advanced && <label className="vnext-native-field">
          <span>Espaço entre desenhos</span>
          <TableDecimalField name="Espaço entre desenhos" value={fill.spacingMm} unit="mm" max={30} example="4"
            className="vnext-style-number" disabled={disabled} inputProps={{ 'data-native-pattern-spacing': '' }}
            onCommit={(next) => { if (next !== null) change((current) => ({ ...current, fill: { ...fill, spacingMm: Math.max(1, next) } })); }} />
        </label>}
      </>}
    </div>
    {advanced && <>
      <StrokeControls stroke={style.stroke} dash={style.strokeDash} palette={palette} advanced={advanced} disabled={disabled}
        onStroke={(stroke) => change(({ stroke: _stroke, strokeDash, ...rest }) => (stroke ? { ...rest, stroke, ...(strokeDash ? { strokeDash } : {}) } : rest))}
        onDash={(dash) => change(({ strokeDash: _dash, ...rest }) => (dash === 'solid' ? rest : { ...rest, strokeDash: dash }))} />
      <OpacityField value={style.opacity} disabled={disabled}
        onCommit={(opacity) => change(({ opacity: _opacity, ...rest }) => (opacity === undefined ? rest : { ...rest, opacity }))} />
      <div className="vnext-native-group" role="group" aria-label="Formato">
        <span className="vnext-text-basic-label">Formato</span>
        <div className="vnext-native-choice">
          {POLYGON_PRESETS.map((preset) => (
            <button key={preset.id} type="button" data-native-polygon-preset={preset.id} disabled={disabled}
              onClick={() => changePoints(preset.points)}>{preset.label}</button>
          ))}
        </div>
        <p className="vnext-text-basic-hint">Pontos em milímetros, medidos do canto de cima à esquerda da caixa.</p>
        <ol className="vnext-native-points">
          {polygon.points.map((point, index) => {
            const mm = pointToMm(point, polygon.frame);
            const commit = (axis: 'x' | 'y', value: number | null) => {
              if (value === null) return;
              const next = polygon.points.map((entry, entryIndex) => entryIndex !== index ? entry
                : pointFromMm(axis === 'x' ? value : mm.xMm, axis === 'y' ? value : mm.yMm, polygon.frame));
              changePoints(next);
            };
            return <li key={index} data-native-point={index}>
              <span>Ponto {index + 1}</span>
              <TableDecimalField name={`Ponto ${index + 1} (X)`} ariaLabel={`Ponto ${index + 1}, X`} value={mm.xMm} unit="mm" range="zeroOrMore"
                max={polygon.frame.widthMm} example="10" className="vnext-style-number" disabled={disabled}
                inputProps={{ 'data-native-point-x': String(index) }} onCommit={(value) => commit('x', value)} />
              <TableDecimalField name={`Ponto ${index + 1} (Y)`} ariaLabel={`Ponto ${index + 1}, Y`} value={mm.yMm} unit="mm" range="zeroOrMore"
                max={polygon.frame.heightMm} example="10" className="vnext-style-number" disabled={disabled}
                inputProps={{ 'data-native-point-y': String(index) }} onCommit={(value) => commit('y', value)} />
            </li>;
          })}
        </ol>
      </div>
    </>}
  </>;
}
