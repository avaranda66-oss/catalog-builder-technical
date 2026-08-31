import zlib from 'zlib'

// ============================================================================
// Robust PDF Text Stream Decompressor & Extractor (Pure Node.js + zlib)
// ============================================================================

export function extractTextFromPdfBuffer(buffer: Buffer): string {
  try {
    const raw = buffer.toString('latin1')
    const textPieces: string[] = []

    // 1. Scan and decompress all PDF Flate streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g
    let match: RegExpExecArray | null

    while ((match = streamRegex.exec(raw)) !== null) {
      const streamRaw = match[1]
      const streamBuf = Buffer.from(streamRaw, 'latin1')

      let decompressed = ''
      try {
        decompressed = zlib.inflateSync(streamBuf).toString('latin1')
      } catch {
        try {
          decompressed = zlib.inflateRawSync(streamBuf).toString('latin1')
        } catch {
          // Not a zlib compressed stream or raw image binary, skip
          continue
        }
      }

      if (!decompressed) continue

      // Ignore XMP metadata packets, font files, and image data
      if (
        decompressed.includes('<x:xmpmeta') ||
        decompressed.includes('<?xpacket') ||
        decompressed.includes('/FontFile') ||
        decompressed.includes('/CIDFont')
      ) {
        continue
      }

      // Check if it's a PDF content stream with Text blocks (BT ... ET)
      if (decompressed.includes('BT') && decompressed.includes('ET')) {
        const btMatches = decompressed.matchAll(/BT[\s\S]*?ET/g)
        for (const bt of btMatches) {
          const block = bt[0]

          // A) Single string literals (Text) Tj, ', "
          const tjMatches = block.matchAll(/\(([^)]+)\)\s*(?:Tj|'|")/g)
          for (const m of tjMatches) {
            const decoded = decodePdfString(m[1])
            if (isMeaningfulText(decoded)) {
              textPieces.push(decoded)
            }
          }

          // B) Array text literals [(T) 20 (ext)] TJ
          const arrayMatches = block.matchAll(/\[([\s\S]*?)\]\s*TJ/g)
          for (const m of arrayMatches) {
            const inners = m[1].matchAll(/\(([^)]+)\)/g)
            const word: string[] = []
            for (const inn of inners) {
              const dec = decodePdfString(inn[1])
              word.push(dec)
            }
            const joinedWord = word.join('')
            if (isMeaningfulText(joinedWord)) {
              textPieces.push(joinedWord)
            }
          }
        }
      } else {
        // Fallback: If not explicitly inside BT...ET, look for (Text) Tj
        const directTj = decompressed.matchAll(/\(([^)]{2,})\)\s*(?:Tj|TJ)/g)
        for (const m of directTj) {
          const decoded = decodePdfString(m[1])
          if (isMeaningfulText(decoded)) {
            textPieces.push(decoded)
          }
        }
      }
    }

    // 2. Also check uncompressed text outside streams
    const directMatches = raw.matchAll(/\(([^)]{3,})\)\s*Tj/g)
    for (const m of directMatches) {
      const decoded = decodePdfString(m[1])
      if (isMeaningfulText(decoded)) {
        textPieces.push(decoded)
      }
    }

    const cleanText = textPieces
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove control chars

    return cleanText
  } catch (err) {
    console.warn('[PDF Extractor] Error extracting text from PDF:', err)
    return ''
  }
}

function decodePdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([()\\\/])/g, '$1')
}

function isMeaningfulText(str: string): boolean {
  if (!str || str.length < 1) return false
  // Check if string contains at least some alphanumeric or metrology characters
  return /[A-Za-z0-9±°%.,/:\-()_]/.test(str)
}
