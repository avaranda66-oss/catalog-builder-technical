import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { SourceIntakeSection } from '@/vnext/ai-catalog/intake/SourceIntakeSection';
import { createSourceFileStore } from '@/vnext/ai-catalog/intake/intake-store';
import { useSourceIntake } from '@/vnext/ai-catalog/intake/useSourceIntake';
import { fileOf, png } from './intake-fixtures';

const id = () => crypto.randomUUID();
const MODELS = 'Modelo;Faixa\nPCON-Y17;0 a 20 bar\nTA-25N;-25 a 140 °C\nTA-35N;-35 a 155 °C\n';
// Every photo needs its own bytes, or the second one is "arquivo repetido".
const photo = (name: string, width: number) => fileOf(png(width, 1800), name);

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FR-71 useSourceIntake: photos and products', () => {
  it('takes the product codes from the dropped tables and the extracted facts, and links the photos by name', async () => {
    const { result } = renderHook(() => useSourceIntake({ factModels: ['TA-50N'] }));
    expect(result.current.productCodes).toEqual(['TA-50N']);
    act(() => {
      result.current.addFiles([
        fileOf(MODELS, 'lista.csv'), photo('PCON-Y17_frente.jpg', 2400), photo('pcony17.jpg', 2401),
        photo('TA-25N e TA-35N.jpg', 2402), photo('IMG_2034.jpg', 2403),
      ]);
    });
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 15_000 });
    expect(result.current.productCodes).toEqual(['PCON-Y17', 'TA-25N', 'TA-35N', 'TA-50N']);
    const [, front, plain, two, unnamed] = result.current.entries;
    const links = result.current.photoLinks;
    expect(links.get(front.id)).toMatchObject({ state: 'linked', code: 'PCON-Y17', by: 'name' });
    expect(links.get(plain.id)).toMatchObject({ state: 'linked', code: 'PCON-Y17', by: 'name' });
    expect(links.get(two.id)).toMatchObject({ state: 'ask', reason: 'several', candidates: ['TA-25N', 'TA-35N'] });
    expect(links.get(unnamed.id)).toMatchObject({ state: 'ask', reason: 'none' });
    expect(links.size).toBe(4);

    // The person's choice wins and survives a new render; `undefined` goes back to the name.
    act(() => result.current.linkPhoto(unnamed.id, 'TA-50N'));
    expect(result.current.photoLinks.get(unnamed.id)).toMatchObject({ state: 'linked', code: 'TA-50N', by: 'person' });
    act(() => result.current.linkPhoto(front.id, 'TA-35N'));
    expect(result.current.photoLinks.get(front.id)).toMatchObject({ state: 'linked', code: 'TA-35N', by: 'person' });
    act(() => result.current.linkPhoto(front.id, undefined));
    expect(result.current.photoLinks.get(front.id)).toMatchObject({ state: 'linked', code: 'PCON-Y17', by: 'name' });
  });

  it('with no table or facts yet, a photo waits and nothing is guessed; a file that is not a photo is never linked', async () => {
    const store = createSourceFileStore();
    const { result } = renderHook(() => useSourceIntake({ store }));
    act(() => { result.current.addFiles([photo('PCON-Y17_frente.jpg', 2400)]); });
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 15_000 });
    const [only] = result.current.entries;
    expect(result.current.productCodes).toEqual([]);
    expect(result.current.photoLinks.get(only.id)).toEqual({ state: 'ask', reason: 'no-products', candidates: [] });
    // A choice for a file that is not a photo (or that is gone) changes nothing.
    act(() => result.current.linkPhoto('nao-existe', 'TA-25N'));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].photoProduct).toBeUndefined();
  });

  it('a photo that could not be read is not linked', async () => {
    const { result } = renderHook(() => useSourceIntake());
    act(() => { result.current.addFiles([fileOf(MODELS, 'lista.csv'), fileOf('não é uma foto', 'TA-25N.jpg')]); });
    await waitFor(() => expect(result.current.busy).toBe(false), { timeout: 15_000 });
    expect(result.current.entries[1].state).toBe('error');
    expect(result.current.photoLinks.size).toBe(0);
  });
});

describe('FR-71 photos in the file list', () => {
  function setup() {
    const session = createDocumentSession(createCatalogDocument(id, 'TA-25N — Ficha técnica 2026'), { createId: id });
    render(<SourceIntakeSection session={session} activePageId={session.getSnapshot().document.pages[0].id} onBeforeMutation={() => true} measurement={null} />);
  }
  const choose = (files: File[]) => fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files } });
  const row = (name: string) => within(screen.getByRole('list', { name: 'Arquivos enviados' })).getByText(name).closest('li')!;

  it('says "Foto ligada a: …" with a change button, asks with one button per product, and the choice sticks', async () => {
    setup();
    choose([fileOf(MODELS, 'lista.csv'), photo('PCON-Y17_frente.jpg', 2400), photo('TA-25N e TA-35N.jpg', 2402), photo('IMG_2034.jpg', 2403)]);
    const list = screen.getByRole('list', { name: 'Arquivos enviados' });
    await waitFor(() => expect(within(list).queryByText('Lendo…')).not.toBeInTheDocument(), { timeout: 15_000 });

    // One match by name: linked by itself.
    expect(within(row('PCON-Y17_frente.jpg')).getByText(/Foto ligada a: PCON-Y17/)).toBeInTheDocument();
    // The table itself has no question.
    expect(within(row('lista.csv')).queryByText(/Foto ligada a/)).not.toBeInTheDocument();

    // Two products in the name: the question, with both products (and only them) one click away.
    const two = row('TA-25N e TA-35N.jpg');
    expect(within(two).getByText('O nome do arquivo cita mais de um produto. A qual deles esta foto pertence?')).toBeInTheDocument();
    expect(within(two).getAllByRole('button', { name: /^Ligar a foto TA-25N e TA-35N\.jpg ao produto / }).map((button) => button.textContent)).toEqual(['TA-25N', 'TA-35N']);
    fireEvent.click(within(two).getByRole('button', { name: 'Ligar a foto TA-25N e TA-35N.jpg ao produto TA-35N' }));
    expect(within(row('TA-25N e TA-35N.jpg')).getByText(/Foto ligada a: TA-35N/)).toBeInTheDocument();
    expect(within(row('TA-25N e TA-35N.jpg')).queryByText(/A qual deles/)).not.toBeInTheDocument();
    // The keyboard stays on the row: it goes to "Trocar".
    expect(within(row('TA-25N e TA-35N.jpg')).getByRole('button', { name: 'Trocar o produto da foto TA-25N e TA-35N.jpg' })).toHaveFocus();

    // No product in the name: the question offers every product.
    const unnamed = row('IMG_2034.jpg');
    expect(within(unnamed).getByText('Não achei o produto pelo nome do arquivo. A qual produto esta foto pertence?')).toBeInTheDocument();
    expect(within(unnamed).getAllByRole('button', { name: /^Ligar a foto IMG_2034\.jpg ao produto / })).toHaveLength(3);

    // "Trocar" opens the choice, marks the current product, and a new choice replaces the link.
    const front = row('PCON-Y17_frente.jpg');
    fireEvent.click(within(front).getByRole('button', { name: 'Trocar o produto da foto PCON-Y17_frente.jpg' }));
    expect(within(front).getByRole('button', { name: 'Ligar a foto PCON-Y17_frente.jpg ao produto PCON-Y17' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(front).queryByRole('button', { name: 'Usar o que o nome do arquivo diz' })).not.toBeInTheDocument();
    fireEvent.click(within(front).getByRole('button', { name: 'Ligar a foto PCON-Y17_frente.jpg ao produto TA-25N' }));
    expect(within(row('PCON-Y17_frente.jpg')).getByText(/Foto ligada a: TA-25N/)).toBeInTheDocument();

    // The person can go back to what the name says.
    fireEvent.click(within(row('PCON-Y17_frente.jpg')).getByRole('button', { name: 'Trocar o produto da foto PCON-Y17_frente.jpg' }));
    fireEvent.click(within(row('PCON-Y17_frente.jpg')).getByRole('button', { name: 'Usar o que o nome do arquivo diz' }));
    expect(within(row('PCON-Y17_frente.jpg')).getByText(/Foto ligada a: PCON-Y17/)).toBeInTheDocument();
  });

  it('with no table dropped yet it asks for the spreadsheet or PDF, with no buttons to guess from', async () => {
    setup();
    choose([photo('PCON-Y17_frente.jpg', 2400)]);
    const list = screen.getByRole('list', { name: 'Arquivos enviados' });
    await waitFor(() => expect(within(list).queryByText('Lendo…')).not.toBeInTheDocument(), { timeout: 15_000 });
    const only = row('PCON-Y17_frente.jpg');
    expect(within(only).getByText('Ainda não sei a qual produto esta foto pertence. Envie também a planilha ou o PDF com os modelos.')).toBeInTheDocument();
    expect(within(only).queryByRole('button', { name: /Ligar a foto/ })).not.toBeInTheDocument();
  });

  it('with many products the choice is a list instead of a wall of buttons', async () => {
    setup();
    const codes = Array.from({ length: 9 }, (_, index) => `TA-${20 + index}N`);
    choose([fileOf(`Modelo;Faixa\n${codes.map((code) => `${code};1`).join('\n')}\n`, 'lista.csv'), photo('IMG_2034.jpg', 2403)]);
    const list = screen.getByRole('list', { name: 'Arquivos enviados' });
    await waitFor(() => expect(within(list).queryByText('Lendo…')).not.toBeInTheDocument(), { timeout: 15_000 });
    const unnamed = row('IMG_2034.jpg');
    expect(within(unnamed).queryByRole('button', { name: /Ligar a foto/ })).not.toBeInTheDocument();
    const select = within(unnamed).getByRole('combobox', { name: 'Produto da foto IMG_2034.jpg' });
    expect(within(select).getAllByRole('option')).toHaveLength(10);
    fireEvent.change(select, { target: { value: 'TA-24N' } });
    expect(within(row('IMG_2034.jpg')).getByText(/Foto ligada a: TA-24N/)).toBeInTheDocument();
  });
});
