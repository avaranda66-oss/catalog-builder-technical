import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '@/vnext/application';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { PageFooterSection } from '@/vnext/app/editor/PageFooterSection';
import { todayIsoDate } from '@/vnext/editor/page-footer-authoring';

afterEach(cleanup);

function ids(prefix = 'ui') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function folder(pages = 3, typed = false): CatalogDocument {
  const base = createCatalogDocument(ids('doc'), 'Folder');
  return {
    ...base,
    pages: Array.from({ length: pages }, (_, index) => ({
      ...base.pages[0], id: `page-${index + 1}`,
      objects: typed && index > 0 ? [{ id: `number-${index + 1}`, type: 'text' as const, frame: { xMm: 170, yMm: 281, widthMm: 24, heightMm: 5 },
        zIndex: 0, text: plainRichText(`number-${index + 1}`, `${index + 1} / ${pages}`), style: {} }] : [],
    })),
  };
}

function setup(document: CatalogDocument, pageId = 'page-2') {
  const session: DocumentSession = createDocumentSession(document, { createId: ids('generated') });
  const messages: string[] = [];
  render(<PageFooterSection pageId={pageId} session={session} prepare={() => true} onMessage={(message) => messages.push(message)} />);
  return { session, messages, footer: () => session.getSnapshot().document.style.pageFooter };
}

const field = (name: string) => document.querySelector<HTMLInputElement>(`[data-page-footer-${name}]`)!;

describe('FR-55 "Rodapé de todas as páginas"', () => {
  it('turns the footer on, takes code and revision once, and previews this page', () => {
    const { session, messages, footer } = setup(folder());
    expect(screen.getByRole('heading', { name: 'Rodapé de todas as páginas' })).toBeTruthy();
    fireEvent.click(field('enabled'));
    expect(footer()).toEqual({ showOnFirstPage: false });
    expect(messages.at(-1)).toMatch(/Rodapé ligado em todas as páginas/);

    fireEvent.change(field('code'), { target: { value: '  MAN-PCON-XV ' } });
    fireEvent.blur(field('code'));
    expect(footer()).toEqual({ documentCode: 'MAN-PCON-XV', showOnFirstPage: false });
    fireEvent.change(field('revision'), { target: { value: '03' } });
    fireEvent.keyDown(field('revision'), { key: 'Enter' });
    expect(footer()?.revision).toBe('03');
    expect(document.querySelector('[data-page-footer-preview]')?.textContent).toBe('Nesta página: MAN-PCON-XV · Rev. 03 · PT e Página 2 de 3');

    // Each committed change is one undo step.
    session.undo();
    expect(footer()).toEqual({ documentCode: 'MAN-PCON-XV', showOnFirstPage: false });
    expect(messages.at(-1)).toMatch(/Para voltar, use Desfazer/);
  });

  it('sets the date from the calendar or "hoje", and the cover choice', () => {
    const { footer } = setup({ ...folder(), style: { ...folder().style, pageFooter: { showOnFirstPage: false } } }, 'page-1');
    expect(document.querySelector('[data-page-footer-preview]')?.textContent).toBe('A capa não mostra o rodapé.');
    fireEvent.change(field('date'), { target: { value: '2026-10-22' } });
    fireEvent.blur(field('date'));
    expect(footer()?.issuedOn).toBe('2026-10-22');
    fireEvent.click(screen.getByRole('button', { name: 'Usar a data de hoje' }));
    expect(footer()?.issuedOn).toBe(todayIsoDate());
    fireEvent.click(screen.getByRole('button', { name: 'Sem data' }));
    expect(footer()?.issuedOn).toBeUndefined();
    fireEvent.click(field('first-page'));
    expect(footer()?.showOnFirstPage).toBe(true);
    expect(document.querySelector('[data-page-footer-preview]')?.textContent).toBe('Nesta página: PT e Página 1 de 3');
  });

  it('Escape puts back the stored code without changing the catalog', () => {
    const { footer } = setup({ ...folder(), style: { ...folder().style, pageFooter: { documentCode: 'FT-01', showOnFirstPage: false } } });
    fireEvent.change(field('code'), { target: { value: 'ERRADO' } });
    fireEvent.keyDown(field('code'), { key: 'Escape' });
    expect(field('code').value).toBe('FT-01');
    expect(footer()?.documentCode).toBe('FT-01');
  });

  it('swaps typed page numbers for the automatic one after a preview, in one undo step', () => {
    const { session, messages, footer } = setup(folder(4, true));
    fireEvent.click(screen.getByRole('button', { name: 'Trocar 3 números de página digitados pelo automático' }));
    const review = document.querySelector('[data-page-footer-replace-review]')!;
    expect(review.textContent).toContain('O rodapé automático será ligado e estes textos serão apagados:');
    expect([...review.querySelectorAll('li')].map((item) => item.textContent)).toEqual(['Página 2: “2 / 4”', 'Página 3: “3 / 4”', 'Página 4: “4 / 4”']);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar e usar o automático' }));
    expect(footer()).toEqual({ showOnFirstPage: false });
    expect(session.getSnapshot().document.pages.every((page) => page.objects.length === 0)).toBe(true);
    expect(messages.at(-1)).toBe('Pronto: 3 números digitados foram apagados. O rodapé automático numera as páginas. Para voltar, use Desfazer.');
    session.undo();
    expect(footer()).toBeUndefined();
    expect(session.getSnapshot().document.pages.slice(1).every((page) => page.objects.length === 1)).toBe(true);
  });

  it('Cancelar keeps everything', () => {
    const { session } = setup(folder(3, true));
    const before = session.getSnapshot().document;
    fireEvent.click(screen.getByRole('button', { name: 'Trocar 2 números de página digitados pelo automático' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(session.getSnapshot().document).toBe(before);
    expect(document.querySelector('[data-page-footer-replace-review]')).toBeNull();
  });

  it('its check boxes are targets of at least 24 px (the native 13 px box was too small for the father)', () => {
    // jsdom does not lay out; j04 measures the real box in Chromium. The rule is shared by every native-style section.
    const css = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/NativeStyleSection.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.vnext-native-field input\[type="checkbox"\]\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/(?:^|;)\s*width:\s*24px/);
    expect(rule).toMatch(/(?:^|;)\s*height:\s*24px/);
    setup(folder(3));
    expect(field('enabled').closest('.vnext-native-field')).not.toBeNull();
    fireEvent.click(field('enabled'));
    expect(field('first-page').closest('.vnext-native-field')).not.toBeNull();
  });
});
