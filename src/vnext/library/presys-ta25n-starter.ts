import { parseCanonicalDocument, createStaticPageTemplateRegistry, type PageTemplateRegistry } from '@/vnext/application';
import { objectInstantiationSeedFromObject } from '@/vnext/application/document';
import { plainRichText, type AssetRef, type CatalogDocument, type Page, type TableObject, type TextObject } from '@/vnext/domain';
import type { CatalogStarterDefinition } from './starter-registry';

// Frozen values are mirrored in the source artifact and checked for exact agreement by C1-03.
const contract = {
  "starterId": "presys-ta25n-a4",
  "displayName": "PRESYS · TA-25N — produto e especificações",
  "facts": {
    "brand": {
      "label": "Marca",
      "value": "PRESYS"
    },
    "product": {
      "label": "Produto",
      "value": "Banho térmico tipo bloco seco"
    },
    "model": {
      "label": "Modelo",
      "value": "TA-25N"
    },
    "family": {
      "label": "Família",
      "value": "Linha TA / Industrial Avançada"
    },
    "description": {
      "label": "Descrição",
      "value": "Calibrador de bloco seco com referência interna e leitura de sinais de sensores"
    },
    "application": {
      "label": "Aplicação",
      "value": "Calibração de termopares, termorresistências e termostatos"
    },
    "functions": {
      "label": "Funções / entradas",
      "value": "TCs, RTDs, mA, mV, ohms e termostatos"
    },
    "accuracy": {
      "label": "Exatidão da referência interna",
      "value": "±0,1 °C"
    },
    "resolution": {
      "label": "Resolução",
      "value": "0,01 °C"
    },
    "stability": {
      "label": "Estabilidade",
      "value": "±0,02 °C"
    },
    "axial": {
      "label": "Uniformidade axial",
      "value": "±0,05 °C em 40 mm"
    },
    "radial": {
      "label": "Uniformidade radial",
      "value": "±0,01 °C"
    },
    "power": {
      "label": "Potência elétrica",
      "value": "200 W"
    },
    "well": {
      "label": "Poço",
      "value": "Ø25,4 mm × 124 mm"
    },
    "weight": {
      "label": "Peso",
      "value": "10,5 kg"
    },
    "auxiliarySupply": {
      "label": "Fonte auxiliar",
      "value": "24 Vcc regulada para transmissores"
    },
    "currentRange": {
      "label": "Entrada de corrente",
      "value": "−1 a 24,5 mA"
    },
    "interfaces": {
      "label": "Interfaces",
      "value": "Ethernet e USB"
    },
    "hart": {
      "label": "HART",
      "value": "Opcional, conforme configuração"
    },
    "display": {
      "label": "Display",
      "value": "Touchscreen de 5,7″"
    },
    "conformity": {
      "label": "Declaração do fabricante",
      "value": "LVD 2014/35/EU; EMC 2014/30/EU; RoHS 2011/65/EU"
    },
    "standards": {
      "label": "Normas declaradas pelo fabricante",
      "value": "EN 61010-1:2010+A1:2019; EN IEC 61010-2-010:2020; EN IEC 61326-1:2021"
    },
    "temperatureRange": {
      "label": "Faixa de temperatura",
      "value": "A COMPLETAR"
    },
    "dimensions": {
      "label": "Dimensões",
      "value": "A COMPLETAR"
    },
    "mainSupply": {
      "label": "Alimentação principal",
      "value": "A COMPLETAR"
    },
    "currentPrecision": {
      "label": "Exatidão da entrada de corrente",
      "value": "A COMPLETAR"
    },
    "environment": {
      "label": "Condições ambientais",
      "value": "A COMPLETAR"
    },
    "heatingCooling": {
      "label": "Aquecimento / resfriamento",
      "value": "A COMPLETAR"
    }
  },
  "image": {
    "sha256": "e6c377af5ce42ce0604076d1919144f823efdd345e2b2ac11f40efe003174486",
    "mime": "image/png",
    "widthPx": 720,
    "heightPx": 482,
    "byteLength": 229530,
    "packagedPath": "public/assets/presys/ta-25n-starter-v1.png",
    "runtimePackagedPath": "/assets/presys/ta-25n-starter-v1.png",
    "name": "PRESYS TA-25N — imagem oficial",
    "alt": "Banho térmico tipo bloco seco PRESYS TA-25N"
  },
  "assetManifestSemantics": {
    "seedAssetId": "00000000-0000-4000-8000-000000000025"
  }
} as const;
export const PRESYS_FACTS = contract.facts;

export const PRESYS_STARTER_ID = contract.starterId;
export const PRESYS_PRESENTATION_PAGE_ID = 'presys-ta25n-presentation-a4';
export const PRESYS_SPECIFICATIONS_PAGE_ID = 'presys-ta25n-specifications-a4';
export const PRESYS_IMAGE_MANIFEST = {
  seedAssetId: contract.assetManifestSemantics.seedAssetId,
  ...contract.image,
  mime: 'image/png' as const,
  version: '1',
};
const safeArea = { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 };
type FactKey = keyof typeof contract.facts;
const fact = (key: FactKey) => contract.facts[key].value;

function text(id: string, value: string, y: number, height: number, size = 10, bold = false): TextObject {
  return { id, type: 'text', zIndex: 0, frame: { xMm: 12, yMm: y, widthMm: 186, heightMm: height },
    text: plainRichText(`${id}-rich`, value),
    style: { fontFamily: 'Noto Sans', fontSizePt: size, lineHeight: 1.25, fontWeight: bold ? 700 : 400, color: bold ? '#003366' : '#172033' } };
}

function table(id: string, keys: readonly FactKey[], y: number, height: number): TableObject {
  return { id: `${id}-object`, type: 'table', zIndex: 1,
    frame: { xMm: 12, yMm: y, widthMm: 186, heightMm: height },
    table: { id,
      columns: [
        { id: `${id}-label`, width: { mode: 'fixed', mm: 68 }, minMm: 30 },
        { id: `${id}-value`, width: { mode: 'flex', weight: 1 }, minMm: 40 },
      ],
      rows: keys.map(key => ({ id: `${id}-${key}-row`, role: 'body', heightPolicy: { mode: 'AUTO' } })),
      cells: keys.flatMap(key => ['label', 'value'].map(column => ({
        id: `${id}-${key}-${column}`, rowId: `${id}-${key}-row`, columnId: `${id}-${column}`,
        content: { type: 'richText' as const, value: plainRichText(`${id}-${key}-${column}-rich`, column === 'label' ? contract.facts[key].label : fact(key)) },
        ...(column === 'label' ? { style: { fontWeight: 700 as const, background: '#F2F6FA' } } : {}),
      }))),
      style: { base: { fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.2, color: '#172033', paddingMm: { top: 1.5, right: 2, bottom: 1.5, left: 2 }, borders: { bottom: { pattern: 'solid', thicknessPt: 0.5, color: '#D9E2EC' } } }, rowRoles: {}, annotation: { fontSizePt: 8 }, annotationGapMm: 1 },
      annotations: [], legend: [],
    } };
}

/** Source graph only. Its seed AssetRef MUST be replaced by durable preparation before CREATE. */
export function createPresysStarterDocument(asset: AssetRef): CatalogDocument {
  const pages: Page[] = [
    { id: PRESYS_PRESENTATION_PAGE_ID, widthMm: 210, heightMm: 297, safeArea, objects: [
      text('presys-brand', fact('brand'), 12, 12, 18, true),
      text('presys-model', 'TA-25N · Banho térmico tipo bloco seco', 29, 13, 18, true),
      text('presys-description', fact('description'), 47, 17, 11),
      { id: 'presys-product-image', type: 'image', zIndex: 0, frame: { xMm: 42, yMm: 68, widthMm: 126, heightMm: 84.35 }, assetId: asset.id, fit: 'contain' },
      table('presys-summary', ['family', 'application', 'functions', 'interfaces', 'auxiliarySupply', 'hart', 'display'], 161, 83),
      text('presys-content-note', 'Conteúdo parcialmente preenchido. Confira a configuração do produto e complete os campos pendentes antes de publicar.', 258, 18, 8),
    ] },
    { id: PRESYS_SPECIFICATIONS_PAGE_ID, widthMm: 210, heightMm: 297, safeArea, objects: [
      text('presys-spec-title', 'TA-25N · Especificações e condições', 12, 14, 18, true),
      table('presys-thermal', ['temperatureRange', 'accuracy', 'resolution', 'stability', 'axial', 'radial', 'well', 'weight', 'dimensions'], 34, 90),
      text('presys-conditions-title', 'Entradas, alimentação e condições', 133, 10, 12, true),
      table('presys-conditions', ['currentRange', 'currentPrecision', 'power', 'mainSupply', 'environment', 'heatingCooling'], 149, 65),
      text('presys-conformity', `Declaração do fabricante: ${fact('conformity')}. Normas declaradas: ${fact('standards')}. Não constitui certificação independente.`, 225, 30, 8),
      text('presys-source-note', 'Fontes PRESYS: manual EM0291-04, p. 2–3; folder TA, p. 2 e 9; página oficial; declaração CE de 01/01/2026. Dados divergentes: A COMPLETAR.', 264, 17, 8),
    ] },
  ];
  return parseCanonicalDocument({ schemaVersion: 1, id: 'presys-ta25n-starter-source', title: contract.displayName, locale: 'pt-BR',
    style: { fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }, { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'normal' }],
      defaultText: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.25, fontWeight: 400, color: '#172033' }, palette: ['#003366', '#0072CE', '#172033', '#FFFFFF', '#F2F6FA', '#D9E2EC'] },
    pages, assets: [asset] });
}

export const PRESYS_STARTER: CatalogStarterDefinition = {
  starterId: PRESYS_STARTER_ID, revision: 1, label: contract.displayName,
  category: 'PRESYS', description: 'Duas páginas A4 editáveis, com imagem oficial e campos pendentes explícitos.',
  requiredAssets: [PRESYS_IMAGE_MANIFEST],
  sourceDocument: createPresysStarterDocument({ id: PRESYS_IMAGE_MANIFEST.seedAssetId, version: '1', sha256: contract.image.sha256,
    mime: 'image/png', widthPx: 720, heightPx: 482, name: contract.image.name, alt: contract.image.alt }),
};

/** Session-scoped registry: only prepared metadata may be installed in the production templates. */
export function createPresysPageTemplateRegistry(): PageTemplateRegistry & { install(asset: AssetRef): void } {
  let registry = createStaticPageTemplateRegistry([]);
  return { get: id => registry.get(id), list: () => registry.list(), install: asset => {
    const doc = createPresysStarterDocument(asset);
    registry = createStaticPageTemplateRegistry(doc.pages.map((page, index) => ({ id: page.id,
      label: index === 0 ? 'TA-25N · Apresentação' : 'TA-25N · Especificações', safeArea,
      objects: page.objects.map(objectInstantiationSeedFromObject) })));
  } };
}
