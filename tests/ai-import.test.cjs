const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { deflateSync } = require('node:zlib')
const { installTsHook } = require('./helpers/load-ts.cjs')

let generate = async () => { throw new Error('No mocked response') }
let authenticated = true
let userId = 'test-user'
installTsHook({ mockModules: {
  '@google/genai': { GoogleGenAI: class { models = { generateContent: (...args) => generate(...args) } } },
  [path.resolve(__dirname, '../lib/auth/server.ts')]: {
    requireAuthenticatedUser: async () => {
      if (!authenticated) throw Object.assign(new Error('Sessão obrigatória.'), { status: 401 })
      return { user: { id: userId, role: 'editor' } }
    },
  },
} })

const { parseExcelFile } = require('../features/import/excel-parser.ts')
const { extractPdfDocument } = require('../lib/pdf/text-extractor.ts')
const { parsePdfProductText } = require('../lib/import/pdf-product.ts')
const { assertPreservedTechnicalText, readTextPath } = require('../lib/ai/contracts.ts')
const { getLocalizedProduct } = require('../lib/ai/translations.ts')
const { enforceRateLimit, readLimitedBody } = require('../lib/ai/server.ts')
const chat = require('../app/api/ai/chat/route.ts')
const translate = require('../app/api/ai/translate/route.ts')
const pdf = require('../app/api/ai/import-pdf/route.ts')
const product = () => ({ id: 'product-A', sku: 'A', name: 'Produto A', family: 'Instrumentos', version: 1, data: { marketing: { title: 'Sensor', overview: 'Faixa -25 a 150 °C; resolução 0,01 °C.' }, specs: [{ param: 'Faixa', value: '-25 a 150 °C' }] } })
const jsonRequest = (endpoint, body) => new Request(`http://localhost/api/ai/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const pdfBytes = (content, compressed = false) => {
  const stream = compressed ? deflateSync(Buffer.from(content, 'latin1')) : Buffer.from(content, 'latin1')
  return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Length ${stream.length}${compressed ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), stream, Buffer.from('\nendstream\nendobj\n%%EOF\n')])
}
const arrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

test('PDF invalid/scanned/unsupported input never invents a product', async () => {
  assert.throws(() => extractPdfDocument(Buffer.from('abc')), /inválido/)
  assert.throws(() => extractPdfDocument(pdfBytes('q 1 0 0 1 0 0 cm Q')), /Nenhum texto/)
  const form = new FormData(); form.append('file', new File(['abc'], 'disjuntor.pdf'))
  const response = await pdf.POST(new Request('http://localhost/api/ai/import-pdf', { method: 'POST', body: form }))
  assert.equal(response.status, 422)
  assert.equal((await response.json()).product, undefined)
})

test('PDF literal extraction preserves signed numbers, escaped parentheses and text order', () => {
  const result = extractPdfDocument(pdfBytes('BT (Range: -25 to 150 C) Tj [(Accuracy: ) (0.01 % FS)] TJ (Power: 100 \\(nominal\\)) Tj ET', true))
  assert.match(result.text, /Range: -25 to 150 C/)
  assert.match(result.text, /Accuracy: 0.01 % FS/)
  assert.match(result.text, /Power: 100 \(nominal\)/)
  const candidate = parsePdfProductText(result.text, 'source.pdf')
  assert.equal(candidate.data.specs[0].value, '-25 to 150 C')
  assert.equal(candidate.sku, '')
  assert.deepEqual(candidate.data.electrical, [])
  assert.equal(candidate.data.source.fields['specs.0.value'].page, null)
  assert.equal(candidate.data.source.fields['specs.0.value'].quote, 'Range: -25 to 150 C')
})

test('PDF decompression has a strict output bound', () => {
  assert.throws(() => extractPdfDocument(pdfBytes('A'.repeat(4 * 1024 * 1024 + 1), true)), /descompressão/)
})

test('CSV uppercase aliases, real values and unmapped metadata are preserved', async () => {
  const csv = Buffer.from('MODELO,NOME,FAIXA,EXATIDÃO,ALIMENTAÇÃO,PESO,CATEGORIA,COLUNA EXTRA\nDJ-01,Disjuntor,-25 a 150 °C,1%,230 V,2 kg,Proteção,valor original')
  const result = await parseExcelFile(arrayBuffer(csv), 'catalog', { fileName: 'produtos.csv' })
  assert.deepEqual(result.errors, [])
  const p = result.products[0]
  assert.equal(p.sku, 'DJ-01')
  assert.equal(p.name, 'Disjuntor')
  assert.equal(p.data.specs[0].value, '-25 a 150 °C')
  assert.equal(p.data.general[0].desc, '230 V')
  assert.deepEqual(p.data.electrical, [])
  assert.equal(p.data.metadata['COLUNA EXTRA'], 'valor original')
  assert.equal(p.data.source.fields['specs.0.value'].row, 2)
})

test('XLSX goes through ExcelJS and rejects duplicates instead of replacing products', async () => {
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('Produtos')
  sheet.addRows([['SKU', 'NOME'], ['DJ-01', 'Existente'], ['DJ-02', 'Novo'], ['DJ-02', 'Duplicado']])
  const bytes = await wb.xlsx.writeBuffer()
  const result = await parseExcelFile(arrayBuffer(bytes), 'catalog', { fileName: 'produtos.xlsx', existingSkus: ['DJ-01'] })
  assert.deepEqual(result.products.map(p => p.sku), ['DJ-02'])
  assert.equal(result.errors.length, 2)
  assert.equal(result.products[0].family, '')
  assert.deepEqual(result.products[0].data.specs, [])
})

test('CSV mapping requires SKU/name and never generates identifiers', async () => {
  const csv = arrayBuffer(Buffer.from('Identificador,Nome comercial\nDJ-01,Disjuntor'))
  const invalid = await parseExcelFile(csv, 'catalog', { fileName: 'custom.csv' })
  assert.equal(invalid.products.length, 0)
  assert.match(invalid.errors[0], /Mapeie/)
  const mapped = await parseExcelFile(csv, 'catalog', { fileName: 'custom.csv', columnMapping: { Identificador: 'sku', 'Nome comercial': 'name' } })
  assert.equal(mapped.products[0].sku, 'DJ-01')
})

test('model text cannot change signs, units or create ISO/HART claims', () => {
  assert.throws(() => assertPreservedTechnicalText('-25 °C', '25 °C'), /valores/)
  assert.throws(() => assertPreservedTechnicalText('10 mA', '10 V'), /valores/)
  assert.throws(() => assertPreservedTechnicalText('Produto', 'Produto HART'), /certificação/)
  assert.throws(() => assertPreservedTechnicalText('Produto', 'Produto ISO 17025'), /valores/)
  assert.doesNotThrow(() => assertPreservedTechnicalText('Faixa -25 a 150 °C', 'Range -25 to 150 °C'))
  assert.equal(readTextPath({}, '__proto__.polluted'), undefined)
})

test('AI routes require auth and no provider returns unavailable, not fake success', async () => {
  authenticated = false
  assert.equal((await chat.POST(jsonRequest('chat', { prompt: 'Revisar', product: product() }))).status, 401)
  authenticated = true
  delete process.env.GEMINI_API_KEY
  userId = 'no-provider'
  const response = await translate.POST(jsonRequest('translate', { product: product(), targetLanguage: 'es' }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).success, undefined)
})

test('chat proposals bind source ID/version, default to explicit rejection and reject arbitrary paths', async () => {
  process.env.GEMINI_API_KEY = 'test-placeholder-not-a-real-key'
  userId = 'chat-contract'
  generate = async () => ({ text: JSON.stringify({ summary: 'Título', changes: [{ path: 'marketing.title', newValue: 'Sensor técnico', reason: 'Clareza' }] }) })
  const response = await chat.POST(jsonRequest('chat', { prompt: 'Revisar', product: product() }))
  assert.equal(response.status, 200)
  const patch = (await response.json()).proposedPatch
  assert.equal(patch.productId, 'product-A'); assert.equal(patch.baseVersion, 1)
  assert.equal(patch.changes[0].accepted, false); assert.equal(patch.changes[0].oldValue, 'Sensor')
  generate = async () => ({ text: JSON.stringify({ summary: 'Unsafe', changes: [{ path: '__proto__.unsafe', newValue: '1', reason: 'ignored' }] }) })
  assert.equal((await chat.POST(jsonRequest('chat', { prompt: 'Revisar', product: product() }))).status, 422)
})

test('translation is a separate draft; changed technical values or missing fields are rejected', async () => {
  userId = 'translation-contract'
  process.env.GEMINI_API_KEY = 'test-placeholder-not-a-real-key'
  const source = product(); const original = JSON.stringify(source)
  const fields = { 'marketing.title': 'Sensor', 'marketing.overview': 'Range -25 to 150 °C; resolution 0,01 °C.', 'specs.0.param': 'Range' }
  generate = async () => ({ text: JSON.stringify({ fields, pageTitles: [] }) })
  const response = await translate.POST(jsonRequest('translate', { product: source, targetLanguage: 'en' }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.translation.status, 'draft'); assert.equal(result.translatedProduct, undefined)
  assert.equal(JSON.stringify(source), original)
  const localized = getLocalizedProduct({ ...source, data: { ...source.data, translations: { en: result.translation } } }, 'en')
  assert.equal(localized.data.marketing.overview, fields['marketing.overview'])
  assert.deepEqual(localized.data.specs[0].value, source.data.specs[0].value)
  const changed = { ...localized, data: { ...source.data, marketing: { ...source.data.marketing, overview: 'Fonte revisada' }, translations: { en: result.translation } } }
  assert.equal(getLocalizedProduct(changed, 'en').data.marketing.overview, 'Fonte revisada')
  generate = async () => ({ text: JSON.stringify({ fields: { ...fields, 'marketing.overview': 'Range 25 to 150 °C; resolution 0,01 °C.' }, pageTitles: [] }) })
  assert.equal((await translate.POST(jsonRequest('translate', { product: source, targetLanguage: 'en' }))).status, 422)
  generate = async () => ({ text: JSON.stringify({ fields: {}, pageTitles: [] }) })
  assert.equal((await translate.POST(jsonRequest('translate', { product: source, targetLanguage: 'en' }))).status, 422)
  delete process.env.GEMINI_API_KEY
})

test('request bytes and per-user request count are bounded', async () => {
  await assert.rejects(readLimitedBody(new Request('http://localhost', { method: 'POST', body: '12345' }), 4), /limite/)
  for (let index = 0; index < 10; index++) enforceRateLimit('limit-user', 'test', 1000)
  assert.throws(() => enforceRateLimit('limit-user', 'test', 1000), /Limite/)
  assert.doesNotThrow(() => enforceRateLimit('limit-user', 'test', 61_001))
})
