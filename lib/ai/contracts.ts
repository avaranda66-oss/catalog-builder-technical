import { z } from 'zod'

export const LocaleSchema = z.enum(['pt', 'en', 'es', 'fr', 'de', 'it'])
export const ProductSnapshotSchema = z.object({
  id: z.string().min(1).max(100), sku: z.string().min(1).max(120),
  name: z.string().max(500), family: z.string().max(200),
  version: z.number().int().nonnegative(), data: z.record(z.string(), z.unknown()),
}).passthrough()

const ChangeSchema = z.object({
  path: z.string().regex(/^marketing\.(title|subtitle|overview|features\.\d+)$/),
  newValue: z.string().min(1).max(20000), reason: z.string().min(1).max(2000),
}).strict()

export const ModelPatchSchema = z.object({
  summary: z.string().min(1).max(2000), changes: z.array(ChangeSchema).max(100),
}).strict()

export const TranslationSchema = z.object({
  fields: z.record(z.string(), z.string().max(20000)),
  pageTitles: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().max(500) }).strict()).max(200),
}).strict()

export function readTextPath(data: unknown, path: string): string | undefined {
  let current: unknown = data
  for (const part of path.split('.')) {
    if (['__proto__', 'constructor', 'prototype'].includes(part) || !current || typeof current !== 'object' || !Object.hasOwn(current, part)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

// Compare exact numeric tokens and engineering units; translations may change prose,
// never precision, signs, decimal separators, or measured values.
export function technicalTokens(text: string): string[] {
  return text.match(/[+−-]?\d+(?:[.,]\d+)*(?:[eE][+−-]?\d+)?|(?:%\s*FS|%\s*Leit\.?|°\s*[CF]|\b(?:mbar|bar|psi|kPa|MPa|Pa|mV|mA|Vac|Vca|Vdc|Vcc|VAC|VDC|kV|Hz|kHz|MHz|RTD|Pt-?1000?|ppm|mm|cm|kg|ms|mΩ|MΩ|Ω|V|A|W)\b|%)/g) || []
}

export function assertPreservedTechnicalText(before: string, after: string): void {
  if (JSON.stringify(technicalTokens(before)) !== JSON.stringify(technicalTokens(after))) {
    throw new Error('A resposta alterou valores ou unidades técnicas e foi rejeitada.')
  }
  const protectedClaims = /\b(?:ISO(?:\/IEC)?\s*[\d:-]*|IEC\s*[\d:-]*|HART|ISOPLAN|Modbus|ATEX|SIL\s*\d*|IP\s*\d{2}|Ethernet)\b/gi
  const claims = (value: string) => (value.match(protectedClaims) || []).map((item) => item.toUpperCase()).sort()
  if (JSON.stringify(claims(before)) !== JSON.stringify(claims(after))) {
    throw new Error('A resposta alterou uma certificação ou capacidade técnica protegida.')
  }
}

export const LOCALIZABLE_PATH = /^(marketing\.(title|subtitle|overview|features\.\d+)|specs\.\d+\.param|electrical\.\d+\.(signal|note)|general\.\d+\.(param|desc)|accessories\.\d+\.description)$/

export function collectTranslatableFields(data: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {}
  function visit(value: unknown, path: string, depth: number) {
    if (depth > 5) return
    if (typeof value === 'string' && value.trim() && LOCALIZABLE_PATH.test(path)) fields[path] = value
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
        visit(child, path ? `${path}.${key}` : key, depth + 1)
      }
    }
  }
  for (const key of ['marketing', 'specs', 'electrical', 'general', 'accessories']) visit(data[key], key, 0)
  return fields
}
