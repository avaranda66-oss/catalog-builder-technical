import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import type { CatalogLibraryService } from '@/vnext/library';
import type { CatalogListItem, CatalogPersistenceEnvelope } from '@/vnext/persistence';

/**
 * Journeys of 20/10 (J11/J1): every library action answers on screen, and the library is readable
 * with reading glasses — text >= 15 px (secondary >= 13 px) and click targets >= 44 px tall.
 */

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('style[data-test-css]').forEach((style) => style.remove());
});

function item(title: string, suffix: string, archived = false): CatalogListItem {
  return {
    catalogId: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    remoteRevision: 1,
    title,
    locale: 'pt-BR',
    createdAt: '2026-09-14T12:00:00.000Z',
    updatedAt: '2026-09-14T12:05:00.000Z',
    createdBy: 'user-a',
    updatedBy: 'user-a',
    archivedAt: archived ? '2026-09-14T12:10:00.000Z' : null,
    documentSchemaVersion: 1,
  };
}

function envelope(source: CatalogListItem): CatalogPersistenceEnvelope {
  return {
    ...source,
    lastMutationId: '00000000-0000-4000-8000-000000009999',
    documentSnapshot: {} as CatalogPersistenceEnvelope['documentSnapshot'],
  };
}

function serviceMock(overrides: Partial<Record<keyof CatalogLibraryService, unknown>> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listStarters: () => [{
      starterId: 'essential-technical-sheet',
      revision: 1,
      label: 'Ficha técnica essencial',
      description: 'Título, foto e tabela técnica.',
      category: 'Ficha técnica',
    }],
    getCreateState: () => 'idle',
    archive: vi.fn(),
    duplicate: vi.fn(),
    ...overrides,
  } as unknown as CatalogLibraryService & Record<string, ReturnType<typeof vi.fn>>;
}

function rowOf(view: ReturnType<typeof render>, title: string): HTMLElement {
  // A string name is matched exactly by Testing Library.
  return view.getByRole('heading', { name: title }).closest('[data-library-catalog-id]') as HTMLElement;
}

describe('A-04 archiving says where the catalog went', () => {
  it('shows "Catálogo arquivado. Ele continua em Arquivados." and opens Arquivados in one click', async () => {
    const active = item('TA-25N — Ficha técnica 2026', '71');
    const kept = item('PSV Inspector', '72');
    const archivedCopy = item('TA-25N — Ficha técnica 2026', '71', true);
    const list = vi.fn(async (query?: { view?: string }) => ({
      ok: true,
      value: query?.view === 'archived' ? [archivedCopy] : [active, kept],
    }));
    const archive = vi.fn().mockResolvedValue({ ok: true, value: envelope(archivedCopy) });
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const view = render(<CatalogLibrary service={serviceMock({ list, archive })} onOpen={vi.fn()} />);
      fireEvent.click(await waitFor(() => view.getByRole('button', { name: `Mais ações de ${active.title}` })));
      fireEvent.click(view.getByRole('menuitem', { name: 'Arquivar' }));
      fireEvent.click(view.getByRole('button', { name: 'Arquivar catálogo' }));

      const status = await waitFor(() => view.getByRole('status'));
      expect(status).toHaveTextContent('Catálogo arquivado. Ele continua em Arquivados.');
      expect(archive).toHaveBeenCalledWith(active.catalogId);
      expect(view.queryByRole('heading', { name: active.title })).toBeNull();
      expect(view.getByRole('heading', { name: kept.title })).toBeInTheDocument();
      // The notice is brought into view, even if the archived row was far down the list.
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

      fireEvent.click(within(status).getByRole('button', { name: 'Ver Arquivados' }));
      await waitFor(() => expect(view.getByRole('tab', { name: 'Arquivados' })).toHaveAttribute('aria-selected', 'true'));
      const archivedRow = await waitFor(() => rowOf(view, archivedCopy.title));
      expect(within(archivedRow).getByText('Arquivado')).toBeInTheDocument();
      expect(within(archivedRow).getByRole('button', { name: 'Duplicar' })).toBeInTheDocument();
      // The message belonged to "Ativos": it does not follow the person to another list.
      expect(view.queryByText('Catálogo arquivado. Ele continua em Arquivados.')).toBeNull();
      expect(list).toHaveBeenLastCalledWith({ view: 'archived' });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('keeps the error, without the archived notice, when archiving fails', async () => {
    const active = item('PCON-Y18 — Folder 2026', '73');
    const service = serviceMock({
      list: vi.fn().mockResolvedValue({ ok: true, value: [active] }),
      archive: vi.fn().mockResolvedValue({ ok: false, error: { code: 'OFFLINE' } }),
    });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    fireEvent.click(await waitFor(() => view.getByRole('button', { name: `Mais ações de ${active.title}` })));
    fireEvent.click(view.getByRole('menuitem', { name: 'Arquivar' }));
    fireEvent.click(view.getByRole('button', { name: 'Arquivar catálogo' }));

    expect(await waitFor(() => view.getByRole('alert'))).toHaveTextContent('Você está sem conexão.');
    expect(view.queryByText(/Catálogo arquivado/)).toBeNull();
    expect(view.queryByRole('button', { name: 'Ver Arquivados' })).toBeNull();
  });
});

describe('library errors that reload the list stay on screen', () => {
  it('keeps the rename conflict message after the list is reloaded', async () => {
    const active = item('PSV Inspector', '75');
    const list = vi.fn().mockResolvedValue({ ok: true, value: [active] });
    const service = serviceMock({ list, rename: vi.fn().mockResolvedValue({ ok: false, error: { code: 'CONFLICT' } }) });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'Renomear' })));
    fireEvent.change(view.getByRole('textbox', { name: 'Nome do catálogo' }), { target: { value: 'PSV Inspector 2027' } });
    fireEvent.click(view.getByRole('button', { name: 'Salvar nome' }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await waitFor(() => view.getByRole('alert'))).toHaveTextContent('O catálogo mudou em outro lugar antes da renomeação.');
    expect(view.queryByRole('dialog', { name: 'Renomear catálogo' })).toBeNull();
  });
});

describe('J11 duplicating names and marks the copy', () => {
  it('shows "Cópia criada: <nome>" and highlights only the new row until the next action', async () => {
    const source = item('PCON-Y18 — Folder 2026', '81');
    const copy = item('Cópia de PCON-Y18 — Folder 2026', '82');
    const list = vi.fn()
      .mockResolvedValueOnce({ ok: true, value: [source] })
      .mockResolvedValue({ ok: true, value: [copy, source] });
    const duplicate = vi.fn().mockResolvedValue({ ok: true, value: envelope(copy) });
    const view = render(<CatalogLibrary service={serviceMock({ list, duplicate })} onOpen={vi.fn()} />);

    fireEvent.click(await waitFor(() => within(rowOf(view, source.title)).getByRole('button', { name: 'Duplicar' })));
    await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('Cópia criada: “Cópia de PCON-Y18 — Folder 2026”.'));
    const copyRow = rowOf(view, copy.title);
    expect(copyRow).toHaveAttribute('data-library-highlighted');
    expect(copyRow).toHaveClass('is-highlighted');
    expect(within(copyRow).getByText('Cópia nova')).toBeInTheDocument();
    expect(rowOf(view, source.title)).not.toHaveAttribute('data-library-highlighted');
    expect(within(rowOf(view, source.title)).queryByText('Cópia nova')).toBeNull();

    // Changing list clears the mark and the message; coming back shows the plain list.
    fireEvent.click(view.getByRole('tab', { name: 'Arquivados' }));
    fireEvent.click(view.getByRole('tab', { name: 'Ativos' }));
    await waitFor(() => expect(rowOf(view, copy.title)).not.toHaveAttribute('data-library-highlighted'));
    expect(view.queryByText(/Cópia criada/)).toBeNull();
    expect(view.queryByText('Cópia nova')).toBeNull();
  });

  it('marks the active copy made from an archived catalog too', async () => {
    const archived = item('TA-25N antigo', '83', true);
    const copy = item('Cópia de TA-25N antigo', '84');
    const list = vi.fn(async (query?: { view?: string }) => ({
      ok: true,
      value: query?.view === 'archived' ? [archived] : [copy],
    }));
    const view = render(<CatalogLibrary
      service={serviceMock({ list, duplicate: vi.fn().mockResolvedValue({ ok: true, value: envelope(copy) }) })}
      onOpen={vi.fn()}
    />);
    fireEvent.click(await waitFor(() => view.getByRole('tab', { name: 'Arquivados' })));
    fireEvent.click(await waitFor(() => within(rowOf(view, archived.title)).getByRole('button', { name: 'Duplicar' })));

    await waitFor(() => expect(view.getByRole('tab', { name: 'Ativos' })).toHaveAttribute('aria-selected', 'true'));
    const copyRow = await waitFor(() => rowOf(view, copy.title));
    expect(copyRow).toHaveAttribute('data-library-highlighted');
    expect(view.getByRole('status')).toHaveTextContent('Cópia criada em Ativos: “Cópia de TA-25N antigo”. O catálogo arquivado continua guardado.');
  });
});

describe('A-01/A-02/A-03 library text and targets for reading glasses', () => {
  function injectLibraryCss() {
    for (const file of ['src/vnext/app/product-primitives.css', 'src/vnext/app/styles.css', 'src/vnext/app/editor/entry-and-title.css']) {
      const style = document.createElement('style');
      style.setAttribute('data-test-css', '');
      style.textContent = readFileSync(resolve(process.cwd(), file), 'utf8');
      document.head.append(style);
    }
  }
  const px = (value: string) => Number.parseFloat(value);
  const fontPx = (element: Element) => px(getComputedStyle(element).fontSize);
  const minHeightPx = (element: Element) => px(getComputedStyle(element).minHeight);

  it('uses >= 15 px for actions and labels, >= 13 px for dates and marks, and 44 px targets', async () => {
    injectLibraryCss();
    const translated: CatalogListItem = {
      ...item('PCON-Y18 — Folder 2026 (inglês)', '92'),
      locale: 'en-US',
      origin: { originKind: 'translation', originId: item('x', '91').catalogId, originRevision: 1 },
    };
    const view = render(<CatalogLibrary
      service={serviceMock({ list: vi.fn().mockResolvedValue({ ok: true, value: [item('PCON-Y18 — Folder 2026', '91'), translated] }) })}
      onOpen={vi.fn()}
    />);
    const row = await waitFor(() => rowOf(view, 'PCON-Y18 — Folder 2026'));

    const primary: Array<[string, Element]> = [
      ['Novo catálogo', view.getByRole('button', { name: 'Novo catálogo' })],
      ['aba Ativos', view.getByRole('tab', { name: 'Ativos' })],
      ['aba Arquivados', view.getByRole('tab', { name: 'Arquivados' })],
      ['busca', view.getByRole('searchbox', { name: 'Buscar catálogos' })],
      ['Ordenar catálogos', view.getByRole('combobox', { name: 'Ordenar catálogos' })],
      ['Abrir', within(row).getByRole('button', { name: 'Abrir' })],
      ['Duplicar', within(row).getByRole('button', { name: 'Duplicar' })],
      ['Renomear', within(row).getByRole('button', { name: 'Renomear' })],
      ['Mais', within(row).getByRole('button', { name: 'Mais ações de PCON-Y18 — Folder 2026' })],
      ['dica da biblioteca', view.getByText('Encontre um catálogo, continue o trabalho ou comece um novo.')],
    ];
    for (const [name, element] of primary) expect([name, fontPx(element) >= 15]).toEqual([name, true]);

    const secondary: Array<[string, Element]> = [
      ['marca do produto', view.getByText('PRESYS · Catalog Builder')],
      ['data e idioma', row.querySelector('.vnext-library-meta')!],
      ['Cópia traduzida', view.getByText('Cópia traduzida')],
    ];
    for (const [name, element] of secondary) expect([name, fontPx(element) >= 13]).toEqual([name, true]);

    const targets: Array<[string, Element]> = [
      ['aba Ativos', view.getByRole('tab', { name: 'Ativos' })],
      ['caixa de busca', view.getByRole('searchbox', { name: 'Buscar catálogos' }).closest('label')!],
      // A-02: the select itself is the 44 px frame, so clicking anywhere on it opens the list.
      ['Ordenar catálogos', view.getByRole('combobox', { name: 'Ordenar catálogos' })],
      ['Abrir', within(row).getByRole('button', { name: 'Abrir' })],
      ['Mais', within(row).getByRole('button', { name: 'Mais ações de PCON-Y18 — Folder 2026' })],
    ];
    for (const [name, element] of targets) expect([name, minHeightPx(element) >= 44]).toEqual([name, true]);
    const sortIcon = view.getByRole('combobox', { name: 'Ordenar catálogos' }).parentElement!.querySelector('svg')!;
    expect(getComputedStyle(sortIcon).pointerEvents).toBe('none');

    fireEvent.click(view.getByRole('button', { name: 'Novo catálogo' }));
    const dialog = view.getByRole('dialog', { name: 'Novo catálogo' });
    expect(fontPx(dialog.querySelector('label.vnext-library-create-name')!)).toBeGreaterThanOrEqual(15);
    expect(fontPx(dialog.querySelector('#create-name-help')!)).toBeGreaterThanOrEqual(15);
    expect(fontPx(within(dialog).getByText('Recomendado para começar'))).toBeGreaterThanOrEqual(13);
    expect(fontPx(within(dialog).getByText('Título, foto e tabela técnica.'))).toBeGreaterThanOrEqual(13);
    const close = within(dialog).getByRole('button', { name: 'Fechar' });
    expect(px(getComputedStyle(close).height)).toBeGreaterThanOrEqual(44);
    expect(px(getComputedStyle(close).width)).toBeGreaterThanOrEqual(44);
  });
});
