import { createSyntheticSpecifications } from './fixture';
import { factQuote, sourcePayload, type TechnicalInput } from './contracts';
import { sha256 } from '../asset/integrity';

/** Original synthetic six-variant stress input, structurally based on the
 *  six-variant industrial pressure comparison challenge. No vendor facts. */
export async function createSixModelSyntheticSpecifications(): Promise<TechnicalInput> {
  const input = await createSyntheticSpecifications();
  const newModels = ['TX-104', 'TX-125', 'TX-146'];
  const primary = input.sources.find(source => source.id === 'synthetic-brief')!;
  for (const [sectionIndex, section] of input.sections.entries()) {
    const sourcePage = primary.pages[sectionIndex];
    for (const row of section.rows) {
      for (let i = 0; i < newModels.length; i++) {
        const value = row.values[0].status === 'known'
          ? row.values[0].candidate.value : 'Não informado';
        const quote = factQuote(newModels[i], row, value);
        sourcePage.text += quote + '\n';
        row.values.push({ status: 'known', candidate: {
          value, source: { sourceId: primary.id, page: sourcePage.number, quote },
        } });
      }
    }
  }
  input.models = [...input.models, ...newModels];
  primary.sha256 = await sha256(sourcePayload(primary.pages));
  return input;
}
