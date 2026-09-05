import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LibraryV2Container } from '../../src/components/library-v2/LibraryV2Container';

let mockStoreState: Record<string, any>;

vi.mock('../../src/stores/useLibraryStore', () => ({
  useLibraryStore: () => mockStoreState
}));

const emptyPressureProduct = {
  id: 'prod-pressure-empty',
  code: 'PRESS-016',
  model: 'PRESS-016',
  family: 'Pressure',
  description: 'Transmissor de pressão',
  specs: {
    range: '',
    unit: '',
    accuracy: '',
    output: '',
    powerSupply: '',
    processConnection: '',
    protectionDegree: '',
    customSpecs: {}
  }
};

const oneValuePressureProduct = {
  ...emptyPressureProduct,
  id: 'prod-pressure-one-value',
  specs: {
    ...emptyPressureProduct.specs,
    range: '0 a 16 bar'
  }
};

const pressureFamily = {
  id: 'fam-pressure',
  name: 'Pressure',
  slug: 'pressure',
  description: 'Transmissores de pressão'
};

const fallbackColumns = [
  { key: 'code', label: 'Código' },
  { key: 'model', label: 'Modelo' },
  { key: 'range', label: 'Faixa de Medição' },
  { key: 'unit', label: 'Unidade' },
  { key: 'accuracy', label: 'Exatidão' },
  { key: 'output', label: 'Sinal de Saída' },
  { key: 'processConnection', label: 'Conexão de Processo' }
];

const forbiddenTechnicalValues = [
  '-25 °C a 155 °C',
  '± 0,05 °C',
  '± 0,1 °C',
  '115 / 230 Vac',
  'RS-232 / USB',
  'Insert 6 furos',
  'IP-54'
];

const forbiddenAuthorityClaims = [
  'Dado PIM',
  'Vinculada ao Produto',
  'Oficial',
  'Resolvido Oficialmente',
  'Especificações Canônicas da Família',
  'Estrutura Canônica',
  'Nenhum Conflito Ativo no Momento',
  'Nenhuma divergência ativa',
  'Herdado da Família',
  'Herdada da Família',
  'Exceção do Modelo (Override)',
  'metrology.'
];

const sectionLabels = [
  'Visão Geral',
  'Informações Técnicas',
  'Tabelas Técnicas',
  'Documentos',
  'Fontes & Evidências',
  'Conflitos / Revisões',
  'Organização',
  'Avançado'
];

const createStoreState = (product = emptyPressureProduct) => ({
  products: [product],
  families: [pressureFamily],
  selectedFamily: 'Pressure',
  setSelectedFamily: vi.fn(),
  getColumnsForFamily: vi.fn().mockReturnValue([]),
  addProduct: vi.fn(),
  syncStatus: undefined,
  workspaceSource: undefined,
  dataProvenance: undefined
});

const operationalSurfaceText = (container: HTMLElement) => {
  const sidebar = container.querySelector('aside')?.textContent || '';
  const main = container.querySelector('main')?.textContent || '';
  return `${sidebar} ${main}`;
};

const expectNoFabrication = (container: HTMLElement) => {
  const text = operationalSurfaceText(container);
  [...forbiddenTechnicalValues, ...forbiddenAuthorityClaims].forEach((forbidden) => {
    expect(text).not.toContain(forbidden);
  });
};

beforeEach(() => {
  mockStoreState = createStoreState();
});

describe('RR004C containment — AUD-003', () => {
  it('normalized empty Pressure has zero technical facts across all eight operational sections', () => {
    const { container } = render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const technicalNav = screen.getByText('Informações Técnicas').closest('button');
    expect(technicalNav?.textContent).toContain('0');

    for (const label of sectionLabels) {
      if (label !== 'Visão Geral') fireEvent.click(screen.getByText(label));
      expectNoFabrication(container);
    }
  });

  it('preserves one real legacy Pressure value verbatim and counts exactly one fact without classification', () => {
    mockStoreState = createStoreState(oneValuePressureProduct);
    const { container } = render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    const technicalNav = screen.getByText('Informações Técnicas').closest('button');
    expect(technicalNav?.textContent).toContain('1');

    fireEvent.click(screen.getByText('Abrir Dados'));

    expect(screen.getAllByText('0 a 16 bar')).toHaveLength(1);
    expect(screen.getByText('1 fatos carregados')).toBeDefined();
    expectNoFabrication(container);
  });

  it('renders conflict state as not audited when conflict authority is unavailable', () => {
    const { container } = render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    fireEvent.click(screen.getByText('Conflitos / Revisões'));

    expect(screen.getByText('Conflitos não auditados')).toBeDefined();
    expect(operationalSurfaceText(container)).not.toContain('Nenhum Conflito Ativo no Momento');
    expect(operationalSurfaceText(container)).not.toContain('Resolvido Oficialmente');
  });

  it('does not bind synthetic documents, evidence, modules, or decision history to Pressure', () => {
    const { container } = render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);

    for (const label of ['Documentos', 'Fontes & Evidências', 'Conflitos / Revisões', 'Organização']) {
      fireEvent.click(screen.getByText(label));
      const text = operationalSurfaceText(container);
      expect(text).not.toContain('Manual de Instruções Série TA-N');
      expect(text).not.toContain('Eng. Carlos Eduardo');
      expect(text).not.toContain('metrology.specs');
      expect(text).not.toContain('EXEMPLO DIDÁTICO');
    }
  });

  it('contains DEFAULT_FALLBACK_COLUMNS at the V2 consumer in offline/no-family state', () => {
    mockStoreState = {
      ...createStoreState(),
      families: [],
      syncStatus: 'offline',
      getColumnsForFamily: vi.fn().mockReturnValue(fallbackColumns)
    };

    const { container } = render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    fireEvent.click(screen.getByText('Avançado'));

    expect(screen.getByText('Esquema técnico não carregado')).toBeDefined();
    const text = operationalSurfaceText(container);
    for (const column of fallbackColumns.slice(2)) {
      expect(text).not.toContain(column.label);
      expect(text).not.toContain(column.key);
    }
  });

  it('keeps missing sync/source/provenance diagnostics neutral', () => {
    const { container } = render(<LibraryV2Container onSwitchToClassic={vi.fn()} />);
    fireEvent.click(screen.getByText('Avançado'));

    const text = operationalSurfaceText(container);
    expect(text).toContain('Desconhecido');
    expect(text).toContain('Não carregado');
    expect(text).not.toContain('synced');
    expect(text).not.toContain('offline');
    expect(text).not.toContain('demo_seed');
  });
});
