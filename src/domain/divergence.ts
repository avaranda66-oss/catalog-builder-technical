import { Product } from './product.schema';
import { CatalogTableRow } from './catalog.schema';

export interface FieldDivergence {
  fieldKey: string;
  fieldLabel: string;
  localValue: string;
  libraryValue: string;
  hasDivergence: boolean;
}

export const TECHNICAL_FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  model: 'Modelo',
  family: 'Família',
  range: 'Faixa de Medição',
  unit: 'Unidade',
  accuracy: 'Precisão',
  output: 'Sinal de Saída',
  powerSupply: 'Alimentação',
  processConnection: 'Conexão de Processo',
  protectionDegree: 'Grau de Proteção',
  maxStaticPressure: 'Pressão Estática Máxima',
  leakageClass: 'Classe de Estanqueidade',
  rtdSupport: 'Tipo de Sensor Suportado'
};

/**
 * Retorna o valor efetivo de um campo na linha do catálogo:
 * se houver override local, retorna o override; senão retorna o valor da biblioteca.
 */
export function getEffectiveValue(
  row: CatalogTableRow,
  libraryProduct: Product | undefined,
  fieldKey: string
): string {
  if (row.localOverrides && row.localOverrides[fieldKey] !== undefined) {
    return row.localOverrides[fieldKey];
  }
  if (!libraryProduct) return '';

  const specs = (libraryProduct.specs || {}) as Record<string, any>;
  const customSpecs = (specs.customSpecs || {}) as Record<string, any>;

  return String((libraryProduct as any)[fieldKey] ?? specs[fieldKey] ?? customSpecs[fieldKey] ?? '');
}

/**
 * Compara uma linha de catálogo contra o produto oficial da biblioteca e retorna divergências.
 */
export function calculateRowDivergences(
  row: CatalogTableRow,
  libraryProduct: Product | undefined
): FieldDivergence[] {
  if (!libraryProduct || !row.localOverrides) return [];

  const divergences: FieldDivergence[] = [];
  const specs = (libraryProduct.specs || {}) as Record<string, any>;
  const customSpecs = (specs.customSpecs || {}) as Record<string, any>;

  for (const [fieldKey, localValue] of Object.entries(row.localOverrides)) {
    if (localValue === undefined || localValue === null) continue;

    const libraryValue = String((libraryProduct as any)[fieldKey] ?? specs[fieldKey] ?? customSpecs[fieldKey] ?? '');

    if (String(localValue).trim() !== libraryValue.trim() && libraryValue.trim() !== '') {
      divergences.push({
        fieldKey,
        fieldLabel: TECHNICAL_FIELD_LABELS[fieldKey] || fieldKey,
        localValue: String(localValue),
        libraryValue,
        hasDivergence: true
      });
    }
  }

  return divergences;
}

/**
 * Verifica se um campo específico possui divergência na linha.
 */
export function getFieldDivergence(
  row: CatalogTableRow,
  libraryProduct: Product | undefined,
  fieldKey: string
): FieldDivergence | null {
  if (!libraryProduct || !row.localOverrides || row.localOverrides[fieldKey] === undefined) {
    return null;
  }

  const specs = (libraryProduct.specs || {}) as Record<string, any>;
  const customSpecs = (specs.customSpecs || {}) as Record<string, any>;
  const localValue = String(row.localOverrides[fieldKey]);
  const libraryValue = String((libraryProduct as any)[fieldKey] ?? specs[fieldKey] ?? customSpecs[fieldKey] ?? '');

  if (localValue.trim() !== libraryValue.trim() && libraryValue.trim() !== '') {
    return {
      fieldKey,
      fieldLabel: TECHNICAL_FIELD_LABELS[fieldKey] || fieldKey,
      localValue,
      libraryValue,
      hasDivergence: true
    };
  }

  return null;
}
