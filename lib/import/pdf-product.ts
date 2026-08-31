import { ImportedData, SourceField } from './schema'

export function parsePdfProductText(text: string, document: string): { sku: string; name: string; family: string; data: ImportedData } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const fields: Record<string, SourceField> = {}
  const provenance = (path: string, quote: string) => { fields[path] = { document, page: null, quote, confidence: 'unverified' } }
  const getLabelled = (pattern: RegExp, path: string) => {
    const line = lines.find((candidate) => pattern.test(candidate))
    if (!line) return ''
    const value = line.replace(pattern, '').trim()
    if (value) provenance(path, line)
    return value
  }
  const sku = getLabelled(/^(?:SKU|MODEL|MODELO|CÓDIGO|CODE)\s*:\s*/i, 'sku')
  const name = getLabelled(/^(?:PRODUCT|PRODUTO|NAME|NOME|TITLE|TÍTULO)\s*:\s*/i, 'name')
  const family = getLabelled(/^(?:FAMILY|FAMÍLIA|CATEGORIA|CATEGORY)\s*:\s*/i, 'family')
  const specs: ImportedData['specs'] = []
  const features: string[] = []
  for (const line of lines) {
    if (/^[•✓]\s*\S|^-\s+\S/.test(line)) {
      const value = line.replace(/^[•✓-]\s*/, '')
      provenance(`marketing.features.${features.length}`, line)
      features.push(value)
      continue
    }
    // Split only on the first colon/tab or a spaced dash, never a numeric sign.
    const match = line.match(/^([^:\t]{1,120}?)(?:\s*:\s*|\t+|\s+[—–]\s+)(.+)$/)
    if (!match || /^(?:SKU|MODEL|MODELO|CÓDIGO|CODE|PRODUCT|PRODUTO|NAME|NOME|TITLE|TÍTULO|FAMILY|FAMÍLIA|CATEGORY|CATEGORIA)$/i.test(match[1].trim())) continue
    specs.push({ param: match[1].trim(), value: match[2].trim() })
    provenance(`specs.${specs.length - 1}.value`, line)
  }
  const missingFields = [...(!sku ? ['sku'] : []), ...(!name ? ['name'] : []), ...(!family ? ['family'] : []), ...(!specs.length ? ['specs'] : []), 'images', 'electrical', 'general', 'accessories']
  return {
    sku, name, family,
    data: {
      marketing: { ...(name ? { title: name } : {}), features }, specs, electrical: [], general: [], accessories: [],
      source: { kind: 'pdf', document, importedAt: new Date().toISOString(), status: 'pending_review', missingFields, fields },
    },
  }
}
