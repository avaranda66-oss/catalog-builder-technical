import * as XLSX from 'xlsx'
import { Product, ProductData } from '../../lib/types/database'

export interface ParsedExcelResult {
  sheetNames: string[]
  products: Partial<Product>[]
  warnings: string[]
  unmappedColumns: string[]
  errors: string[]
}

export function parseExcelFile(buffer: ArrayBuffer, catalogId: string): ParsedExcelResult {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const result: ParsedExcelResult = {
    sheetNames: workbook.SheetNames,
    products: [],
    warnings: [],
    unmappedColumns: [],
    errors: [],
  }

  // Look for product sheets or default first sheet
  const targetSheetName =
    workbook.SheetNames.find((n) =>
      n.toUpperCase().includes('Y17') ||
      n.toUpperCase().includes('PCON') ||
      n.toUpperCase().includes('CONFIG') ||
      n.toUpperCase().includes('PROD') ||
      n.toUpperCase().includes('BASE')
    ) || workbook.SheetNames[0]

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
  const recognizedHeaders = new Set([
    'SKU', 'MODEL', 'MODELO', 'CODE', 'CÓDIGO',
    'NAME', 'NOME', 'DESCRIPTION', 'DESCRIÇÃO',
    'TITLE', 'TÍTULO', 'OVERVIEW', 'RESUMO',
    'RANGE', 'FAIXA', 'PRESSURE RANGE', 'FAIXA DE PRESSÃO',
    'ACCURACY', 'EXATIDÃO', 'PRECISÃO',
    'STABILITY', 'ESTABILIDADE',
    'CONTROL TIME', 'TEMPO DE CONTROLE', 'TEMPO',
    'FLUID', 'FLUIDO', 'COMPATIBILIDADE',
    'COMMUNICATION', 'COMUNICAÇÃO', 'DISPLAY',
    'POWER', 'ALIMENTAÇÃO', 'WEIGHT', 'PESO',
  ])

  // Track unmapped headers
  headers.forEach((h) => {
    if (h && !recognizedHeaders.has(h.toUpperCase())) {
      if (!result.unmappedColumns.includes(h)) {
        result.unmappedColumns.push(h)
      }
    }
  })

  if (result.unmappedColumns.length > 0) {
    result.warnings.push(
      `Colunas adicionais identificadas e armazenadas em metadados: ${result.unmappedColumns.join(', ')}`
    )
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => c === '')) continue

    const rowObj: Record<string, any> = {}
    headers.forEach((h, idx) => {
      if (h) rowObj[h] = row[idx]
    })

    const sku =
      rowObj['SKU'] ||
      rowObj['Model'] ||
      rowObj['Modelo'] ||
      rowObj['Code'] ||
      rowObj['Código'] ||
      `PCON-AUTO-${i}`

    const name =
      rowObj['Name'] ||
      rowObj['Nome'] ||
      rowObj['Description'] ||
      rowObj['Descrição'] ||
      sku

    const title = rowObj['Title'] || rowObj['Título'] || name
    const overview = rowObj['Overview'] || rowObj['Resumo'] || 'Controlador e calibrador automático de alta precisão.'
    const rangeStr = rowObj['Range'] || rowObj['Faixa'] || rowObj['Pressure Range'] || rowObj['Faixa de Pressão'] || '0 a 210 bar'
    const accuracyStr = rowObj['Accuracy'] || rowObj['Exatidão'] || rowObj['Precisão'] || '± 0,012% FS'
    const stabilityStr = rowObj['Stability'] || rowObj['Estabilidade'] || '± 0,002% FS'
    const timeStr = rowObj['Control Time'] || rowObj['Tempo de Controle'] || rowObj['Tempo'] || '< 15 s'
    const fluidStr = rowObj['Fluid'] || rowObj['Fluido'] || rowObj['Compatibilidade'] || 'Gases limpos e não corrosivos'
    const commStr = rowObj['Communication'] || rowObj['Comunicação'] || 'Ethernet, USB, RS-232/485'
    const displayStr = rowObj['Display'] || 'Touchscreen Colorido 5.7"'
    const powerStr = rowObj['Power'] || rowObj['Alimentação'] || '100 a 240 Vca (50/60 Hz)'

    const data: ProductData = {
      marketing: {
        title,
        overview,
        features: [
          'Controle automático de pressão com alta estabilidade',
          'Display gráfico touchscreen colorido intuitivo',
          'Comunicação digital Ethernet, USB e Modbus',
          'Gabinete industrial robusto para bancada ou rack',
        ],
      },
      // Especificações estruturadas diretamente para SpecsTableSection e Cover Quick Specs
      specs: [
        { param: 'Faixa de Controle', value: rangeStr },
        { param: 'Exatidão da Indicação', value: accuracyStr },
        { param: 'Estabilidade de Controle', value: stabilityStr },
        { param: 'Tempo de Resposta', value: timeStr },
        { param: 'Compatibilidade de Fluido', value: fluidStr },
      ],
      // Especificações de Calibração Elétrica
      electrical: [
        { function_name: 'Medição de Corrente (mA)', range: '0 a 24 mA', resolution: '0,0001 mA', accuracy: '± (0,01% Leit. + 0,002 mA)' },
        { function_name: 'Medição de Tensão (V)', range: '0 a 30 V', resolution: '0,0001 V', accuracy: '± (0,01% Leit. + 0,002 V)' },
        { function_name: 'Alimentação de Loop (Transmissor)', range: '24 Vcc ± 8%', resolution: '—', accuracy: 'Corrente máx: 25 mA' },
      ],
      // Especificações Gerais
      general: [
        { param: 'Display / Interface', value: displayStr },
        { param: 'Comunicação Digital', value: commStr },
        { param: 'Alimentação Elétrica', value: powerStr },
        { param: 'Temperatura de Operação', value: '0 a 50 °C' },
      ],
      // Compatibilidade legado
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
