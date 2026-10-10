import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { createFatherCatalogDataset, fatherTable } from './father-large-catalog-data';

/** Original text fixtures. These values are not specifications of a commercial instrument. */
export function advancedTechnicalMatrix(rows: number, columns: number): string[][] {
  if (columns === 1) return Array.from({ length: rows }, (_, row) => [row === rows - 1 ? '' : row === 0 ? '00017 μA Δ ± ≤ ≥ × Ω 1.234,56 1,234.56' : 'Linha um\nLinha dois']);
  const specifications = [
    ['Temperatura do bloco', '°C', '−25…140', '−35…180'],
    ['Temperatura ambiente', '°F', '32…122', '14…140'],
    ['Pressão pneumática', 'kPa', '0…700', '0…900'],
    ['Pressão hidráulica', 'MPa', '0…2,5', '0…4,0'],
    ['Pressão manométrica', 'bar', '0…7', '0…10'],
    ['Pressão diferencial', 'mbar', '−20…20', '−50…50'],
    ['Pressão relativa', 'psi', '0…100', '0…150'],
    ['Baixa pressão', 'Pa', '−100…100', '−250…250'],
    ['Resistência Pt100', 'Ω', '0…400', '0…800'],
    ['Corrente de fuga', 'μA', '0…10', '0…20'],
    ['Corrente de saída', 'mA', '4…20', '0…24'],
    ['Tensão de saída', 'V', '0…10', '0…12'],
  ];
  const headings = ['Parâmetro / código', 'Modelo Aurora 17', 'Modelo Boreal 24', 'Unidade', 'Condição', 'Resolução', 'Incerteza', 'Nota', 'Conexão', 'Limite'];
  const matrix = Array.from({ length: rows }, (_, row) => {
    if (row === 0) return headings.slice(0, columns);
    const [parameter, unit, aurora, boreal] = specifications[(row - 1) % specifications.length];
    const values = [`${parameter} CH-${String(16 + row).padStart(5, '0')}`, `${aurora} ${unit}`, `${boreal} ${unit}`, unit,
      row % 3 === 0 ? '23 °C; 45% UR' : row % 3 === 1 ? 'Após 10 min' : 'Carga ≤ 250 Ω',
      `0,00${1 + row % 7} ${unit}`, `±0,0${1 + row % 5}%`, row % 5 === 0 ? '' : `Nota N-${String(row).padStart(3, '0')}`,
      row % 2 === 0 ? '4 fios' : '2 fios', `≥ ${1 + row % 9} × nominal`];
    if (columns >= 8 && row % 17 === 12) values[7] = 'Condição A: ambiente estável\nCondição B: aguardar estabilização\nCondição C: confirmar conexão antes da leitura';
    return values.slice(0, columns);
  });
  // Reference-format and multiline examples remain present even in the smallest fixture.
  matrix[1][0] = 'CH-00017 · μA Δ ± ≤ ≥ × Ω';
  matrix[1][1] = '1.234,56 / 1,234.56\nLinha um\nLinha dois';
  return matrix;
}

export function createAdvancedTableMatrixDocument(rows: number, columns: number, pageCount: number, run: number): CatalogDocument {
  const document = createFatherCatalogDataset('small');
  document.id = `00000000-0000-4000-8000-${String(run * 1000000 + pageCount * 10000 + rows * 10 + columns).padStart(12, '0')}`;
  document.title = `Dados sintéticos ${rows} × ${columns} · ${pageCount} páginas`;
  const source = advancedTechnicalMatrix(rows, columns);
  const template = document.pages[0];
  document.pages = Array.from({ length: pageCount }, (_, pageIndex) => {
    const pageId = `advanced-${rows}-${columns}-${pageIndex}`;
    const page = structuredClone(template);
    page.id = pageId;
    page.objects = page.objects.map(object => {
      const suffix = object.id.slice(object.id.lastIndexOf('-') + 1);
      const updated = { ...object, id: `${pageId}-${suffix}` };
      if (updated.type === 'table') {
        updated.table = fatherTable(`${pageId}-grid`, rows, columns);
        updated.table.cells = updated.table.cells.map((cell, index) => ({ ...cell,
          content: pageIndex === 0 ? { type: 'empty' as const } : {
            type: 'richText' as const,
            value: { ...plainRichText(`${cell.id}-text`, ''), paragraphs: source[Math.floor(index / columns)][index % columns]
              .split('\n').flatMap((line, lineIndex) => plainRichText(`${cell.id}-line-${lineIndex}`, line).paragraphs) },
          },
        }));
      }
      if (updated.type === 'text' && suffix === 'title') updated.text = plainRichText(`${pageId}-title-text`, `Tabela sintética ${pageIndex + 1}/${pageCount}`);
      return updated;
    });
    return page;
  });
  return document;
}
