import { plainRichText, type CatalogDocument, type Page, type TableModel } from '@/vnext/domain';

export type FatherDatasetLevel = 'small' | 'medium' | 'large' | 'stress' | 'table2' | 'table10' | 'table50';
const asset = { id: 'father-product-image', version: '1', sha256: 'e6c377af5ce42ce0604076d1919144f823efdd345e2b2ac11f40efe003174486', mime: 'image/png' as const, widthPx: 720, heightPx: 482, name: 'TA-25N', alt: 'PRESYS TA-25N — imagem técnica de prova' };
export const FATHER_ASSET_URL = '/assets/presys/ta-25n-starter-v1.png';
const signals = ['Pt100', 'Pt1000', 'TC-K', 'TC-J', 'TC-T', 'mA', 'mV', 'Ω'];
const ranges = ['−25…140 °C', '0…100 °C', '−40…400 °C', '0…200 °C', '−20…80 °C', '4…20 mA', '0…100 mV', '0…400 Ω'];
const headings = ['Canal', 'Sinal', 'Faixa', 'Resolução', 'Incerteza', 'Tempo', 'Conexão', 'Nota'];
export function fatherTable(id: string, count: number, columns = 8, offset = 0): TableModel {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `${id}:r${i}`, role: i === 0 ? 'header' as const : 'body' as const, heightPolicy: { mode: 'AUTO' as const } }));
  const cols = Array.from({ length: columns }, (_, i) => ({ id: `${id}:c${i}`, width: { mode: 'flex' as const, weight: 1 }, minMm: 5 }));
  return { id, columns: cols, rows, cells: rows.flatMap((row, r) => cols.map((col, c) => {
    const n = offset + r, signal = n % signals.length;
    const values = [`CH-${String(n).padStart(3, '0')}`, signals[signal], ranges[signal], signal < 5 ? '0,01 °C' : '0,001', signal < 5 ? '±0,1 °C' : '±0,02%', `${3 + n % 9} min`, n % 3 === 0 ? '4 fios' : '2 fios', n % 5 === 0 ? '' : 'revisar'];
    return { id: `${id}:cell${r}-${c}`, rowId: row.id, columnId: col.id, content: { type: 'richText' as const, value: plainRichText(`${id}:text${r}-${c}`, r === 0 ? headings[c % headings.length] : values[c % values.length]) } };
  })), style: { base: { fontFamily: 'Noto Sans', fontSizePt: 7.5, lineHeight: 1.2, fontWeight: 400, color: '#172033', paddingMm: { top: 1, right: 1, bottom: 1, left: 1 }, borders: { top: { pattern: 'solid', thicknessPt: .5, color: '#173F52' }, right: { pattern: 'solid', thicknessPt: .5, color: '#173F52' }, bottom: { pattern: 'solid', thicknessPt: .5, color: '#173F52' }, left: { pattern: 'solid', thicknessPt: .5, color: '#173F52' } } }, rowRoles: { header: { background: '#dcecff', fontWeight: 700 } }, annotation: { fontSizePt: 8 }, annotationGapMm: 1 }, annotations: [], legend: [] };
}

/** Synthetic technical specifications: varied engineering content, never a claimed product specification. */
export function createFatherCatalogDataset(level: FatherDatasetLevel): CatalogDocument {
  const pageCount = level === 'large' ? 8 : level === 'medium' ? 3 : 1;
  const pages: Page[] = Array.from({ length: pageCount }, (_, p) => {
    const id = `father-${level}-p${p}`;
    const text = (name: string, value: string, x: number, y: number, width: number, height: number, size = 9) => ({ id: `${id}-${name}`, type: 'text' as const, frame: { xMm: x, yMm: y, widthMm: width, heightMm: height }, zIndex: 2, text: plainRichText(`${id}-${name}-rich`, value), style: { fontSizePt: size } });
    return { id, widthMm: 210, heightMm: 297, safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 }, objects: [
      { id: `${id}-background`, type: 'shape', frame: { xMm: 10, yMm: 10, widthMm: 190, heightMm: 20 }, zIndex: 0, shape: 'rectangle', style: { fill: '#dcecff' } },
      text('title', `PRESYS · catálogo de validação ${level} · ${p + 1}/${pageCount}`, 13, 14, 182, 12, 13),
      text('description', `Módulo ${p + 1}: calibração de sensores e transmissores. Dados sintéticos para validar edição, unidades, símbolos e publicação. Não usar como ficha comercial.`, 12, 34, 135, 30),
      { id: `${id}-image`, type: 'image', frame: { xMm: 151, yMm: 34, widthMm: 45, heightMm: 32 }, zIndex: 1, assetId: asset.id, fit: 'contain' },
      text('subtitle', `Especificações técnicas · canais ${p * 22 + 1} a ${(p + 1) * 22}`, 12, 68, 186, 8, 9),
      { id: `${id}-table`, type: 'table', frame: { xMm: 12, yMm: 79, widthMm: 186, heightMm: 173 }, zIndex: 1, table: fatherTable(`${id}-grid`, level === 'stress' ? 110 : level === 'table50' ? 50 : level === 'table10' ? 10 : level === 'table2' ? 2 : level === 'small' ? 5 : 23, level === 'table10' ? 10 : level === 'table2' ? 2 : 8, p * 22) },
      text('footer', `Referência de prova ${p + 1} · °C ± Ω Ø × · Revisar configuração e incerteza antes de publicar.`, 12, 269, 186, 13, 8),
      { id: `${id}-rule`, type: 'line', frame: { xMm: 12, yMm: 265, widthMm: 186, heightMm: .3 }, zIndex: 1, axis: 'horizontal', color: '#173F52' },
    ] };
  });
  const matrixIds = { table2: '22222222-2222-4222-8222-222222222222', table10: '10101010-1010-4010-8010-101010101010', table50: '50505050-5050-4050-8050-505050505050' };
  return { schemaVersion: 1, id: level in matrixIds ? matrixIds[level as keyof typeof matrixIds] : level === 'large' ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' : level === 'medium' ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : level === 'stress' ? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: `PRESYS · validação ${level}`, locale: 'pt-BR', style: { fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }, { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'normal' }], defaultText: { fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.2, fontWeight: 400, color: '#172033' }, palette: ['#172033', '#dcecff'] }, pages, assets: [asset] };
}
