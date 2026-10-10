import { sha256 } from '../asset/integrity';
import { factQuote, sourcePayload, type TechnicalInput } from './contracts';

/** All values/models are original synthetic examples, never manufacturer claims. */
export async function createSyntheticSpecifications(): Promise<TechnicalInput> {
  const models = ['TX-041', 'TX-062', 'TX-083'];
  const pages = [{ number: 1, text: '' }, { number: 2, text: '' }];
  const rows = (items: [string, string, string, string[]][], page: number) => items.map(([label, unit, condition, values], index) => {
    const row: TechnicalInput['sections'][number]['rows'][number] = { id: `fact-${index}`, label, unit, condition, values: [] };
    row.values = values.map((value, model) => {
      const quote = factQuote(models[model], row, value); pages[page - 1].text += quote + '\n';
      return { status: 'known', candidate: { value, source: { sourceId: 'synthetic-brief', page, quote } } };
    });
    return row;
  });
  const thermal = rows([
    ['Faixa de operação', '°C', 'Ambiente 23 °C; 45% UR', ['−27…143', '−36…187', '−44…226']],
    ['Resolução', '°C', 'Indicação digital', ['0,001', '0,002', '0,005']],
    ['Estabilidade', '°C', 'Após 12 min', ['±0,013', '±0,017', '±0,021']],
    ['Uniformidade', '°C', 'Profundidade 40 mm', ['±0,031', '±0,043', '±0,052']],
    ['Identificação', '', 'Preservar zeros à esquerda', ['00017-A', '00024-B', '00127-C']],
    ['Descrição', '', 'Configuração original', ['Referência interna\n4 fios', 'Referência interna\n3 fios', 'Referência externa\n4 fios']],
    ['Compatibilidade', '', 'Vazio significa sem opção', ['Sim', 'Sim', '']],
    ['Dimensões', 'mm', 'Informação ausente na fonte', ['210 × 320', '220 × 340', '230 × 360']],
  ], 1);
  const absent = thermal[7].values[2];
  if (absent.status === 'known') pages[0].text = pages[0].text.replace(absent.candidate.source.quote + '\n', '');
  thermal[7].values[2] = { status: 'missing', reason: 'O documento de origem não informa as dimensões deste modelo.' };
  const electrical = rows([
    ['Corrente', 'mA', 'Carga ≤ 250 Ω', ['4…20', '0…24', '−2…25']],
    ['Resolução de corrente', 'μA', 'Leitura em 4 fios', ['0,001', '0,002', '0,004']],
    ['Exatidão de corrente', '%', '23 °C; após 10 min', ['±0,0100', '±0,0120', '±0,0140']],
    ['Resistência', 'Ω', '4 fios', ['0…410', '0…820', '0…1240']],
    ['Tensão', 'V', 'Separador local preservado', ['1.234,56', '1,234.56', '0,0001']],
    ['Pressão relativa', 'kPa', 'Condição nominal', ['0…710', '0…930', '0…1240']],
  ], 2);
  const original = electrical[2].values[1];
  if (original.status !== 'known') throw new Error('Fixture invariant');
  const second = { value: '±0,0130', source: { sourceId: 'synthetic-revision', page: 1, quote: factQuote(models[1], electrical[2], '±0,0130') } };
  electrical[2].values[1] = { status: 'conflict', candidates: [original.candidate, second] };
  const revisionPages = [{ number: 1, text: second.source.quote }];
  return {
    version: 1, kind: 'original-synthetic-specifications', title: 'Família TX · Especificações comparativas', models,
    sources: [
      { id: 'synthetic-brief', name: 'Especificações originais de demonstração', revision: '1', kind: 'synthetic', pages, sha256: await sha256(sourcePayload(pages)) },
      { id: 'synthetic-revision', name: 'Revisão sintética com divergência', revision: '2', kind: 'synthetic', pages: revisionPages, sha256: await sha256(sourcePayload(revisionPages)) },
    ],
    sections: [{ id: 'thermal', title: 'Características térmicas', rows: thermal }, { id: 'electrical', title: 'Entradas e faixas elétricas', rows: electrical }],
  };
}
