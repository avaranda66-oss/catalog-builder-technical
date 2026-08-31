import { supabase, isSupabaseConfigured } from '../supabase/client'

export async function authenticatedAiFetch(path: string, init: RequestInit): Promise<Response> {
  if (!isSupabaseConfigured()) throw new Error('Conecte o projeto ao Supabase e entre com sua conta para usar a IA.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Sua sessão expirou. Entre novamente para continuar.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${data.session.access_token}`)
  const response = await fetch(path, { ...init, headers, signal: init.signal || AbortSignal.timeout(45_000) })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null
    throw new Error(typeof body?.error === 'string' ? body.error : `O serviço respondeu com erro ${response.status}.`)
  }
  return response
}
