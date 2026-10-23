import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArsenalPresetThumbnail } from '@/vnext/app/editor/ArsenalPresetThumbnail';
import { pageThumbnailDiagnostics, pageThumbnailShadowRoot } from '@/vnext/app/editor/PageThumbnail';
import { ARSENAL_PHOTO_PLACEHOLDER_TEXT } from '@/vnext/arsenal/arsenal-placeholder';
import { coverPageDraft, headerBlockDraft, logoBlockDraft, specTableDraft, teamPresetFromDraft, titleStyleDraft } from '../arsenal/contract/fixtures';

class FakeIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

beforeEach(() => {
  pageThumbnailDiagnostics.reset();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pageHosts = () => [...document.querySelectorAll<HTMLElement>('[data-page-thumbnail]')];

describe('miniatura do preset do arsenal', () => {
  it('desenha o conteúdo do preset com o renderizador das miniaturas (o mesmo do PDF)', async () => {
    const presets = [coverPageDraft(), headerBlockDraft(), specTableDraft(), titleStyleDraft()].map((draft, index) =>
      teamPresetFromDraft(draft, { id: `5555555${index}-5555-4555-8555-555555555555` }));
    render(<div>{presets.map((preset) => <ArsenalPresetThumbnail key={preset.id} preset={preset} />)}</div>);
    await waitFor(() => expect(pageHosts().map((host) => host.getAttribute('data-thumbnail-state'))).toEqual(['rendered', 'rendered', 'rendered', 'rendered']));
    const cards = [...document.querySelectorAll<HTMLElement>('[data-arsenal-thumbnail]')];
    expect(cards.map((card) => card.getAttribute('data-arsenal-thumbnail'))).toEqual(['page', 'block', 'table', 'style']);
    expect(cards.every((card) => card.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(pageThumbnailShadowRoot(pageHosts()[0])?.textContent).toContain('Nome do produto (A COMPLETAR)');
    expect(pageThumbnailShadowRoot(pageHosts()[1])?.textContent).toContain('Título do catálogo');
    expect(pageThumbnailShadowRoot(pageHosts()[2])?.textContent).toContain('Característica');
    expect(pageThumbnailShadowRoot(pageHosts()[3])?.textContent).toContain('Aa Texto de exemplo');
    // A page fills a portrait card; the header block shows the top of the sheet in a 4:3 card.
    expect(cards[0].style.aspectRatio).toBe(String(210 / 297));
    const headerSheet = cards[1].firstElementChild as HTMLElement;
    expect(headerSheet.style.width).toBe('100%');
    expect(headerSheet.style.top).toBe('0%');
  });

  it('é memoizada: mesmo preset (id e revisão) não desenha de novo; revisão nova desenha', async () => {
    const preset = teamPresetFromDraft(headerBlockDraft());
    const view = render(<ArsenalPresetThumbnail preset={preset} />);
    await waitFor(() => expect(pageThumbnailDiagnostics.draws).toBeGreaterThan(0));
    const draws = pageThumbnailDiagnostics.draws;
    view.rerender(<ArsenalPresetThumbnail preset={{ ...preset }} />);
    view.rerender(<ArsenalPresetThumbnail preset={teamPresetFromDraft(headerBlockDraft())} />);
    expect(pageThumbnailDiagnostics.draws).toBe(draws);
    const draft = headerBlockDraft();
    if (draft.payload.kind !== 'block') throw new Error('block');
    const renamed = teamPresetFromDraft({
      ...draft,
      payload: { ...draft.payload, objects: draft.payload.objects.map((object) => object.type === 'text' ? { ...object, text: { paragraphs: [{ id: 'n:p', inlines: [{ kind: 'text', id: 'n:t', text: 'Título novo', marks: [] }] }] } } : object) },
    }, { revision: 2 });
    view.rerender(<ArsenalPresetThumbnail preset={renamed} />);
    await waitFor(() => expect(pageThumbnailShadowRoot(pageHosts()[0])?.textContent).toContain('Título novo'));
    expect(pageThumbnailDiagnostics.draws).toBeGreaterThan(draws);
  });

  it('imagem que não carrega aparece como a moldura "Foto a escolher", como na inserção', async () => {
    render(<ArsenalPresetThumbnail preset={teamPresetFromDraft(logoBlockDraft())} />);
    await waitFor(() => expect(pageHosts()[0].getAttribute('data-thumbnail-state')).toBe('rendered'));
    expect(pageThumbnailShadowRoot(pageHosts()[0])?.textContent).toContain(ARSENAL_PHOTO_PLACEHOLDER_TEXT);
  });
});
