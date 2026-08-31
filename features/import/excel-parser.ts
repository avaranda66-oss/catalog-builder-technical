import Papa from 'papaparse'
import { Product } from '../../lib/types/database'
import { ImportedProductSchema, SourceField } from '../../lib/import/schema'

export const IMPORT_FIELDS = ['sku', 'name', 'family', 'title', 'subtitle', 'overview', 'features', 'range', 'accuracy', 'stability', 'controlTime', 'fluid', 'communication', 'display', 'power', 'weight', 'metadata'] as const
export type ImportField = typeof IMPORT_FIELDS[number]
export interface ExcelImportOptions { fileName?: string; sheetName?: string; columnMapping?: Record<string, ImportField>; existingSkus?: string[] }
export interface ParsedExcelResult {
  sheetNames: string[]; selectedSheet: string; headers: string[]; mapping: Record<string, ImportField>
  products: Partial<Product>[]; warnings: string[]; unmappedColumns: string[]; errors: string[]
}

const aliases: Record<string, ImportField> = {
  SKU: 'sku', MODEL: 'sku', MODELO: 'sku', CODE: 'sku', CODIGO: 'sku',
  NAME: 'name', NOME: 'name', DESCRIPTION: 'name', DESCRICAO: 'name',
  FAMILY: 'family', FAMILIA: 'family', CATEGORY: 'family', CATEGORIA: 'family',
  TITLE: 'title', TITULO: 'title', SUBTITLE: 'subtitle', SUBTITULO: 'subtitle',
  OVERVIEW: 'overview', RESUMO: 'overview', FEATURES: 'features', DESTAQUES: 'features',
  RANGE: 'range', FAIXA: 'range', 'PRESSURE RANGE': 'range', 'FAIXA DE PRESSAO': 'range',
  ACCURACY: 'accuracy', EXATIDAO: 'accuracy', PRECISAO: 'accuracy', STABILITY: 'stability', ESTABILIDADE: 'stability',
  'CONTROL TIME': 'controlTime', 'TEMPO DE CONTROLE': 'controlTime', TEMPO: 'controlTime',
  FLUID: 'fluid', FLUIDO: 'fluid', COMPATIBILIDADE: 'fluid',
  COMMUNICATION: 'communication', COMUNICACAO: 'communication', DISPLAY: 'display',
  POWER: 'power', ALIMENTACAO: 'power', WEIGHT: 'weight', PESO: 'weight',
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ')

/** Inspect ZIP declared expansion before handing the workbook to ExcelJS. */
function validateWorkbookArchive(buffer: ArrayBuffer): void {
  const view = new DataView(buffer)
  let entries = 0
  let expanded = 0
  for (let offset = 0; offset + 46 <= buffer.byteLength; offset++) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue
    entries++
    const size = view.getUint32(offset + 24, true)
    expanded += size
    if (entries > 2000 || size > 10 * 1024 * 1024 || expanded > 40 * 1024 * 1024) throw new Error('Planilha excede os limites de descompressão (40 MB / 2.000 entradas).')
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Planilha criptografada não é suportada.')
    offset += 45 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  if (!entries) throw new Error('Arquivo XLSX inválido. Use .xlsx ou .csv; o formato .xls não é suportado.')
}

export async function parseExcelFile(buffer: ArrayBuffer, catalogId: string, options: ExcelImportOptions = {}): Promise<ParsedExcelResult> {
  if (buffer.byteLength > 5 * 1024 * 1024) throw new Error('Arquivo deve ter no máximo 5 MB.')
  const fileName = (options.fileName || 'planilha.xlsx').slice(0, 255)
  let sheets: Array<{ name: string; rows: string[][] }>
  if (/\.csv$/i.test(fileName)) {
    const parsed = Papa.parse<string[]>(new TextDecoder('utf-8', { fatal: true }).decode(buffer), { skipEmptyLines: 'greedy' })
    if (parsed.errors.some((error) => error.type === 'Quotes')) throw new Error('CSV contém aspas inválidas.')
    sheets = [{ name: 'CSV', rows: parsed.data }]
  } else {
    validateWorkbookArchive(buffer)
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    sheets = workbook.worksheets.map((sheet) => {
      if (sheet.rowCount > 5001 || sheet.columnCount > 200) throw new Error('Limite de 5.000 produtos e 200 colunas por aba.')
      const rows: string[][] = []
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const values: string[] = []
        for (let column = 1; column <= sheet.columnCount; column++) {
          const cell = row.getCell(column)
          if (cell.formula && cell.result === undefined) throw new Error(`Fórmula sem resultado calculado em ${sheet.name}!${cell.address}. Recalcule e salve no Excel.`)
          values.push(cell.text)
        }
        rows.push(values)
      })
      return { name: sheet.name, rows }
    })
  }
  const selected = sheets.find((sheet) => sheet.name === options.sheetName) || sheets.find((sheet) => /Y17|PCON|CONFIG|PROD|BASE/i.test(sheet.name)) || sheets[0]
  const result: ParsedExcelResult = { sheetNames: sheets.map((sheet) => sheet.name), selectedSheet: selected?.name || '', headers: [], mapping: {}, products: [], warnings: [], unmappedColumns: [], errors: [] }
  if (!selected || selected.rows.length < 2) { result.errors.push('A aba selecionada não possui cabeçalho e dados.'); return result }
  if (selected.rows.length > 5001 || selected.rows.some((row) => row.length > 200)) throw new Error('Limite de 5.000 produtos e 200 colunas por aba.')
  result.headers = selected.rows[0].map((header) => header.trim())
  const nonemptyHeaders = result.headers.filter(Boolean)
  if (new Set(nonemptyHeaders.map(normalize)).size !== nonemptyHeaders.length) { result.errors.push('Existem cabeçalhos duplicados. Renomeie as colunas antes de importar.'); return result }
  for (const header of nonemptyHeaders) {
    result.mapping[header] = options.columnMapping?.[header] || aliases[normalize(header)] || 'metadata'
    if (result.mapping[header] === 'metadata') result.unmappedColumns.push(header)
  }
  const targets = Object.values(result.mapping).filter((field) => field !== 'metadata')
  if (new Set(targets).size !== targets.length) { result.errors.push('Duas colunas estão mapeadas para o mesmo campo. Ajuste o mapeamento.'); return result }
  if (!targets.includes('sku') || !targets.includes('name')) { result.errors.push('Mapeie as colunas SKU e Nome para continuar.'); return result }
  const seenSkus = new Set((options.existingSkus || []).map(normalize))
  for (let index = 1; index < selected.rows.length; index++) {
    const row = selected.rows[index]
    if (!row.some((value) => value.trim())) continue
    const unnamedColumn = row.findIndex((value, column) => value.trim() && !result.headers[column])
    if (unnamedColumn >= 0) { result.errors.push(`Linha ${index + 1}: a coluna ${unnamedColumn + 1} possui dados sem cabeçalho; produto não importado.`); continue }
    const values: Partial<Record<ImportField, string>> = {}
    const metadata: Record<string, string> = {}
    const sourceFields: Record<string, SourceField> = {}
    result.headers.forEach((header, column) => {
      if (!header) return
      const value = String(row[column] || '').trim()
      if (!value) return
      const field = result.mapping[header]
      if (field === 'metadata') metadata[header] = value
      else values[field] = value
      sourceFields[field === 'metadata' ? `metadata.${header}` : field] = { document: fileName, page: null, sheet: selected.name, row: index + 1, quote: value, confidence: 'verbatim' }
    })
    const sku = values.sku || ''
    if (!sku || !values.name) { result.errors.push(`Linha ${index + 1}: SKU e Nome são obrigatórios; nenhum valor foi presumido.`); continue }
    if (seenSkus.has(normalize(sku))) { result.errors.push(`Linha ${index + 1}: SKU duplicado (${sku}); produto não importado.`); continue }
    const specs = (['range', 'accuracy', 'stability', 'controlTime', 'fluid'] as const).filter((field) => values[field]).map((field) => ({ param: ({ range: 'Faixa', accuracy: 'Exatidão', stability: 'Estabilidade', controlTime: 'Tempo de Controle', fluid: 'Compatibilidade de Fluido' })[field], value: values[field]! }))
    const general = (['communication', 'display', 'power', 'weight'] as const).filter((field) => values[field]).map((field) => ({ param: ({ communication: 'Comunicação', display: 'Display', power: 'Alimentação', weight: 'Peso' })[field], desc: values[field]! }))
    // Store provenance under the same paths consumed by the editor/renderers.
    for (const field of ['title', 'subtitle', 'overview'] as const) {
      if (sourceFields[field]) { sourceFields[`marketing.${field}`] = sourceFields[field]; delete sourceFields[field] }
    }
    if (!values.title && sourceFields.name) sourceFields['marketing.title'] = sourceFields.name
    ;(['range', 'accuracy', 'stability', 'controlTime', 'fluid'] as const).filter((field) => values[field]).forEach((field, specIndex) => { sourceFields[`specs.${specIndex}.value`] = sourceFields[field]; delete sourceFields[field] })
    ;(['communication', 'display', 'power', 'weight'] as const).filter((field) => values[field]).forEach((field, specIndex) => { sourceFields[`general.${specIndex}.desc`] = sourceFields[field]; delete sourceFields[field] })
    const parsed = ImportedProductSchema.safeParse({ sku, name: values.name, family: values.family || '', data: {
      marketing: { title: values.title || values.name, ...(values.subtitle ? { subtitle: values.subtitle } : {}), ...(values.overview ? { overview: values.overview } : {}), features: values.features ? values.features.split(/\r?\n|;/).map((value) => value.trim()).filter(Boolean) : [] },
      specs, electrical: [], general, accessories: [], metadata,
      source: { kind: 'spreadsheet', document: fileName, importedAt: new Date().toISOString(), status: 'pending_review', missingFields: [...(!values.family ? ['family'] : []), ...(!specs.length ? ['specs'] : []), 'electrical', 'images'], fields: sourceFields },
    } })
    if (!parsed.success) { result.errors.push(`Linha ${index + 1}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`); continue }
    seenSkus.add(normalize(sku))
    result.products.push({ ...parsed.data, catalog_id: catalogId, status: 'draft', sort_order: index })
  }
  if (result.unmappedColumns.length) result.warnings.push(`Colunas preservadas em metadados: ${result.unmappedColumns.join(', ')}.`)
  result.warnings.push('Dados ausentes ficam vazios. Produtos serão rascunhos para revisão técnica; nenhuma especificação foi inventada.')
  return result
}
