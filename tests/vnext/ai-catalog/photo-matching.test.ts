import { describe, expect, it } from 'vitest';
import {
  compactCode, extractModelCodes, matchPhotoToProducts, modelCodesFromFacts, modelCodesFromTable, normalizePhotoName,
  photoLinkText, resolvePhotoLinks, uniqueModelCodes, type PhotoMatch,
} from '@/vnext/ai-catalog/photo-matching';
import type { SourceTableBlock } from '@/vnext/ai-catalog/intake/intake-model';

const table = (rows: string[][], headerRow?: number): SourceTableBlock => ({
  id: 't1', title: 'Tabela', kind: 'table', rows, headerRow,
  source: { fileName: 'lista.csv', sha256: 'x', location: 'arquivo' }, warnings: [],
} as unknown as SourceTableBlock);

const CODES = ['PCON-Y17', 'TA-25N', 'TA-35N', 'TA-50N'];
const candidatesOf = (match: PhotoMatch): readonly string[] => match.status === 'ask' ? match.candidates : [];

describe('FR-71 photo-matching: file names', () => {
  it('normalizes the name: no extension, upper case, every run of separators one dash', () => {
    expect(normalizePhotoName('PCON-Y17_frente.jpg')).toBe('PCON-Y17-FRENTE');
    expect(normalizePhotoName('pcon y17..frente .JPEG')).toBe('PCON-Y17-FRENTE');
    expect(normalizePhotoName('Calibrador_Temperatura.final.PNG')).toBe('CALIBRADOR-TEMPERATURA-FINAL');
    expect(compactCode('Pcon-Y17')).toBe('PCONY17');
  });

  it("'PCON-Y17_frente.jpg' is linked by itself to PCON-Y17", () => {
    expect(matchPhotoToProducts('PCON-Y17_frente.jpg', CODES)).toEqual({ status: 'matched', code: 'PCON-Y17' });
  });

  it("'pcony17.jpg' matches PCON-Y17 without the dash", () => {
    expect(matchPhotoToProducts('pcony17.jpg', CODES)).toEqual({ status: 'matched', code: 'PCON-Y17' });
    expect(matchPhotoToProducts('Pcon Y17 (2).JPG', CODES)).toEqual({ status: 'matched', code: 'PCON-Y17' });
  });

  it("'TA-25N e TA-35N.jpg' names two products: it becomes a question with both", () => {
    expect(matchPhotoToProducts('TA-25N e TA-35N.jpg', CODES)).toEqual({
      status: 'ask', reason: 'several', candidates: ['TA-25N', 'TA-35N'],
    });
  });

  it("'IMG_2034.jpg' names no product: a question that offers every product, never a guess", () => {
    const match = matchPhotoToProducts('IMG_2034.jpg', CODES);
    expect(match).toMatchObject({ status: 'ask', reason: 'none' });
    expect([...candidatesOf(match)].sort()).toEqual([...CODES].sort());
  });

  it('a code is never found inside a longer one, nor the other way round', () => {
    expect(matchPhotoToProducts('TA-25N.jpg', ['TA-25', 'TA-25N'])).toEqual({ status: 'matched', code: 'TA-25N' });
    expect(matchPhotoToProducts('TA-25.jpg', ['TA-25', 'TA-25N'])).toEqual({ status: 'matched', code: 'TA-25' });
    expect(matchPhotoToProducts('PCON-Y17-HT_frente.jpg', ['PCON-Y17', 'PCON-Y17-HT'])).toEqual({ status: 'matched', code: 'PCON-Y17-HT' });
    expect(matchPhotoToProducts('PCON-Y17_frente.jpg', ['PCON-Y17', 'PCON-Y17-HT'])).toEqual({ status: 'matched', code: 'PCON-Y17' });
    expect(matchPhotoToProducts('TA-250.jpg', ['TA-25'])).toMatchObject({ status: 'ask', reason: 'none' });
  });

  it('a name that only starts like a product puts that product first in the question', () => {
    const match = matchPhotoToProducts('pcon_foto_nova.jpg', CODES);
    expect(match).toMatchObject({ status: 'ask', reason: 'none' });
    expect(candidatesOf(match)[0]).toBe('PCON-Y17');
  });
});

describe('FR-71 photo-matching: where the model codes come from', () => {
  it('reads model-looking tokens and leaves standards and sizes out', () => {
    expect(extractModelCodes('Modelo TA-25N / TA-35N, IP65, DN15, PN16')).toEqual(['TA-25N', 'TA-35N']);
    expect(extractModelCodes('pcon y17')).toEqual([]);
    expect(extractModelCodes('PCON-Y17-HT')).toContain('PCON-Y17');
  });

  it('takes the codes from the table header and from the column that names the product', () => {
    const sideBySide = table([['Especificação', 'TA-25N', 'TA-35N'], ['Faixa', '-25 a 140 °C', '-35 a 155 °C']], 0);
    expect(modelCodesFromTable(sideBySide)).toEqual(['TA-25N', 'TA-35N']);
    const listed = table([['Modelo', 'Faixa', 'Exatidão'], ['TA-25N', '-25 a 140 °C', '±0,1 °C'], ['TA-50N', '33 a 650 °C', '±0,2 °C']], 0);
    expect(modelCodesFromTable(listed)).toEqual(['TA-25N', 'TA-50N']);
    // Specification text is not searched: "IP65" or a range never becomes a product.
    const withNoise = table([['Modelo', 'Proteção'], ['0D100', 'IP65 / DN15'], ['Y17-HP', 'PN16']], 0);
    expect(modelCodesFromTable(withNoise)).toEqual(['0D100', 'Y17-HP']);
  });

  it('keeps codes with no model column out (a table of ranges is not a product list)', () => {
    expect(modelCodesFromTable(table([['Faixa', 'Exatidão'], ['TA-25N', '±0,1 °C']], 0))).toEqual([]);
  });

  it('takes the codes from the models of the extracted facts', () => {
    expect(modelCodesFromFacts(['TA-25N', 'PCON-Y17 HT', 'PCON-Y17-HT', 'sem código aqui'])).toEqual(['TA-25N', 'PCON-Y17', 'PCON-Y17-HT']);
  });

  it('one entry per code, whatever the dashes or case; the first spelling wins', () => {
    expect(uniqueModelCodes(['PCON-Y17', 'pcony17', 'TA-25N', 'ta 25n', 'X'])).toEqual(['PCON-Y17', 'TA-25N']);
  });
});

describe('FR-71 photo-matching: what the screen shows', () => {
  const photos = [
    { id: 'a', fileName: 'PCON-Y17_frente.jpg' },
    { id: 'b', fileName: 'TA-25N e TA-35N.jpg' },
    { id: 'c', fileName: 'IMG_2034.jpg' },
    { id: 'd', fileName: 'pcony17.jpg', chosen: 'TA-50N' },
  ];

  it('links the unambiguous one, asks for the others, and the person always wins', () => {
    const links = resolvePhotoLinks(photos, CODES);
    expect(links.get('a')).toMatchObject({ state: 'linked', code: 'PCON-Y17', by: 'name' });
    expect(links.get('b')).toMatchObject({ state: 'ask', reason: 'several', candidates: ['TA-25N', 'TA-35N'] });
    expect(links.get('c')).toMatchObject({ state: 'ask', reason: 'none' });
    expect(links.get('d')).toMatchObject({ state: 'linked', code: 'TA-50N', by: 'person' });
  });

  it('with no products read yet nothing is linked and the text asks for the spreadsheet or PDF', () => {
    const links = resolvePhotoLinks(photos, []);
    expect(links.get('a')).toEqual({ state: 'ask', reason: 'no-products', candidates: [] });
    expect(links.get('d')).toMatchObject({ state: 'linked', by: 'person' });
    expect(photoLinkText(links.get('a'))).toBe('Ainda não sei a qual produto esta foto pertence. Envie também a planilha ou o PDF com os modelos.');
  });

  it('writes the lines the father reads', () => {
    const links = resolvePhotoLinks(photos, CODES);
    expect(photoLinkText(links.get('a'))).toBe('Foto ligada a: PCON-Y17');
    expect(photoLinkText(links.get('b'))).toBe('O nome do arquivo cita mais de um produto. A qual deles esta foto pertence?');
    expect(photoLinkText(links.get('c'))).toBe('Não achei o produto pelo nome do arquivo. A qual produto esta foto pertence?');
    expect(photoLinkText(undefined)).toBe('');
  });
});
