import React from 'react';
import type { DocumentSession } from '../../application';
import type { CatalogDocument, TextObject } from '../../domain';
import type { TextStylePatch } from '../../application/contracts';
import { formatDecimalPtBr } from '../../editor/decimal-ptbr';
import type { FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import { applyTextFitHeight, prepareTextFitHeight } from '../../editor/text-fit-height-authoring';
import {
  TEXT_ALIGNMENTS,
  TEXT_KINDS,
  applyTextStyle,
  boldAvailable,
  effectiveTextStyle,
  textColorOptions,
  textKindPatch,
} from '../../editor/text-style-authoring';
import { AdvancedToggle } from './NativeStyleSection';
import { TableColorField } from './TableColorField';
import { TableDecimalField } from './TableDecimalField';
import { TextDecorationSection } from './TextDecorationSection';
import './TextInspectorSection.css';

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

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

function pageIdOf(document: CatalogDocument, objectId: string): string | undefined {
  return document.pages.find((page) => page.objects.some((object) => object.id === objectId))?.id;
}

function currentText(document: CatalogDocument, objectId: string): TextObject | undefined {
  for (const page of document.pages) {
    const found = page.objects.find((object) => object.id === objectId);
    if (found) return found.type === 'text' ? found : undefined;
  }
  return undefined;
}

/**
 * The side-panel block for a selected text box (FR-14 and FR-15): kind (Título, Subtítulo, Corpo, Nota),
 * bold, palette colour, alignment and "Ajustar altura ao texto". Every button is one change and one Desfazer.
 */
export function TextInspectorSection({
  object,
  simple,
  disabled,
  session,
  measurement,
  prepare,
  onMessage,
}: TextInspectorSectionProps): React.ReactElement {
  const { document } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  // Read the box from the session, so a choice right after another one never starts from an older style.
  const current = currentText(document, object.id) ?? object;
  const idBase = `vnext-text-basic-${object.id}`;
  const effective = effectiveTextStyle(document.style, current.style);
  const canBold = boldAvailable(document.style, current.style);
  const colors = textColorOptions(document.style);
  const pageId = pageIdOf(document, object.id);
  const fit = pageId ? prepareTextFitHeight(document, pageId, object.id, measurement) : undefined;
  const overflowing = measurement?.source === document && Boolean(measurement.diagnostics?.some((diagnostic) =>
    diagnostic.code === 'TEXT_OBJECT_OVERFLOW' && diagnostic.objectId === object.id));
  const lockedReason = disabled ? `${idBase}-locked` : undefined;
  const [advanced, setAdvanced] = React.useState(false);

  // The patch is chosen from the style on screen, so that style is the one the change expects.
  const shownStyle = current.style;
  const change = (patch: TextStylePatch) => {
    if (disabled || !prepare()) return;
    const outcome = applyTextStyle(session, object.id, patch, createTransactionId(), shownStyle);
    if (outcome.message) onMessage(outcome.message);
  };

  const fitHeight = () => {
    if (disabled || !prepare()) return;
    const latest = session.getSnapshot().document;
    const latestPageId = pageIdOf(latest, object.id);
    const preparation = latestPageId ? prepareTextFitHeight(latest, latestPageId, object.id, measurement) : undefined;
    if (!preparation?.ok) {
      onMessage(preparation?.message ?? 'Selecione uma caixa de texto para ajustar a altura.');
      return;
    }
    onMessage(applyTextFitHeight(session, latest, preparation.prepared, createTransactionId()).message);
  };

  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-text-basic" data-text-basic="" aria-labelledby={`${idBase}-heading`}>
        <h3 id={`${idBase}-heading`}>{simple ? 'Básico' : 'Estilo do texto'}</h3>
        {disabled && (
          <p id={lockedReason} className="vnext-authoring-guidance">
            A caixa de texto está bloqueada. Desbloqueie para mudar o texto.
          </p>
        )}

        <div className="vnext-text-basic-group" role="group" aria-labelledby={`${idBase}-kind`}>
          <span id={`${idBase}-kind`} className="vnext-text-basic-label">Tipo</span>
          <div className="vnext-text-basic-kinds">
            {TEXT_KINDS.map((kind) => (
              <button key={kind.id} type="button" data-text-kind={kind.id} aria-pressed={effective.kind === kind.id}
                disabled={disabled} aria-describedby={lockedReason}
                onClick={() => change(textKindPatch(document.style, current.style, kind.id))}>
                <span>{kind.label}</span> <small>{kind.fontSizePt} pt</small>
              </button>
            ))}
          </div>
          {effective.kind === undefined && effective.fontSizePt !== undefined && (
            <p className="vnext-text-basic-hint">Tamanho atual: {formatDecimalPtBr(effective.fontSizePt, 2)} pt</p>
          )}
          {/* Onda 3.5 (P1.3): any size, typed with comma or point (e.g. 7,2). */}
          <label className="vnext-native-field">
            <span>Tamanho</span>
            <TableDecimalField name="Tamanho do texto" value={effective.fontSizePt} unit="pt" max={200} example="7,2"
              className="vnext-style-number" disabled={disabled} describedBy={lockedReason} inputProps={{ 'data-text-size': '' }}
              onCommit={(value) => { if (value !== null) change({ fontSizePt: value }); }} />
          </label>
        </div>

        <button type="button" className="vnext-text-basic-bold" data-text-bold="" aria-pressed={effective.fontWeight === 700}
          disabled={disabled || !canBold} aria-describedby={lockedReason}
          onClick={() => change({ fontWeight: effective.fontWeight === 700 ? 400 : 700 })}>
          Negrito
        </button>

        <div className="vnext-text-basic-group" role="group" aria-labelledby={`${idBase}-color`}>
          <span id={`${idBase}-color`} className="vnext-text-basic-label">Cor</span>
          <div className="vnext-style-palette vnext-text-basic-colors">
            {colors.map((option) => (
              <button key={option.value} type="button" data-text-color={option.value} aria-label={option.label} title={option.label}
                aria-pressed={effective.color === option.value} disabled={disabled} aria-describedby={lockedReason}
                style={{ background: option.value }}
                onClick={() => change({ color: option.value })} />
            ))}
          </div>
          {/* Onda 3.5 (P1.3): any colour, like the gold of a cover that is not in the catalog colours. */}
          <TableColorField swatchLabel="Cor do texto" pickerLabel="Outra cor do texto" value={effective.color} palette={[]} showSwatches={false}
            disabled={disabled} describedBy={lockedReason} pickerProps={{ 'data-text-color-picker': '' }} onPick={(color) => change({ color })} />
        </div>

        <div className="vnext-text-basic-group" role="group" aria-labelledby={`${idBase}-align`}>
          <span id={`${idBase}-align`} className="vnext-text-basic-label">Alinhamento</span>
          <div className="vnext-text-basic-align">
            {TEXT_ALIGNMENTS.map((alignment) => (
              <button key={alignment.value} type="button" data-text-align={alignment.value}
                aria-pressed={effective.textAlign === alignment.value} disabled={disabled} aria-describedby={lockedReason}
                onClick={() => change({ textAlign: alignment.value })}>
                {alignment.label}
              </button>
            ))}
          </div>
        </div>

        {advanced && (
          <div className="vnext-text-basic-group" data-text-advanced="">
            <label className="vnext-native-field">
              <span>Espaço entre letras</span>
              <TableDecimalField name="Espaço entre letras" value={Math.round((current.style.letterSpacingEm ?? 0) * 1000) / 10} unit="%"
                range="zeroOrMore" max={100} example="10" className="vnext-style-number" disabled={disabled} describedBy={lockedReason}
                inputProps={{ 'data-text-letter-spacing': '' }} onCommit={(value) => { if (value !== null) change({ letterSpacingEm: value / 100 }); }} />
            </label>
            <label className="vnext-native-field">
              <span>Altura da linha</span>
              <TableDecimalField name="Altura da linha" value={current.style.lineHeight ?? document.style.defaultText.lineHeight ?? 1.2}
                max={4} example="1,2" className="vnext-style-number" disabled={disabled} describedBy={lockedReason}
                inputProps={{ 'data-text-line-height': '' }} onCommit={(value) => { if (value !== null) change({ lineHeight: Math.max(0.5, value) }); }} />
            </label>
          </div>
        )}
        <AdvancedToggle open={advanced} onToggle={() => setAdvanced((open) => !open)} id={`${idBase}-advanced`}
          disabled={disabled} describedBy={lockedReason} />

        <div className="vnext-fit-height-section" data-text-fit-height=""
          data-fit-height-prepared-u={fit?.ok ? fit.prepared.preparedHeightU : undefined}>
          {overflowing && (
            <p className="vnext-text-basic-overflow" data-text-overflow="">
              O texto não cabe na caixa. Use “Ajustar altura ao texto” ou diminua o texto.
            </p>
          )}
          <button type="button" className="vnext-inspector-action" data-editor-action="fit-text-height"
            disabled={disabled || !fit?.ok}
            aria-describedby={disabled ? lockedReason : !fit?.ok ? `${idBase}-fit-reason` : undefined}
            onClick={fitHeight}>
            Ajustar altura ao texto
          </button>
          {!disabled && !fit?.ok && (
            <p id={`${idBase}-fit-reason`} data-fit-height-disabled-reason="">
              {fit?.message ?? 'Selecione uma caixa de texto para ajustar a altura.'}
            </p>
          )}
        </div>
      </section>
      {(current.box || current.leader || advanced) && (
        <TextDecorationSection object={current} disabled={disabled} session={session} prepare={prepare} onMessage={onMessage} />
      )}
    </>
  );
}
