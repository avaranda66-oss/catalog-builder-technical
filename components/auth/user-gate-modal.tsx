'use client'

import React, { useState, useEffect } from 'react'
import { TeamUser, PREDEFINED_AREAS, DEFAULT_ADMIN_PASSWORD } from '@/lib/types/auth-user'
import { ShieldCheck, User, Building, Lock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'

interface UserGateModalProps {
  currentUser: TeamUser | null
  onLogin: (user: TeamUser) => void
}

const AUTH_STORAGE_KEY = 'pcon-team-auth-user-v2'

export function getStoredUser(): TeamUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TeamUser
  } catch {
    return null
  }
}

export function saveStoredUser(user: TeamUser): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export const UserGateModal: React.FC<UserGateModalProps> = ({ currentUser, onLogin }) => {
  const [name, setName] = useState('')
  const [area, setArea] = useState<string>(PREDEFINED_AREAS[0])
  const [customArea, setCustomArea] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // If already logged in, do not render modal
  if (currentUser) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedPass = password.trim().toLowerCase()
    if (trimmedPass !== DEFAULT_ADMIN_PASSWORD) {
      setError('Senha incorreta. Digite a senha de acesso da equipe (presysadmin).')
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length < 2) {
      setError('Por favor, informe seu nome para identificação nas edições.')
      return
    }

    const finalArea = area === 'Outra' ? customArea.trim() || 'Geral' : area

    setIsSubmitting(true)
    const newUser: TeamUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: trimmedName,
      area: finalArea,
      loggedAt: new Date().toISOString(),
    }

    saveStoredUser(newUser)
    onLogin(newUser)
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-md overflow-hidden rounded-xs flex flex-col">
        {/* Header */}
        <div className="bg-[#1A1A2E] text-white p-5 text-center relative">
          <div className="w-12 h-12 bg-[#003366] text-white font-black text-base flex items-center justify-center mx-auto mb-2 border border-blue-400 rounded-xs shadow-md">
            PCON
          </div>
          <h2 className="text-base font-bold tracking-tight">
            Plataforma de Catálogos Técnicos
          </h2>
          <span className="text-xs text-[#94A3B8] block mt-0.5">
            Acesso Colaborativo da Equipe Presys & Clientes
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2 rounded-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Senha de Acesso da Equipe</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha (padrão: presysadmin)"
              className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs font-mono-data"
              autoFocus
            />
            <span className="text-[10px] text-[#94A3B8] block">
              Dica: a senha padrão de colaboração é <strong className="text-[#334155]">presysadmin</strong>
            </span>
          </div>

          {/* User Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Seu Nome / Identificador</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Eduardo Varanda, Carlos Engenheiro..."
              className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
            />
          </div>

          {/* Department / Area */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Área / Departamento Responsável</span>
            </label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full h-10 px-3 text-xs bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
            >
              {PREDEFINED_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="Outra">Outra Área...</option>
            </select>

            {area === 'Outra' && (
              <input
                type="text"
                value={customArea}
                onChange={(e) => setCustomArea(e.target.value)}
                placeholder="Especifique seu departamento..."
                className="w-full h-9 px-3 text-xs bg-[#FFFFFF] border border-[#CBD5E1] focus:border-[#2563EB] focus:outline-none rounded-xs mt-1.5"
              />
            )}
          </div>

          {/* Info note */}
          <div className="p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[11px] text-[#1E40AF] rounded-xs">
            <span className="font-bold">Colaboração em Tempo Real: </span>
            Suas edições serão salvas na nuvem com sua assinatura e sincronizadas automaticamente com os outros dispositivos da equipe.
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-[#059669] hover:bg-[#047857] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 rounded-xs shadow-md transition-colors cursor-pointer"
          >
            <span>Entrar no Sistema</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
