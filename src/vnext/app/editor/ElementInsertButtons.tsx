import React from 'react';
import type { DocumentSession, ObjectInsertSpec } from '../../application';
import {
  POLYGON_PRESETS,
  calloutInsertSpec,
  familyBarInsertSpecs,
  insertFamilyBar,
  pillInsertSpec,
  polygonInsertSpec,
  type PolygonPresetId,
} from '../../editor/native-element-authoring';
import './NativeStyleSection.css';

export interface ElementInsertButtonsProps {
  session: DocumentSession;
  pageId: string | undefined;
  /** Finishes any open edit before inserting; `false` means nothing is inserted. */
  prepare(): boolean;
  /** Selects the new object and tells what was added. */
  onInserted(objectId: string, message: string): void;
  onMessage(message: string): void;
}

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/**
 * Onda 3.5 (P2): "Mais opções > Elementos" — native pieces of a cover (polygons, selo, chamada, barra da família).
 * Each button is one Desfazer step and selects what it added.
 */
export function ElementInsertButtons({ session, pageId, prepare, onInserted, onMessage }: ElementInsertButtonsProps): React.ReactElement {
  const insertOne = (build: (document: ReturnType<DocumentSession['getSnapshot']>['document']) => ObjectInsertSpec | undefined, added: string) => {
    if (!pageId || !prepare()) return;
    const document = session.getSnapshot().document;
    const page = document.pages.find((entry) => entry.id === pageId);
    const object = page && build(document);
    if (!object) return;
    const result = session.execute({ type: 'object.insert', pageId, object }, { transactionId: createTransactionId() });
    if (!result.ok) { onMessage('Não foi possível inserir o elemento.'); return; }
    onInserted(result.metadata.createdIds[0], `${added}. Para tirar, use Desfazer.`);
  };
  const polygon = (preset: PolygonPresetId, added: string) => insertOne((document) => {
    const page = document.pages.find((entry) => entry.id === pageId)!;
    return polygonInsertSpec(page, document.style, preset);
  }, added);
  const familyBar = () => {
    if (!pageId || !prepare()) return;
    const document = session.getSnapshot().document;
    const page = document.pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const outcome = insertFamilyBar(session, pageId, familyBarInsertSpecs(page, document.style), createTransactionId());
    if (!outcome.ok || !outcome.objectId) { onMessage('Não foi possível inserir a barra da família.'); return; }
    onInserted(outcome.objectId, 'Barra da família adicionada (6 selos agrupados). Para mudar um nome, use Desagrupar. Para tirar, use Desfazer.');
  };
  return (
    <div className="vnext-tool-group vnext-native-insert" aria-label="Elementos" data-native-elements="">
      <span className="vnext-native-insert-label">Elementos</span>
      {POLYGON_PRESETS.map((preset) => (
        <button key={preset.id} type="button" data-editor-action={`add-polygon-${preset.id}`} disabled={!pageId}
          onClick={() => polygon(preset.id, `${preset.label} ${preset.id === 'diagonal' ? 'adicionada' : 'adicionado'}`)}>{preset.label}</button>
      ))}
      <button type="button" data-editor-action="add-pill" disabled={!pageId}
        onClick={() => insertOne((document) => pillInsertSpec(document.pages.find((entry) => entry.id === pageId)!, document.style), 'Selo adicionado')}>Selo</button>
      <button type="button" data-editor-action="add-callout" disabled={!pageId}
        onClick={() => insertOne((document) => calloutInsertSpec(document.pages.find((entry) => entry.id === pageId)!, document.style), 'Chamada adicionada')}>Chamada</button>
      <button type="button" data-editor-action="add-family-bar" disabled={!pageId} onClick={familyBar}>Barra da família</button>
    </div>
  );
}
