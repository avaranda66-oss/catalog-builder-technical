/** Original ASCII PDF fixtures with explicit text operators and coordinates. */
export function nativePdfFixture(
  textOperators: string,
  options: { rotation?: number; cropBox?: string; userUnit?: number; unicodeHex?: string } = {},
): ArrayBuffer {
  const cmap = options.unicodeHex ? `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Original) /Ordering (Fixture) /Supplement 0 >> def\n/CMapName /OriginalFixture def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n1 beginbfchar\n<41> <${options.unicodeHex}>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /CropBox ${options.cropBox ?? '[0 0 600 840]'} /Rotate ${options.rotation ?? 0} /UserUnit ${options.userUnit ?? 1} /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding ${cmap ? '/ToUnicode 7 0 R' : ''} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${textOperators.length} >>\nstream\n${textOperators}\nendstream`,
    ...(cmap ? [`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`] : []),
  ];
  let text = '%PDF-1.7\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const startXref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return new TextEncoder().encode(text).buffer;
}
