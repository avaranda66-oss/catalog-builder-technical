import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDocument, validateProduct, validateProposal } from '../lib/domain/contracts.ts'

const timestamp = '2026-08-31T12:00:00.000Z'

function product(overrides = {}) {
  return {
    id: 'product-1',
    catalog_id: 'catalog-1',
    sku: 'PCON-Y17',
    name: 'Controlador de Bancada',
    family: 'PCON',
    status: 'draft',
    sort_order: 0,
    data: { marketing: { title: 'Controlador de Bancada' } },
    version: 1,
    updated_by: null,
    updated_at: timestamp,
    created_at: timestamp,
    ...overrides,
  }
}

function document(overrides = {}) {
  return {
    id: 'catalog-1',
    name: 'Catálogo PCON',
    locale: 'pt-BR',
    status: 'draft',
    template_key: 'presys-premium',
    brand: { companyName: 'Presys Instrumentos' },
    version: 1,
    pages: [{
      id: 'page-1',
      title: 'Capa e Visão Geral',
      sort_order: 0,
      visible: true,
      sections: [{
        id: 'section-1',
        type: 'hero_banner',
        title: 'Capa e Destaques',
        config: {},
        content: null,
        sort_order: 0,
        visible: true,
      }],
    }],
    updated_by: null,
    updated_at: timestamp,
    created_at: timestamp,
    ...overrides,
  }
}

test('valida um produto técnico completo', () => {
  const result = validateProduct(product())
  assert.equal(result.success, true)
  assert.equal(result.data?.sku, 'PCON-Y17')
})

test('expõe o caminho do campo quando o produto é inválido', () => {
  const result = validateProduct(product({ sku: '' }))
  assert.equal(result.success, false)
  assert.ok(result.errors?.some((error) => error.startsWith('sku:')))
})

test('rejeita propriedades desconhecidas no contrato de produto', () => {
  const result = validateProduct(product({ internalSecret: 'should-not-persist' }))
  assert.equal(result.success, false)
  assert.ok(result.errors?.some((error) => error.includes('Unrecognized key')))
})

test('valida páginas e blocos do documento', () => {
  const result = validateDocument(document())
  assert.equal(result.success, true)
  assert.equal(result.data?.pages[0]?.sections[0]?.type, 'hero_banner')
})

test('rejeita um bloco que não pertence ao baseline', () => {
  const result = validateDocument(document({
    pages: [{
      ...document().pages[0],
      sections: [{ ...document().pages[0].sections[0], type: 'unknown_block' }],
    }],
  }))
  assert.equal(result.success, false)
  assert.ok(result.errors?.some((error) => error.includes('pages.0.sections.0.type')))
})

test('proposta exige mudança e começa sem aceite', () => {
  const result = validateProposal({
    id: 'proposal-1',
    source: 'import',
    summary: 'Atualização de especificação',
    product_id: 'product-1',
    catalog_id: 'catalog-1',
    changes: [{ path: 'data.pressure_specs.control_range', fieldLabel: 'Faixa', oldValue: null, newValue: '0–30 bar' }],
    created_by: 'user-1',
    created_at: timestamp,
  })
  assert.equal(result.success, true)
  assert.equal(result.data?.changes[0]?.accepted, false)
})

test('proposta vazia falha antes de chegar ao adaptador', () => {
  const result = validateProposal({
    id: 'proposal-1',
    source: 'ai',
    summary: 'Sem mudanças',
    product_id: 'product-1',
    catalog_id: 'catalog-1',
    changes: [],
    created_by: null,
    created_at: timestamp,
  })
  assert.equal(result.success, false)
  assert.ok(result.errors?.some((error) => error.startsWith('changes:')))
})

