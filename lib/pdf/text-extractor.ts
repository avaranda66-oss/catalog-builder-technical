// ============================================================================
// Pure JS PDF Text Extractor (Zero Canvas / Zero Native Dependencies)
// ============================================================================

export function extractTextFromPdfBuffer(buffer: Buffer): string {
  try {
    const rawString = buffer.toString('binary')
    const textPieces: string[] = []

    // 1. Match all Text Objects enclosed in parentheses like (Text...) Tj or [(T)(e)(x)(t)] TJ
    const tjMatches = rawString.matchAll(/\(([^)]+)\)\s*Tj/g)
    for (const match of tjMatches) {
      if (match[1]) {
        textPieces.push(decodePdfString(match[1]))
      }
    }

    // 2. Match array text objects [(...)(...)] TJ
    const arrayMatches = rawString.matchAll(/\[([^\]]+)\]\s*TJ/g)
    for (const match of arrayMatches) {
      if (match[1]) {
        const innerStrings = match[1].matchAll(/\(([^)]+)\)/g)
        for (const inner of innerStrings) {
          if (inner[1]) {
            textPieces.push(decodePdfString(inner[1]))
          }
        }
      }
    }

    // 3. Match stream blocks if plain text was stored directly
    if (textPieces.length < 5) {
      const streamMatches = rawString.matchAll(/stream([\s\S]*?)endstream/g)
      for (const sm of streamMatches) {
        const streamContent = sm[1]
        // Extract printable ASCII words
        const words = streamContent.match(/[A-Za-z0-9±°%.,/:\-()]{2,}/g)
        if (words && words.length > 5) {
          textPieces.push(words.join(' '))
        }
      }
    }

    const cleanText = textPieces
      .map((t) => t.trim())
      .filter((t) => t.length > 1)
      .join(' ')
      .replace(/\s+/g, ' ')

    return cleanText
  } catch (err) {
    console.warn('[PDF Extractor] Fallback extraction warning:', err)
    return ''
  }
}

function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()])/g, '$1')
    .replace(/\\\\/g, '\\')
}
