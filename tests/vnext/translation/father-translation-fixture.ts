import { CatalogDocumentSchema, plainRichText, type CatalogDocument } from '@/vnext';
import { createW5ATranslationDocument } from './w5a-fixture';

const descriptions = [
  'Preparação da calibração: confira o sensor de referência, a conexão elétrica e o certificado antes de iniciar o ensaio.',
  'Estabilização térmica: aguarde a indicação permanecer dentro da condição de referência e registre o ambiente de medição.',
  'Aquisição de resultados: compare a leitura do instrumento com a referência e registre separadamente exatidão e incerteza expandida.',
  'Instalação industrial: verifique ventilação, acesso às conexões e compatibilidade da alimentação com a configuração solicitada.',
  'Comunicação e rastreabilidade: mantenha a identificação do ensaio e do operador no registro, sem inferir certificações ausentes.',
  'Manutenção preventiva: inspecione cabos e conectores; componentes opcionais dependem da configuração e devem ser confirmados.',
];

/** Realistic authored evaluation content, never approved PRESYS product specifications. */
export function technicalNarrative(count: number): string {
  return Array.from({ length: count }, (_, index) => `${descriptions[index % descriptions.length]} Ensaio ${index + 1}: referência ${20 + index},5 °C; saída 4–20 mA; interface RS-485; identificação TA-${25 + index}N.`).join(' ');
}

export function fatherTranslationCatalog(size: 'small' | 'medium' | 'large'): CatalogDocument {
  const document = createW5ATranslationDocument();
  if (size === 'small') return document;
  document.title = `Catálogo técnico de avaliação ${size === 'large' ? 'completo' : 'intermediário'} PRESYS`;
  const extraPages = size === 'large' ? 6 : 2;
  for (let pageIndex = 0; pageIndex < extraPages; pageIndex += 1) {
    const pageId = `father-translation-page-${pageIndex}`;
    const objects: CatalogDocument['pages'][number]['objects'] = [];
    for (let objectIndex = 0; objectIndex < 4; objectIndex += 1) {
      const id = `${pageId}-text-${objectIndex}`;
      objects.push({ id, type: 'text', zIndex: objectIndex,
        frame: { xMm: 10, yMm: 10 + objectIndex * 40, widthMm: 185, heightMm: 35 }, style: {},
        text: plainRichText(`${id}-rich`, `${descriptions[(pageIndex + objectIndex) % descriptions.length]} Ponto de referência ${pageIndex + 1}${objectIndex},5 °C.`) });
    }
    if (pageIndex === 0 || (size === 'large' && pageIndex === 3)) {
      const id = `${pageId}-table`;
      const rowCount = size === 'large' ? 100 : 20;
      const columnCount = size === 'large' ? 8 : 5;
      const columns = Array.from({ length: columnCount }, (_, index) => ({ id: `${id}-column-${index}`, width: { mode: 'fixed' as const, mm: 180 / columnCount }, minMm: 5 }));
      const rows = Array.from({ length: rowCount }, (_, index) => ({ id: `${id}-row-${index}`, role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } }));
      const fields = ['Faixa operacional', 'Condição de referência', 'Sensor de medição', 'Incerteza expandida', 'Estabilidade térmica', 'Conexão elétrica', 'Interface de comunicação', 'Observação do ensaio'];
      objects.push({ id, type: 'table', zIndex: 4, frame: { xMm: 10, yMm: 170, widthMm: 180, heightMm: 110 }, table: {
        id: `${id}-model`, title: plainRichText(`${id}-title`, 'Registro de condições técnicas e pontos de verificação'), columns, rows,
        cells: rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => ({ id: `${id}-cell-${rowIndex}-${columnIndex}`, rowId: row.id, columnId: column.id,
          content: { type: 'richText' as const, value: plainRichText(`${id}-cell-rich-${rowIndex}-${columnIndex}`, `${fields[columnIndex]}: ponto ${rowIndex + 1}; referência ${20 + rowIndex},5 °C.`) } }))),
        style: { base: { fontFamily: 'Noto Sans', fontSizePt: 8, lineHeight: 1.2 }, rowRoles: {}, annotation: { fontFamily: 'Noto Sans', fontSizePt: 8, lineHeight: 1.2 }, annotationGapMm: 1 }, annotationIds: [], annotations: [], legend: [],
      } });
    }
    document.pages.push({ id: pageId, widthMm: 210, heightMm: 297, objects });
  }
  return CatalogDocumentSchema.parse(document);
}
