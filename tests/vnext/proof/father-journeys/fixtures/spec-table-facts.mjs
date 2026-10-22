// J2-lite: os PDFs de prova e a resposta CONTROLADA da IA ("sheet" do vnext-catalog-draft) para cada um.
//
// Os números, rótulos, unidades e condições são os REAIS do folder TA (p. 9, inglês) e do manual TA em português
// (p. 5), conferidos à mão em docs/ai-catalog/spike-extracao/gabarito.json. As páginas são refeitas com jsPDF no
// mesmo arranjo de tabela (uma coluna por modelo), então o verificador do app lê texto nativo e posições como nos PDFs.
// O folder tem 10 páginas e as especificações na 9; o manual tem 6 e as especificações na 5 (as outras páginas só
// têm o nome do produto), para a sugestão de páginas ter o que achar.
//
// O que cada linha deve virar no app (garantido por tests/vnext/ai-catalog/spec-table/spec-table-facts.test.ts):
//   folder · Operating Range ........ VERIFIED (e diverge do manual: 155 x 140 °C, 23 x 20 °C → escolha da pessoa)
//   folder · Resolution .............. VISUAL_ONLY (a unidade não está impressa ao lado do valor → em branco)
//   folder · Electric Power, Weight .. VERIFIED
//   manual · Faixa de Operação, Potência Elétrica .. VERIFIED
import { Buffer } from 'node:buffer';
import { jsPDF } from 'jspdf';

export const TA = ['TA-25N', 'TA-35N', 'TA-50N'];
export const FOLDER_FILE = 'presys-ta-folder.pdf';
export const MANUAL_FILE = 'manual-ta-pt.pdf';
export const FOLDER_SPEC_PAGE = 9;
export const MANUAL_SPEC_PAGE = 5;

const FOLDER_ROWS = [
  { key: 'operating-range', label: 'Operating Range', unit: '°C', condition: 'ambient temperature: 23 °C',
    values: ['-25 °C to +155 °C', '-35 °C to +155 °C', '-50 °C to +155 °C'] },
  { key: 'resolution', label: 'Resolution', unit: '°C', condition: '', values: ['0.01', '0.01', '0.01'] },
  { key: 'electric-power', label: 'Electric Power', unit: 'W', condition: '', values: ['200', '300', '400'],
    printed: ['200 W', '300 W', '400 W'] },
  { key: 'weight', label: 'Weight', unit: 'kg', condition: '', values: ['10.5', '10.5', '12.5'],
    printed: ['10.5 kg', '10.5 kg', '12.5 kg'] },
];
const MANUAL_ROWS = [
  { key: 'operating-range', label: 'Faixa de Operação (°C)', unit: '°C', condition: 'Temperatura Ambiente: 20°C',
    values: ['-25 a 140', '-35 a 140', '-50 a 140'] },
  { key: 'electric-power', label: 'Potência Elétrica (W)', unit: 'W', condition: '', values: ['200', '300', '400'] },
];
const FOLDER = { file: FOLDER_FILE, pages: 10, specPage: FOLDER_SPEC_PAGE, heading: 'Technical Specifications',
  modelsLabel: 'Models', rows: FOLDER_ROWS, notes: ['ambient temperature: 23 °C'], filler: 'Folder TA-25N / TA-35N / TA-50N' };
const MANUAL = { file: MANUAL_FILE, pages: 6, specPage: MANUAL_SPEC_PAGE, heading: 'Especificações Técnicas',
  modelsLabel: 'Modelos', rows: MANUAL_ROWS, notes: ['Temperatura Ambiente: 20°C'], filler: 'Manual TA-25N / TA-35N / TA-50N' };

const rowText = (label, cells) => [label, ...cells].join(' ');

function bytesOf(spec) {
  const doc = new jsPDF({ format: 'a4', unit: 'pt' });
  doc.setFontSize(9);
  for (let page = 1; page <= spec.pages; page++) {
    if (page > 1) doc.addPage();
    if (page !== spec.specPage) {
      doc.text(spec.filler, 40, 70);
      doc.text(`Página ${page}`, 40, 90);
      continue;
    }
    doc.text(spec.heading, 40, 70);
    const line = (y, label, cells) => {
      doc.text(label, 40, y);
      cells.forEach((text, index) => doc.text(text, 220 + index * 110, y));
    };
    line(100, spec.modelsLabel, TA);
    spec.rows.forEach((row, index) => line(130 + index * 20, row.label, row.printed ?? row.values));
    spec.notes.forEach((note, index) => doc.text(note, 40, 140 + spec.rows.length * 20 + index * 20));
  }
  return Buffer.from(doc.output('arraybuffer'));
}

/** What the AI "answered" for the specification page (format v3 of vnext-catalog-draft). */
function sheetOf(spec) {
  return {
    title: spec.heading,
    models: [...TA],
    sections: [{
      title: spec.heading,
      rows: spec.rows.map((row) => ({
        key: row.key, label: row.label,
        values: row.values.map((literal, index) => ({
          model: TA[index], literal, unit: row.unit, condition: row.condition,
          sourceRef: { page: spec.specPage, quote: rowText(row.label, row.printed ?? row.values) },
        })),
      })),
    }],
    sharedTables: [],
    pages: [{ page: spec.specPage, content: 'specifications' }],
  };
}

export const folderPdfBytes = () => bytesOf(FOLDER);
export const manualPdfBytes = () => bytesOf(MANUAL);
export const folderSheet = () => sheetOf(FOLDER);
export const manualSheet = () => sheetOf(MANUAL);
/** window.__FATHER_DRAFT__ of the harness: the controlled answer of each file, by file name. */
export const controlledAnswers = () => ({ answers: { [FOLDER_FILE]: folderSheet(), [MANUAL_FILE]: manualSheet() } });
