import React from 'react';
import { presysPageModelChoices, type PresysPageModelChoice } from '../../library/presys-page-models';
import { PageThumbnail, pageThumbnailSignature } from './PageThumbnail';
import './PageTemplateGallery.css';

export interface PageTemplateGalleryProps {
  readonly value: string;
  readonly onChange: (templateId: string) => void;
  readonly disabled?: boolean;
  /** TA-25N pages are offered only where their official image can be prepared. */
  readonly includeTa25n?: boolean;
  /** For tests; defaults to the PRESYS page models. */
  readonly choices?: readonly PresysPageModelChoice[];
  /** Escape closes the gallery. */
  readonly onClose?: () => void;
}

/**
 * FR-80/FR-18 "Usar modelo…" gallery: every PRESYS page model as a small picture
 * with its name, chosen with a radio button. The "Inserir modelo" button that
 * follows inserts the chosen model after the current page.
 */
export function PageTemplateGallery({ value, onChange, disabled = false, includeTa25n = true, choices, onClose }: PageTemplateGalleryProps) {
  const name = React.useId();
  const models = choices ?? presysPageModelChoices({ includeTa25n });
  return (
    <fieldset className="vnext-page-models" disabled={disabled} data-page-model-gallery="" aria-describedby={`${name}-help`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !onClose) return;
        event.preventDefault();
        event.stopPropagation();
        // Focus goes back to the "Usar modelo…" button that opened the gallery.
        const opener = event.currentTarget.closest('aside')?.querySelector<HTMLElement>('[aria-controls="vnext-page-reuse"]');
        onClose();
        opener?.focus();
      }}>
      <legend>Modelo de página PRESYS</legend>
      <p id={`${name}-help`} className="vnext-page-model-help">Escolha um modelo e clique em “Inserir modelo”. A página nova entra depois da página atual.</p>
      <div className="vnext-page-model-list">
        {models.map((model) => {
          const descriptionId = `${name}-${model.templateId}-description`;
          const checked = model.templateId === value;
          return (
            <label key={model.templateId} className={checked ? 'vnext-page-model is-selected' : 'vnext-page-model'} data-page-model={model.templateId}>
              <input type="radio" name={name} value={model.templateId} checked={checked}
                aria-describedby={model.description ? descriptionId : undefined}
                onChange={() => onChange(model.templateId)} />
              <PageThumbnail page={model.preview.page} document={model.preview.document} assetUrls={model.preview.assetUrls}
                signature={pageThumbnailSignature(model.preview.page, model.preview.document)} className="vnext-page-model-thumbnail" />
              <span className="vnext-page-model-text">
                <strong>{model.label}</strong>
                {model.description && <small id={descriptionId} aria-hidden="true">{model.description}</small>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
