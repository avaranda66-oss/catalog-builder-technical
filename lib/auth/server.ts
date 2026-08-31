import { createClient } from '@supabase/supabase-js'
import type { UserRole } from '../types/database'
import type { TeamUser } from '../types/auth-user'

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403 | 503, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Never trusts user identifiers or roles submitted in a request body. */
export async function requireAuthenticatedUser(
  request: Request,
  allowedRoles: UserRole[] = ['admin', 'editor'],
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url.includes('mock-supabase')) {
    throw new AuthError(503, 'Serviço de autenticação não configurado. O modo local não utiliza IA remota.')
  }
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) throw new AuthError(401, 'Entre com sua conta para utilizar este recurso.')

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new AuthError(401, 'Sessão inválida ou expirada. Entre novamente.')
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id,full_name,role,is_active').eq('id', data.user.id).single()
  if (profileError || !profile || profile.is_active !== true || !allowedRoles.includes(profile.role)) {
    throw new AuthError(403, 'Seu perfil não tem permissão para esta operação.')
  }
  const user: TeamUser = {
    id: data.user.id,
    name: profile.full_name || data.user.email || 'Usuário',
    email: data.user.email,
    area: profile.role === 'admin' ? 'Administração' : profile.role === 'editor' ? 'Edição' : 'Consulta',
    role: profile.role,
    loggedAt: data.user.last_sign_in_at || new Date().toISOString(),
  }
  return { user, supabase }
}
