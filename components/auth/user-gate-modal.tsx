'use client'

import React, { useState } from 'react'
import { KeyRound, Lock, Mail, Monitor, ShieldCheck } from 'lucide-react'
import type { TeamUser } from '@/lib/types/auth-user'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import { getAuthenticatedUser, signOutUser } from '@/lib/supabase/auth'

function hasExpiredAuthLink(): boolean {
  if (typeof window === 'undefined') return false
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  return hash.get('error_code') === 'otp_expired' || query.get('error_code') === 'otp_expired'
}

interface UserGateModalProps {
  currentUser: TeamUser | null
  onLogin: (user: TeamUser) => void
  onLocalMode?: () => void
}

/** Legacy cache is deliberately never accepted as an authenticated session. */
export function getStoredUser(): null { return null }
export function clearStoredUser(): void { void signOutUser() }

export const UserGateModal: React.FC<UserGateModalProps> = ({ currentUser, onLogin, onLocalMode }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resetNotice, setResetNotice] = useState('')
  const [expiredAuthLink] = useState(hasExpiredAuthLink)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  if (currentUser) return null
  const configured = isSupabaseConfigured()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginError) throw new Error('Não foi possível entrar. Verifique suas credenciais ou contate o administrador.')
      const user = await getAuthenticatedUser()
      if (!user) {
        await signOutUser()
        throw new Error('Sua conta ainda não possui um perfil autorizado. Solicite acesso ao administrador.')
      }
      setPassword('')
      onLogin(user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao autenticar. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePasswordReset = async () => {
    setError('')
    setResetNotice('')
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('Informe seu e-mail para receber o link de senha.')
      return
    }
    setIsResetting(true)
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: typeof window === 'undefined' ? undefined : window.location.origin,
    })
    setIsResetting(false)
    if (resetError) {
      setError('Não foi possível enviar o link. Tente novamente ou contate o administrador.')
      return
    }
    setResetNotice('Se o e-mail estiver cadastrado, enviaremos um link para definir uma nova senha.')
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="auth-title" className="w-full max-w-md rounded-lg bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-5">
          <ShieldCheck className="w-7 h-7 mb-3" />
          <h2 id="auth-title" className="text-lg font-semibold">Catálogos técnicos</h2>
          <p className="text-sm text-slate-300 mt-1">Acesso individual à biblioteca da equipe</p>
        </div>
        <div className="p-6 space-y-5">
          {configured ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {expiredAuthLink && <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Este link de convite expirou. Informe seu e-mail e use a opção abaixo para criar uma senha.</p>}
              <label className="block text-sm font-medium text-slate-700">
                <span className="flex items-center gap-2 mb-1"><Mail size={15} /> E-mail corporativo</span>
                <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                <span className="flex items-center gap-2 mb-1"><Lock size={15} /> Senha</span>
                <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-300 rounded px-3 py-2" />
              </label>
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              {resetNotice && <p role="status" className="text-sm text-emerald-700">{resetNotice}</p>}
              <button disabled={isSubmitting} className="w-full rounded bg-blue-700 text-white py-2.5 disabled:opacity-50">{isSubmitting ? 'Validando acesso…' : 'Entrar'}</button>
              <button type="button" disabled={isResetting} onClick={() => void handlePasswordReset()} className="flex w-full items-center justify-center gap-2 text-sm text-blue-800 hover:underline disabled:opacity-50"><KeyRound size={15} />{isResetting ? 'Enviando link…' : 'Esqueci ou ainda não defini minha senha'}</button>
              <p className="text-xs text-slate-500">Contas e permissões são administradas pela empresa. Não há senha compartilhada.</p>
            </form>
          ) : <p className="text-sm text-amber-800">A conexão corporativa ainda não está configurada. Você pode preparar documentos localmente; não haverá sincronização ou identidade autenticada.</p>}
          {onLocalMode && <button type="button" onClick={onLocalMode} className="w-full flex items-center justify-center gap-2 rounded border border-slate-300 py-2 text-sm text-slate-700"><Monitor size={16} /> Continuar em modo local</button>}
          <p className="text-xs text-slate-500">No modo local, os arquivos ficam neste navegador. Exporte um backup antes de trocar de dispositivo.</p>
        </div>
      </section>
    </div>
  )
}
