import { Product } from '../../src/domain/product.schema';
import { Catalog } from '../../src/domain/catalog.schema';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-mock-1',
    code: 'PRESYS-PCON-Y18',
    family: 'Calibradores de Pressão',
    model: 'PCON-Y18',
    description: 'Calibrador industrial de alta exatidão para laboratório e campo.',
    specs: {
      range: '0 a 70 bar',
      unit: 'bar',
      accuracy: '0.025% FE',
      output: '4-20 mA HART',
      powerSupply: '24 Vdc',
      processConnection: '1/8 NPT',
      protectionDegree: 'IP65',
      customSpecs: {}
    },
    imageUrl: 'https://mock.local/pcon-y18.png',
    version: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  },
  {
    id: 'prod-mock-2',
    code: 'PRESYS-TA-650P',
    family: 'Calibradores de Temperatura',
    model: 'TA-650P',
    description: 'Bloco seco de temperatura até 650°C.',
    specs: {
      range: 'Ambiente a 650°C',
      unit: '°C',
      accuracy: '±0.1°C',
      output: 'USB / RS-485',
      powerSupply: '220 Vac',
      processConnection: 'Inserto intercambiável',
      protectionDegree: 'IP54',
      customSpecs: {}
    },
    imageUrl: 'https://mock.local/ta-650p.png',
    version: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z'
  }
];

export const MOCK_CATALOG: Catalog = {
  id: 'cat-mock-001',
  title: 'Catálogo de Teste Mock',
  subtitle: 'Especificações Técnicas Isoladas',
  version: 1,
  themeId: 'default-technical',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  pages: [
    {
      id: 'page-mock-1',
      pageNumber: 1,
      pageType: 'technical',
      title: 'Página de Teste',
      blocks: [
        {
          id: 'block-mock-1',
          type: 'text',
          title: 'Título de Teste',
          textContent: 'Conteúdo de teste para validação isolada.'
        }
      ]
    }
  ]
};
