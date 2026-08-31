'use client'

import { useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase/client'

interface PasswordSetupModalProps {
  onComplete: () => void
  variant?: 'invite' | 'recovery'
}

export function PasswordSetupModal({ onComplete, variant = 'invite' }: PasswordSetupModalProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Use pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmation) {
      setError('As senhas não coincidem.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError('Não foi possível definir a senha. Abra o convite novamente ou solicite outro ao administrador.')
      return
    }
    setPassword('')
    setConfirmation('')
    onComplete()
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="password-title" className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
      <div className="bg-slate-900 px-6 py-5 text-white">
        <ShieldCheck className="mb-3 h-7 w-7" />
        <h2 id="password-title" className="text-lg font-semibold">{variant === 'recovery' ? 'Redefina sua senha' : 'Finalize seu acesso'}</h2>
        <p className="mt-1 text-sm text-slate-300">{variant === 'recovery' ? 'Escolha uma nova senha pessoal para voltar ao workspace.' : 'O convite foi aceito. Defina uma senha pessoal para entrar no workspace.'}</p>
      </div>
      <form onSubmit={submit} className="space-y-4 p-6">
        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-1 flex items-center gap-2"><Lock size={15} /> Nova senha</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          <span className="mb-1 flex items-center gap-2"><Lock size={15} /> Confirmar senha</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="w-full rounded bg-blue-700 py-2.5 text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Definir senha e continuar'}</button>
      </form>
    </section>
  </div>
}
