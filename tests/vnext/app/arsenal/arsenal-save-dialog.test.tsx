import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createCatalogDocument } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createInMemoryArsenalStore, type ArsenalRepository, type CreateArsenalPresetRequest } from '@/vnext/arsenal';
import { ArsenalSaveDialog } from '@/vnext/app/editor/arsenal/ArsenalSaveDialog';
import { arsenalSaveRequestForSelection, type ArsenalSaveRequest } from '@/vnext/app/editor/arsenal/arsenal-runtime';
import { contractTable } from '../../arsenal/contract/fixtures';
import { ACTORS, testRuntime, testUuid, viewerOf, wrapRepository } from './arsenal-doubles';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function catalog(): CatalogDocument {
  const base = createCatalogDocument(testUuid, 'Catálogo de teste');
  const objects: EditorialObject[] = [
    { id: 'band', type: 'shape', shape: 'rectangle', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 }, style: { fill: '#003366' } },
    {
      id: 'title', type: 'text', zIndex: 1, frame: { xMm: 18, yMm: 8, widthMm: 120, heightMm: 8 },
      text: plainRichText('title', 'Termômetro de precisão'), style: { fontSizePt: 16, fontWeight: 700, color: '#ffffff' },
    },
    { id: 'spec', type: 'table', zIndex: 2, frame: { xMm: 18, yMm: 60, widthMm: 174, heightMm: 30 }, table: contractTable('spec', 'with-values') },
  ];
  return { ...base, pages: [{ ...base.pages[0], objects }] };
}

type RequestFor = ArsenalSaveRequest | ((document: CatalogDocument) => ArsenalSaveRequest);

function setup(requestFor: RequestFor, repository?: (base: ArsenalRepository) => ArsenalRepository) {
  const store = createInMemoryArsenalStore();
  const base = store.as({ ...ACTORS.author });
  const runtime = testRuntime(repository ? repository(base) : base, viewerOf(ACTORS.author));
  const document = catalog();
  const request = typeof requestFor === 'function' ? requestFor(document) : requestFor;
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<ArsenalSaveDialog runtime={runtime} document={document} request={request} assetUrls={new Map()} onClose={onClose} onSaved={onSaved} />);
  const dialog = screen.getByRole('dialog', { name: 'Guardar no arsenal' });
  return { runtime, store, document, onSaved, onClose, dialog };
}

const selection = (...objects: Pick<EditorialObject, 'id' | 'type'>[]) =>
  (document: CatalogDocument) => arsenalSaveRequestForSelection(document.pages[0].id, objects)!;

describe('Onda 4.5 — diálogo "Guardar no arsenal"', () => {
  it('guarda a seleção com nome sugerido, categoria e etiquetas, para toda a equipe', async () => {
    const { dialog, onSaved, store } = setup(selection({ id: 'band', type: 'shape' }, { id: 'title', type: 'text' }));
    const name = within(dialog).getByRole('textbox', { name: 'Nome' });
    expect(name).toHaveValue('Bloco da página');
    expect(name).toHaveFocus();
    const category = within(dialog).getByRole('combobox', { name: 'Categoria' });
    expect([...category.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Capas', 'Cabeçalhos', 'Rodapés', 'Páginas']);
    // No table here: no warning about values.
    expect(within(dialog).queryByText(/A tabela vai sem valores/)).toBeNull();
    expect(within(dialog).queryByRole('group', { name: 'O que guardar' })).toBeNull();

    fireEvent.change(name, { target: { value: '  Cabeçalho   azul  ' } });
    fireEvent.change(category, { target: { value: 'cabecalhos' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Etiquetas (opcional)' }), { target: { value: 'azul, faixa, Azul' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [preset, message] = onSaved.mock.calls[0];
    expect(message).toBe('“Cabeçalho azul” guardado no arsenal, em Cabeçalhos. Toda a equipe já pode usar.');
    expect(preset).toMatchObject({ name: 'Cabeçalho azul', category: 'cabecalhos', kind: 'block', origin: 'person', tags: ['azul', 'faixa'] });
    const seenByOthers = await store.as(ACTORS.otherEditor).list();
    expect(seenByOthers.ok && seenByOthers.value.map((entry) => entry.name)).toEqual(['Cabeçalho azul']);
  });

  it('tabela vai sem valores por padrão; manter os valores é escolha explícita', async () => {
    const { dialog, runtime, onSaved } = setup({ source: { kind: 'table', objectId: 'spec' }, styleObjectId: 'spec' });
    const values = dialog.querySelector('[data-arsenal-table-values]')!;
    expect(values).toHaveAttribute('data-arsenal-table-values', 'structure-only');
    expect(values).toHaveTextContent('A tabela vai sem valores');
    expect(runtime.capture.calls.at(-1)?.tableValues).toBe('structure-only');
    expect(within(dialog).getByRole('combobox', { name: 'Categoria' })).toHaveValue('tabelas');

    const keep = within(dialog).getByRole('checkbox', { name: /Manter os valores/ });
    expect(keep).not.toBeChecked();
    fireEvent.click(keep);
    expect(runtime.capture.calls.at(-1)?.tableValues).toBe('generic-values');
    expect(values).toHaveTextContent('Use só para conteúdo genérico');
    fireEvent.click(keep);
    expect(runtime.capture.calls.at(-1)?.tableValues).toBe('structure-only');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [preset, message] = onSaved.mock.calls[0];
    expect(preset.payload.tableValues).toBe('structure-only');
    expect(message).toMatch(/A tabela foi sem valores\.$/);
  });

  it('"Só a aparência" guarda um estilo em Estilos', async () => {
    const { dialog, onSaved } = setup(selection({ id: 'title', type: 'text' }));
    const group = within(dialog).getByRole('group', { name: 'O que guardar' });
    fireEvent.click(within(group).getByRole('radio', { name: /Só a aparência/ }));
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Estilo de texto');
    expect(within(dialog).getByRole('combobox', { name: 'Categoria' })).toHaveValue('estilos');
    expect(within(dialog).getByRole('combobox', { name: 'Categoria' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0]).toMatchObject({ kind: 'style', category: 'estilos', name: 'Estilo de texto' });
  });

  it('a IA sugere nome e categoria; a pessoa confirma e o modelo fica com origem IA', async () => {
    const { dialog, onSaved } = setup((document) => ({
      source: { kind: 'page', pageId: document.pages[0].id }, origin: 'ai', suggestedName: 'Página de acessórios', suggestedCategory: 'paginas',
    }));
    expect(dialog).toHaveTextContent('A IA sugeriu; você confirma o nome e a categoria');
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Página de acessórios');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0][0]).toMatchObject({ origin: 'ai', kind: 'page', category: 'paginas' });
  });

  it('sem nome não guarda; etiqueta longa demais é avisada', async () => {
    const { dialog, onSaved } = setup(selection({ id: 'band', type: 'shape' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome' }), { target: { value: '   ' } });
    expect(within(dialog).getByRole('button', { name: 'Guardar no arsenal' })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome' }), { target: { value: 'Faixa' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Etiquetas (opcional)' }), { target: { value: 'x'.repeat(40) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cada etiqueta pode ter até 32 letras.');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('"não deu para confirmar": tentar de novo usa os mesmos ids (não duplica)', async () => {
    const requests: CreateArsenalPresetRequest[] = [];
    let first = true;
    const { dialog, onSaved } = setup(selection({ id: 'band', type: 'shape' }), (base) => wrapRepository(base, {
      create: async (request) => {
        requests.push(request);
        if (first) { first = false; return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } }; }
        return base.create(request);
      },
    }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Clique em Guardar de novo: não fica repetido.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(requests).toHaveLength(2);
    expect(requests[1].presetId).toBe(requests[0].presetId);
    expect(requests[1].mutationId).toBe(requests[0].mutationId);
  });

  it('o que sumiu da página é explicado e nada é guardado', () => {
    const { dialog, runtime } = setup({ source: { kind: 'table', objectId: 'nao-existe' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('O que estava selecionado mudou.');
    expect(within(dialog).queryByRole('button', { name: 'Guardar no arsenal' })).toBeNull();
    expect(runtime.capture.calls).toHaveLength(1);
  });

  it('Esc e Cancelar fecham sem guardar', () => {
    const { dialog, onClose, onSaved } = setup(selection({ id: 'band', type: 'shape' }));
    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Nome' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
