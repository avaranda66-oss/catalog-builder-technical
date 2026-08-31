import { isSupabaseConfigured, supabase } from './client'
import type { TeamUser } from '../types/auth-user'
import type { UserRole } from '../types/database'

const roles: UserRole[] = ['admin', 'editor', 'viewer']

export async function getAuthenticatedUser(): Promise<TeamUser | null> {
  if (!isSupabaseConfigured()) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id,full_name,role,is_active').eq('id', data.user.id).single()
  if (profileError || !profile || profile.is_active !== true || !roles.includes(profile.role)) return null
  return {
    id: data.user.id,
    email: data.user.email,
    name: profile.full_name || data.user.email || 'Usuário',
    role: profile.role,
    area: profile.role === 'admin' ? 'Administração' : profile.role === 'editor' ? 'Edição' : 'Consulta',
    loggedAt: data.user.last_sign_in_at || new Date().toISOString(),
  }
}

export function subscribeToAuth(callback: (user: TeamUser | null) => void): () => void {
  if (!isSupabaseConfigured()) return () => undefined
  let active = true
  let generation = 0
  const { data } = supabase.auth.onAuthStateChange(() => {
    const current = ++generation
    // Do not await another Auth operation from inside onAuthStateChange's lock.
    setTimeout(() => {
      void getAuthenticatedUser().then((user) => {
        if (active && current === generation) callback(user)
      }).catch(() => {
        if (active && current === generation) callback(null)
      })
    }, 0)
  })
  return () => { active = false; data.subscription.unsubscribe() }
}

export async function signOutUser(): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pcon-team-auth-user-v3')
    localStorage.removeItem('pcon-team-registered-users-v3')
  }
}
