import { GoogleGenAI } from '@google/genai'
import { ZodError } from 'zod'

export class AiRequestError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}

const usage = new Map<string, { count: number; expires: number }>()
// Per-process defense. Production deployments should additionally enforce the same
// per-user quota at a shared gateway/Redis store across all instances.
export function enforceRateLimit(userId: string, action: string, now = Date.now()): void {
  for (const [key, value] of usage) if (value.expires <= now) usage.delete(key)
  const key = `${userId}:${action}`
  const entry = usage.get(key) || { count: 0, expires: now + 60_000 }
  if (entry.count >= 10) throw new AiRequestError('Limite de 10 solicitações por minuto atingido. Aguarde e tente novamente.', 429)
  entry.count++
  usage.set(key, entry)
}

export async function readLimitedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const declaredSize = Number(request.headers.get('content-length') || 0)
  if (declaredSize > maximumBytes) throw new AiRequestError('Arquivo ou solicitação excede o limite permitido.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new AiRequestError('Solicitação vazia.')
  const chunks: Uint8Array[] = []
  let total = 0
  const timeout = setTimeout(() => { void reader.cancel('Tempo de upload excedido.') }, 20_000)
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      total += result.value.byteLength
      if (total > maximumBytes) {
        await reader.cancel()
        throw new AiRequestError('Arquivo ou solicitação excede o limite permitido.', 413)
      }
      chunks.push(result.value)
    }
  } finally { clearTimeout(timeout); reader.releaseLock() }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  return body
}

export async function readLimitedJson(request: Request, maximumBytes = 512_000): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new AiRequestError('Use application/json.', 415)
  try { return JSON.parse(new TextDecoder().decode(await readLimitedBody(request, maximumBytes))) }
  catch (error) { if (error instanceof AiRequestError) throw error; throw new AiRequestError('JSON inválido.') }
}

export async function generateJson(systemInstruction: string, payload: unknown): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new AiRequestError('IA indisponível: o serviço não está configurado. Nenhum dado foi alterado.', 503)
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30_000 } })
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', contents: JSON.stringify(payload),
      config: { systemInstruction, responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 8192 },
    })
    return JSON.parse(response.text || '')
  } catch { throw new AiRequestError('O serviço de IA falhou ou retornou uma resposta inválida. Tente novamente; nenhum dado foi aplicado.', 502) }
}

export function routeError(error: unknown): Response {
  if (error instanceof ZodError) return Response.json({ error: 'Dados incompatíveis com o formato esperado.', details: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }, { status: 422 })
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') return Response.json({ error: error.message }, { status: error.status })
  return Response.json({ error: 'Não foi possível validar a operação. Nenhum dado foi aplicado.' }, { status: 422 })
}
