import * as XLSX from 'xlsx'
import { Product, ProductData } from '../../lib/types/database'

export interface ParsedExcelResult {
  sheetNames: string[]
  products: Partial<Product>[]
  errors: string[]
}

export function parseExcelFile(buffer: ArrayBuffer, catalogId: string): ParsedExcelResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const result: ParsedExcelResult = {
    sheetNames: workbook.SheetNames,
    products: [],
    errors: [],
  }

  // Look for product sheets or default first sheet
  const targetSheetName =
    workbook.SheetNames.find((n) => n.includes('Y17') || n.includes('PCON') || n.includes('CONFIG') || n.includes('BASE')) ||
    workbook.SheetNames[0]

  if (!targetSheetName) {
    result.errors.push('Nenhuma planilha encontrada no arquivo.')
    return result
  }

  const sheet = workbook.Sheets[targetSheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (rows.length < 2) {
    result.errors.push(`A planilha "${targetSheetName}" não contém dados suficientes.`)
    return result
  }

  // Extract headers
  const headers = rows[0].map((h) => String(h).trim())
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c === '')) continue

    const rowObj: Record<string, any> = {}
    headers.forEach((h, idx) => {
      if (h) rowObj[h] = row[idx]
    })

    const sku = rowObj['SKU'] || rowObj['Model'] || rowObj['Modelo'] || rowObj['Code'] || `PCON-AUTO-${i}`
    const name = rowObj['Name'] || rowObj['Nome'] || rowObj['Description'] || rowObj['Descrição'] || sku
    const title = rowObj['Title'] || rowObj['Título'] || name
    const overview = rowObj['Overview'] || rowObj['Resumo'] || ''
    const rangeStr = rowObj['Range'] || rowObj['Faixa'] || rowObj['Pressure Range'] || '0 a 210 bar'
    const accuracyStr = rowObj['Accuracy'] || rowObj['Exatidão'] || '± 0,012% FS'
    const stabilityStr = rowObj['Stability'] || rowObj['Estabilidade'] || '± 0,002% FS'

    const data: ProductData = {
      marketing: {
        title,
        overview,
        features: [],
      },
      pressure_specs: {
        control_range: rangeStr,
        display_accuracy: accuracyStr,
        control_stability: stabilityStr,
      },
    }

    result.products.push({
      catalog_id: catalogId,
      sku: String(sku).trim(),
      name: String(name).trim(),
      family: 'PCON',
      status: 'draft',
      sort_order: i,
      data,
    })
  }

  return result
}
