import { CatalogDocumentSchema, plainRichText, type CatalogDocument } from '@/vnext';
import { createW5ATranslationDocument } from './w5a-fixture';

/** Synthetic evaluation material, never an approved product specification. */
export const P2_TECHNICAL_BENCHMARK = [
  {
    source: 'Calibrador de bloco seco PRESYS TA-25N para calibração de termopares e termorresistências.',
    'es-ES': 'Calibrador de bloque seco PRESYS TA-25N para la calibración de termopares y termorresistencias.',
    'en-US': 'PRESYS TA-25N dry-block calibrator for calibrating thermocouples and resistance thermometers.',
    meaning: 'Instrument class and both sensor families; no new accuracy or configuration claim.',
  },
  {
    source: 'Exatidão ±0,05 % FS; incerteza expandida ±0,10 °C (k = 2).',
    'es-ES': 'Exactitud ±0,05 % FS; incertidumbre expandida ±0,10 °C (k = 2).',
    'en-US': 'Accuracy ±0,05 % FS; expanded uncertainty ±0,10 °C (k = 2).',
    meaning: 'Accuracy and expanded uncertainty remain different metrology concepts.',
  },
  {
    source: 'Faixa de temperatura: −20–+80 °C; saída 4–20 mA; referência de 100 Ω.',
    'es-ES': 'Rango de temperatura: −20–+80 °C; salida 4–20 mA; referencia de 100 Ω.',
    'en-US': 'Temperature range: −20–+80 °C; output 4–20 mA; reference of 100 Ω.',
    meaning: 'All authored range/decimal/unit strings are exact, including the range separator.',
  },
  {
    source: 'Normas ISO/IEC 17025 e IEC 61010-1; interfaces RS-485, Modbus RTU e TCP/IP.',
    'es-ES': 'Normas ISO/IEC 17025 y IEC 61010-1; interfaces RS-485, Modbus RTU y TCP/IP.',
    'en-US': 'Standards ISO/IEC 17025 and IEC 61010-1; interfaces RS-485, Modbus RTU and TCP/IP.',
    meaning: 'Names are retained without claiming compliance or certification.',
  },
  {
    source: 'Resolução e estabilidade; unidades µA, Ω e %; símbolos ± e °C.',
    'es-ES': 'Resolución y estabilidad; unidades µA, Ω y %; símbolos ± y °C.',
    'en-US': 'Resolution and stability; units µA, Ω and %; symbols ± and °C.',
    meaning: 'Resolution is not accuracy; standalone engineering symbols are immutable.',
  },
  {
    source: 'Opcional, conforme configuração. Dados não confirmados: A COMPLETAR.',
    'es-ES': 'Opcional, según la configuración. Datos no confirmados: PENDIENTE DE COMPLETAR.',
    'en-US': 'Optional, depending on configuration. Unconfirmed information: TO BE COMPLETED.',
    meaning: 'Optional and unknown qualifiers survive; no missing specification is inferred.',
  },
  {
    source: 'Exatidão, incerteza e condições de medição',
    'es-ES': 'Exactitud, incertidumbre y condiciones de medición',
    'en-US': 'Accuracy, uncertainty and measurement conditions',
    meaning: 'Table title distinguishes metrology concepts without inventing requirements.',
  },
  {
    source: 'Faixa / unidade / condição de referência',
    'es-ES': 'Rango / unidad / condición de referencia',
    'en-US': 'Range / unit / reference condition',
    meaning: 'Concise table header retains the three separate concepts.',
  },
] as const;

export function createP2TechnicalBenchmark(): CatalogDocument {
  const document = createW5ATranslationDocument();
  document.title = 'Catálogo técnico de avaliação PRESYS TA-25N';
  const text = document.pages[0].objects.find(object => object.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Benchmark text object missing');
  text.text = {
    paragraphs: P2_TECHNICAL_BENCHMARK.map((item, index) => ({
      id: 'p2-benchmark-paragraph-' + index,
      inlines: [{ id: 'p2-benchmark-run-' + index, kind: 'text', text: item.source,
        marks: index === 0 ? ['bold'] : [] }],
    })),
  };
  const table = document.pages[0].objects.find(object => object.type === 'table');
  if (!table || table.type !== 'table') throw new Error('Benchmark table missing');
  table.table.title = plainRichText('p2-benchmark-table-title', 'Exatidão, incerteza e condições de medição');
  const cell = table.table.cells.find(item => item.content.type === 'richText');
  if (!cell) throw new Error('Benchmark header missing');
  cell.content = { type: 'richText', value: plainRichText('p2-benchmark-header', 'Faixa / unidade / condição de referência') };
  return CatalogDocumentSchema.parse(document);
}
