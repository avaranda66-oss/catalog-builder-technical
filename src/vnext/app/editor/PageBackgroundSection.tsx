import React from 'react';
import type { DocumentSession } from '../../application';
import type { PageBackground } from '../../domain';
import { applyNativeAction, brandPalette, pageBackgroundAction } from '../../editor/native-element-authoring';
import { TableColorField } from './TableColorField';
import './NativeStyleSection.css';

export interface PageBackgroundSectionProps {
  pageId: string;
  session: DocumentSession;
  prepare(): boolean;
  onMessage(message: string): void;
}

function createTransactionId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

/**
 * Onda 3.5 (P1.2): "Fundo da página" is a property of the page (colour and/or a picture of the catalog), shown
 * when nothing is selected. It is never an object, so it cannot be clicked, moved or hidden behind by accident.
 */
export function PageBackgroundSection({ pageId, session, prepare, onMessage }: PageBackgroundSectionProps): React.ReactElement | null {
  const { document } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const page = document.pages.find((entry) => entry.id === pageId);
  if (!page) return null;
  const background = page.background;
  const palette = brandPalette(document.style);
  const set = (next: (current: PageBackground | undefined) => PageBackground | null) => {
    if (!prepare()) return;
    const latest = session.getSnapshot().document.pages.find((entry) => entry.id === pageId);
    if (!latest) return;
    const outcome = applyNativeAction(session, pageBackgroundAction(latest, next(latest.background)), createTransactionId());
    onMessage(outcome.ok ? 'Fundo da página alterado. Para voltar, use Desfazer.' : outcome.message);
  };
  const withColor = (current: PageBackground | undefined, color: string | undefined): PageBackground | null => {
    const image = current?.image;
    if (!color && !image) return null;
    return { ...(color ? { color } : {}), ...(image ? { image } : {}) };
  };
  return (
    <>
      <div className="vnext-divider" />
      <section className="vnext-native-style" data-page-background-section="" aria-labelledby={`vnext-page-background-${pageId}`}>
        <h3 id={`vnext-page-background-${pageId}`}>Fundo da página</h3>
        <div className="vnext-native-group" role="group" aria-label="Cor de fundo da página">
          <span className="vnext-text-basic-label">Cor de fundo</span>
          <TableColorField swatchLabel="Cor de fundo da página" pickerLabel="Outra cor de fundo" value={background?.color} palette={palette}
            pickerProps={{ 'data-page-background-picker': '' }} onPick={(color) => set((current) => withColor(current, color))} />
          <button type="button" data-page-background-clear="" aria-pressed={!background?.color} disabled={!background?.color}
            onClick={() => set((current) => withColor(current, undefined))}>Sem cor (branco)</button>
        </div>
        {document.assets.length > 0 && <div className="vnext-native-group">
          <label className="vnext-native-field">
            <span>Imagem de fundo</span>
            <select data-page-background-image="" value={background?.image?.assetId ?? ''}
              onChange={(event) => {
                const assetId = event.target.value;
                set((current) => {
                  if (!assetId) return withColor(current, current?.color);
                  return { ...(current?.color ? { color: current.color } : {}), image: { assetId, fit: current?.image?.fit ?? 'cover' } };
                });
              }}>
              <option value="">Nenhuma</option>
              {document.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </select>
          </label>
          {background?.image && <label className="vnext-native-field">
            <span>Ajuste da imagem</span>
            <select data-page-background-fit="" value={background.image.fit}
              onChange={(event) => {
                const fit = event.target.value as 'cover' | 'contain';
                set((current) => (current?.image ? { ...current, image: { ...current.image, fit } } : current ?? null));
              }}>
              <option value="cover">Preencher a página</option>
              <option value="contain">Mostrar inteira</option>
            </select>
          </label>}
        </div>}
      </section>
    </>
  );
}
