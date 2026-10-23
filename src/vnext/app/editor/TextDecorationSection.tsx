import React from 'react';
import type { ApplicationAction, DocumentSession } from '../../application';
import type { TextBox, TextLeader, TextObject } from '../../domain';
import {
  LEADER_HEAD_OPTIONS,
  applyNativeAction,
  brandPalette,
  currentObject,
  defaultTextBox,
  defaultTextLeader,
  leaderAnchorOnPage,
  leaderWithAnchorOnPage,
  textBoxAction,
  textLeaderAction,
} from '../../editor/native-element-authoring';
import { familyBarOf, highlightFamilyModel } from '../../editor/family-bar-highlight';
import { AdvancedToggle } from './NativeStyleSection';
import { TableColorField } from './TableColorField';
import { TableDecimalField } from './TableDecimalField';
import './NativeStyleSection.css';

export interface TextDecorationSectionProps {
  object: TextObject;
  disabled: boolean;
  session: DocumentSession;
  prepare(): boolean;
  onMessage(message: string): void;
}

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/**
 * Onda 3.5 (E2/E3): "Selo" (the text's own rounded background) and "Chamada" (the text's pointer to a point of the
 * photo). The words, the background and the pointer are one object, so they always move together.
 */
export function TextDecorationSection({ object, disabled, session, prepare, onMessage }: TextDecorationSectionProps): React.ReactElement {
  const { document } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [advanced, setAdvanced] = React.useState(false);
  const current = currentObject(document, object.id, 'text') ?? object;
  const palette = brandPalette(document.style);
  const idBase = `vnext-text-decoration-${object.id}`;
  const run = (build: (text: TextObject) => ApplicationAction) => {
    if (disabled || !prepare()) return;
    const latest = currentObject(session.getSnapshot().document, object.id, 'text');
    if (!latest) return;
    const outcome = applyNativeAction(session, build(latest), createTransactionId());
    if (outcome.message) onMessage(outcome.message);
  };
  const setBox = (next: (box: TextBox) => TextBox | null) => run((text) => textBoxAction(text, text.box ? next(text.box) : next(defaultTextBox(document.style))));
  const setLeader = (next: (leader: TextLeader, text: TextObject) => TextLeader | null) =>
    run((text) => textLeaderAction(text, next(text.leader ?? defaultTextLeader(text, document.style), text)));
  const box = current.box, leader = current.leader;
  const anchor = leader ? leaderAnchorOnPage(current, leader) : undefined;
  // Onda 4 (P): a selo of a family bar ("KOMPRESSOR-Y18 … HÍBRIDO") can take the highlight in one step.
  const page = box ? document.pages.find((entry) => entry.objects.some((candidate) => candidate.id === object.id)) : undefined;
  const bar = page ? familyBarOf(page, object.id, document.style.defaultText.color) : undefined;
  const highlight = () => {
    if (disabled || !page || !prepare()) return;
    onMessage(highlightFamilyModel(session, page.id, object.id, createTransactionId()).message);
  };
  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-native-style" data-text-decoration="" aria-labelledby={`${idBase}-heading`}>
        <h3 id={`${idBase}-heading`}>{box ? 'Selo' : leader ? 'Chamada' : 'Fundo e seta do texto'}</h3>
        {box && bar && (bar.highlighted.id === object.id
          ? <p className="vnext-text-basic-hint" data-family-bar-current="">Este é o modelo destacado da barra.</p>
          : <div className="vnext-native-choice">
            <button type="button" data-family-bar-highlight="" disabled={disabled} onClick={highlight}
              title="Este selo fica com a cor de destaque e a seta vem para cima dele. Um passo de Desfazer.">Destacar este modelo</button>
          </div>)}
        {box && <>
          <div className="vnext-native-group" role="group" aria-label="Cor do selo">
            <span className="vnext-text-basic-label">Cor do selo</span>
            <TableColorField swatchLabel="Cor do selo" pickerLabel="Outra cor do selo" value={box.fill} palette={palette} disabled={disabled}
              pickerProps={{ 'data-text-box-fill-picker': '' }} onPick={(color) => setBox((value) => ({ ...value, fill: color }))} />
          </div>
          <label className="vnext-native-field">
            <span>Diminuir o texto para caber no selo</span>
            <input type="checkbox" data-text-box-fit="" checked={box.fitText} disabled={disabled}
              onChange={(event) => { const fitText = event.target.checked; setBox((value) => ({ ...value, fitText })); }} />
          </label>
        </>}
        {leader && anchor && <>
          <div className="vnext-native-choice" role="group" aria-label="Ponta da chamada">
            {LEADER_HEAD_OPTIONS.map((option) => (
              <button key={option.value} type="button" data-text-leader-head={option.value} aria-pressed={leader.head === option.value}
                disabled={disabled} onClick={() => setLeader((value) => ({ ...value, head: option.value }))}>{option.label}</button>
            ))}
          </div>
          <p className="vnext-text-basic-hint">Onde a seta aponta, em milímetros da página:</p>
          <label className="vnext-native-field">
            <span>Ponta da seta, X</span>
            <TableDecimalField name="Ponta da seta (X)" value={anchor.xMm} unit="mm" range="any" example="120" className="vnext-style-number"
              disabled={disabled} inputProps={{ 'data-text-leader-x': '' }}
              onCommit={(value) => { if (value !== null) setLeader((value0, text) => leaderWithAnchorOnPage(text, value0, value, leaderAnchorOnPage(text, value0).yMm)); }} />
          </label>
          <label className="vnext-native-field">
            <span>Ponta da seta, Y</span>
            <TableDecimalField name="Ponta da seta (Y)" value={anchor.yMm} unit="mm" range="any" example="150" className="vnext-style-number"
              disabled={disabled} inputProps={{ 'data-text-leader-y': '' }}
              onCommit={(value) => { if (value !== null) setLeader((value0, text) => leaderWithAnchorOnPage(text, value0, leaderAnchorOnPage(text, value0).xMm, value)); }} />
          </label>
        </>}
        {advanced && <>
          {box && <>
            <div className="vnext-native-group" role="group" aria-label="Contorno do selo">
              <span className="vnext-text-basic-label">Contorno do selo</span>
              <TableColorField swatchLabel="Cor do contorno do selo" pickerLabel="Outra cor do contorno" value={box.stroke?.pattern === 'solid' ? box.stroke.color : undefined}
                palette={palette} disabled={disabled} pickerProps={{ 'data-text-box-stroke-picker': '' }}
                onPick={(color) => setBox((value) => ({ ...value, stroke: { pattern: 'solid', thicknessPt: value.stroke?.pattern === 'solid' ? value.stroke.thicknessPt : 0.75, color } }))} />
              <button type="button" data-text-box-stroke-none="" disabled={disabled || !box.stroke}
                onClick={() => setBox(({ stroke: _stroke, ...value }) => value)}>Sem contorno</button>
            </div>
            <label className="vnext-native-field">
              <span>Cantos (vazio = pílula)</span>
              <TableDecimalField name="Cantos do selo" value={box.cornerRadiusMm} unit="mm" range="zeroOrMore" max={150} allowEmpty example="1"
                className="vnext-style-number" disabled={disabled} inputProps={{ 'data-text-box-radius': '' }}
                onCommit={(value) => setBox(({ cornerRadiusMm: _radius, ...rest }) => (value === null ? rest : { ...rest, cornerRadiusMm: value }))} />
            </label>
            <label className="vnext-native-field">
              <span>Margem dos lados</span>
              <TableDecimalField name="Margem do selo" value={box.paddingMm} unit="mm" range="zeroOrMore" max={20} example="2"
                className="vnext-style-number" disabled={disabled} inputProps={{ 'data-text-box-padding': '' }}
                onCommit={(value) => { if (value !== null) setBox((rest) => ({ ...rest, paddingMm: value })); }} />
            </label>
          </>}
          {leader && <>
            <div className="vnext-native-group" role="group" aria-label="Cor da seta">
              <span className="vnext-text-basic-label">Cor da seta</span>
              <TableColorField swatchLabel="Cor da seta" pickerLabel="Outra cor da seta" value={leader.color} palette={palette} disabled={disabled}
                pickerProps={{ 'data-text-leader-color': '' }} onPick={(color) => setLeader((value) => ({ ...value, color }))} />
            </div>
            <label className="vnext-native-field">
              <span>Espessura da seta</span>
              <TableDecimalField name="Espessura da seta" value={leader.thicknessPt} unit="pt" max={12} example="0,75" className="vnext-style-number"
                disabled={disabled} inputProps={{ 'data-text-leader-width': '' }}
                onCommit={(value) => { if (value !== null) setLeader((rest) => ({ ...rest, thicknessPt: value })); }} />
            </label>
            <label className="vnext-native-field">
              <span>Com cotovelo</span>
              <input type="checkbox" data-text-leader-elbow="" checked={leader.elbow} disabled={disabled}
                onChange={(event) => { const elbow = event.target.checked; setLeader((value) => ({ ...value, elbow })); }} />
            </label>
          </>}
          <div className="vnext-native-choice">
            {box && <button type="button" data-text-box-remove="" disabled={disabled} onClick={() => setBox(() => null)}>Tirar o fundo (selo)</button>}
            {leader && <button type="button" data-text-leader-remove="" disabled={disabled} onClick={() => setLeader(() => null)}>Tirar a seta</button>}
          </div>
        </>}
        {(!box || !leader) && <div className="vnext-native-choice">
          {!box && <button type="button" data-text-box-add="" disabled={disabled} onClick={() => setBox((value) => value)}>Adicionar fundo (selo)</button>}
          {!leader && <button type="button" data-text-leader-add="" disabled={disabled} onClick={() => setLeader((value) => value)}>Adicionar seta (chamada)</button>}
        </div>}
        {(box || leader) && <AdvancedToggle open={advanced} onToggle={() => setAdvanced((open) => !open)} id={`${idBase}-advanced`} />}
      </section>
    </>
  );
}
