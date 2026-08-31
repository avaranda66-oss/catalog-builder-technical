import { requireAuthenticatedUser } from '../../../../lib/auth/server'
import { enforceRateLimit, readLimitedBody, routeError, AiRequestError } from '../../../../lib/ai/server'
import { extractPdfDocument } from '../../../../lib/pdf/text-extractor'
import { parsePdfProductText } from '../../../../lib/import/pdf-product'
import { ImportedDataSchema } from '../../../../lib/import/schema'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    enforceRateLimit(user.id, 'import-pdf')
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) throw new AiRequestError('Envie um arquivo PDF como multipart/form-data.', 415)
    const limitedBody = await readLimitedBody(request, 5 * 1024 * 1024 + 16_384)
    const form = await new Response(limitedBody as BodyInit, { headers: { 'content-type': contentType } }).formData()
    const file = form.get('file')
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf')) throw new AiRequestError('Arquivo PDF obrigatório.')
    const document = file.name.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 255)
    const extraction = extractPdfDocument(Buffer.from(await file.arrayBuffer()))
    const product = parsePdfProductText(extraction.text, document)
    ImportedDataSchema.parse(product.data)
    return Response.json({ success: true, product, warnings: extraction.warnings, pageCount: extraction.pageCount, source: 'pdf-literal-text', summary: 'Texto extraído sem IA. Revise os campos e complete SKU/nome antes de importar. Nenhum layout foi clonado.' })
  } catch (error) { return routeError(error) }
}
