import { inflateSync } from 'node:zlib'

const MAX_PDF_BYTES = 5 * 1024 * 1024
const MAX_STREAM_BYTES = 4 * 1024 * 1024
const MAX_TOTAL_TEXT_BYTES = 12 * 1024 * 1024

export interface PdfExtraction { text: string; warnings: string[]; pageCount: number | null }

function decodeLiteral(value: string): string {
  return value.replace(/\\(?:\r\n|\n|\r)/g, '').replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_, token: string) => {
    if (/^[0-7]/.test(token)) return String.fromCharCode(parseInt(token, 8))
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[token] ?? token
  })
}

function readLiteral(source: string, start: number): { value: string; end: number } {
  let depth = 1
  let value = ''
  let index = start + 1
  for (; index < source.length; index++) {
    const char = source[index]
    if (char === '\\') { value += char + (source[++index] || ''); continue }
    if (char === '(') depth++
    if (char === ')') { depth--; if (depth === 0) return { value: decodeLiteral(value), end: index + 1 } }
    value += char
  }
  throw new Error('PDF contém uma sequência de texto incompleta.')
}

function extractLiteralText(content: string): string[] {
  const pieces: string[] = []
  // Only literal strings in text objects are supported. Glyph/CMap based text
  // must go through a full PDF engine/OCR instead of guessing character values.
  for (const block of content.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)) {
    const source = block[1]
    let index = 0
    while (index < source.length) {
      if (source[index] === '[') {
        let text = ''
        index++
        while (index < source.length && source[index] !== ']') {
          if (source[index] === '(') { const literal = readLiteral(source, index); text += literal.value; index = literal.end }
          else index++
        }
        index++
        if (/^\s*TJ\b/.test(source.slice(index)) && text.trim()) pieces.push(text)
      } else if (source[index] === '(') {
        const literal = readLiteral(source, index)
        if (/^\s*(?:Tj\b|'|")/.test(source.slice(literal.end)) && literal.value.trim()) pieces.push(literal.value)
        index = literal.end
      } else index++
    }
  }
  return pieces
}

export function extractPdfDocument(buffer: Buffer): PdfExtraction {
  if (!buffer.length || buffer.length > MAX_PDF_BYTES) throw new Error('O PDF deve ter no máximo 5 MB.')
  const raw = buffer.toString('latin1')
  if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(raw) || !/%%EOF\s*$/.test(raw) || !/\d+\s+\d+\s+obj\b/.test(raw)) throw new Error('Arquivo PDF inválido ou incompleto.')
  if (/\/Encrypt\b/.test(raw)) throw new Error('PDF protegido por senha não é suportado. Exporte uma cópia sem proteção.')
  if (/\/ToUnicode\b|\/Encoding\s*\/Identity-[HV]/.test(raw)) throw new Error('Este PDF usa fontes com mapeamento de glifos. Use uma planilha ou extração por OCR revisada; os dados não serão presumidos.')
  const pieces: string[] = []
  const warnings: string[] = []
  let total = 0
  let streams = 0
  for (const match of raw.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (++streams > 500) throw new Error('PDF excede o limite de 500 streams.')
    const dictionary = match[1]
    if (/\/Subtype\s*\/Image\b|\/Type\s*\/Metadata\b/.test(dictionary)) continue
    let content: Buffer
    if (/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(dictionary)) {
      try { content = inflateSync(Buffer.from(match[2], 'latin1'), { maxOutputLength: MAX_STREAM_BYTES }) }
      catch { throw new Error('Stream PDF inválido ou excede o limite de descompressão.') }
    } else if (/\/Filter\b/.test(dictionary)) {
      warnings.push('Um stream com compressão não suportada não foi extraído.')
      continue
    } else content = Buffer.from(match[2], 'latin1')
    total += content.length
    if (total > MAX_TOTAL_TEXT_BYTES || content.length > MAX_STREAM_BYTES) throw new Error('Conteúdo descomprimido excede o limite de segurança.')
    pieces.push(...extractLiteralText(content.toString('latin1')))
  }
  const text = pieces.map((piece) => piece.trim()).filter(Boolean).join('\n')
  if (!text.trim()) throw new Error('Nenhum texto legível foi extraído. PDF digitalizado ou codificação não suportada exige OCR e revisão humana.')
  if (text.length > 100_000) throw new Error('Documento excede 100 mil caracteres. Importe um produto por vez.')
  warnings.push('Extração parcial de texto: revise tabelas, relações entre colunas e campos ausentes. Imagens/layout original não são importados.')
  return { text, warnings: [...new Set(warnings)], pageCount: (raw.match(/\/Type\s*\/Page\b/g) || []).length || null }
}

export function extractTextFromPdfBuffer(buffer: Buffer): string { return extractPdfDocument(buffer).text }
