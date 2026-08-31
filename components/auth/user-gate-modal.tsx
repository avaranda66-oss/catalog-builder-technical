'use client'

import React, { useState, useEffect } from 'react'
import { TeamUser, PREDEFINED_AREAS, DEFAULT_ADMIN_PASSWORD } from '@/lib/types/auth-user'
import {
  ShieldCheck,
  User,
  Building,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Users,
  UserPlus,
  Trash2,
} from 'lucide-react'

interface UserGateModalProps {
  currentUser: TeamUser | null
  onLogin: (user: TeamUser) => void
}

const AUTH_STORAGE_KEY = 'pcon-team-auth-user-v3'
const REGISTERED_USERS_KEY = 'pcon-team-registered-users-v3'

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

  // Also add to registered users list (only real users)
  const existing = getRegisteredUsers()
  if (!existing.some((u) => u.name.toLowerCase() === user.name.toLowerCase())) {
    saveRegisteredUsers([user, ...existing])
  }
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function getRegisteredUsers(): TeamUser[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveRegisteredUsers(users: TeamUser[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users))
}

export const UserGateModal: React.FC<UserGateModalProps> = ({ currentUser, onLogin }) => {
  const [registeredUsers, setRegisteredUsers] = useState<TeamUser[]>([])
  const [selectedUser, setSelectedUser] = useState<TeamUser | null>(null)
  const [mode, setMode] = useState<'select' | 'new'>('new')

  const [newName, setNewName] = useState('')
  const [newArea, setNewArea] = useState<string>(PREDEFINED_AREAS[0])
  const [customArea, setCustomArea] = useState('')

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const users = getRegisteredUsers()
    setRegisteredUsers(users)
    if (users.length > 0) {
      setSelectedUser(users[0])
      setMode('select')
    } else {
      setMode('new')
    }
  }, [])

  // If already logged in, do not render modal
  if (currentUser) return null

  const handleSelectUser = (u: TeamUser) => {
    setSelectedUser(u)
    setError('')
  }

  const handleDeleteUser = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation()
    const updated = registeredUsers.filter((u) => u.id !== userId)
    setRegisteredUsers(updated)
    saveRegisteredUsers(updated)
    if (selectedUser?.id === userId) {
      const nextUser = updated[0] || null
      setSelectedUser(nextUser)
      if (!nextUser) {
        setMode('new')
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedPass = password.trim().toLowerCase()
    if (trimmedPass !== DEFAULT_ADMIN_PASSWORD) {
      setError('Senha incorreta. Por favor, verifique a senha de acesso da equipe.')
      return
    }

    let finalUser: TeamUser

    if (mode === 'select' && registeredUsers.length > 0) {
      if (!selectedUser) {
        setError('Por favor, selecione um perfil de usuário da lista.')
        return
      }
      finalUser = {
        ...selectedUser,
        loggedAt: new Date().toISOString(),
      }
    } else {
      const trimmedName = newName.trim()
      if (!trimmedName || trimmedName.length < 2) {
        setError('Por favor, informe seu nome para identificação nas edições.')
        return
      }

      const finalArea = newArea === 'Outra' ? customArea.trim() || 'Geral' : newArea
      finalUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: trimmedName,
        area: finalArea,
        loggedAt: new Date().toISOString(),
      }

      // Save to registered users list
      const updated = [
        finalUser,
        ...registeredUsers.filter((u) => u.name.toLowerCase() !== finalUser.name.toLowerCase()),
      ]
      setRegisteredUsers(updated)
      saveRegisteredUsers(updated)
    }

    setIsSubmitting(true)
    saveStoredUser(finalUser)
    onLogin(finalUser)
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-lg overflow-hidden rounded-xs flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#1A1A2E] text-white p-4 sm:p-5 text-center relative shrink-0">
          <div className="w-11 h-11 bg-[#003366] text-white font-black text-base flex items-center justify-center mx-auto mb-2 border border-blue-400 rounded-xs shadow-md">
            PCON
          </div>
          <h2 className="text-base font-bold tracking-tight">
            Plataforma de Catálogos Técnicos Presys
          </h2>
          <span className="text-xs text-[#94A3B8] block mt-0.5">
            Acesso Colaborativo & Edição Multiusuário na Nuvem
          </span>
        </div>

        {/* Tab Selector: Only show if there are registered users */}
        {registeredUsers.length > 0 && (
          <div className="flex border-b border-[#E2E8F0] bg-[#F8FAFC] shrink-0">
            <button
              type="button"
              onClick={() => {
                setMode('select')
                setError('')
              }}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                mode === 'select'
                  ? 'border-[#2563EB] text-[#2563EB] bg-[#FFFFFF]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuários Salvos ({registeredUsers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('new')
                setError('')
              }}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                mode === 'new'
                  ? 'border-[#2563EB] text-[#2563EB] bg-[#FFFFFF]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Novo Usuário</span>
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2 rounded-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Mode 1: List of Real Registered Users */}
          {mode === 'select' && registeredUsers.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center justify-between">
                <span>Selecione seu Perfil:</span>
                <span className="text-[10px] text-[#94A3B8] font-normal">Clique para escolher</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-[#E2E8F0] bg-[#F8FAFC] rounded-xs">
                {registeredUsers.map((user) => {
                  const isSelected = selectedUser?.id === user.id
                  return (
                    <div
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className={`p-2.5 border rounded-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-[#2563EB] bg-[#EFF6FF] shadow-xs'
                          : 'border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected ? 'bg-[#2563EB] text-white' : 'bg-[#E2E8F0] text-[#475569]'
                          }`}
                        >
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[#0F172A] block truncate">
                            {user.name}
                          </span>
                          <span className="text-[10px] text-[#64748B] block truncate">
                            {user.area}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteUser(e, user.id)}
                          className="p-1 text-[#94A3B8] hover:text-[#EF4444] rounded-xs"
                          title="Remover perfil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mode 2: Create New User */}
          {(mode === 'new' || registeredUsers.length === 0) && (
            <div className="space-y-3">
              {/* User Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Seu Nome / Identificador</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Digite seu nome completo"
                  className="w-full h-10 px-3 text-sm bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
                  autoFocus
                />
              </div>

              {/* Department / Area */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Área / Departamento Responsável</span>
                </label>
                <select
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
                >
                  {PREDEFINED_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>

                {newArea === 'Outra' && (
                  <input
                    type="text"
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    placeholder="Digite o nome da sua área..."
                    className="w-full h-9 px-3 mt-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs"
                  />
                )}
              </div>
            </div>
          )}

          {/* Password field (Required) */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Senha de Acesso da Equipe</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha de acesso da equipe"
                className="w-full h-10 pl-3 pr-16 text-sm bg-[#F8FAFC] border border-[#CBD5E1] focus:border-[#2563EB] focus:bg-[#FFFFFF] focus:outline-none rounded-xs font-mono-data"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-[#64748B] hover:text-[#0F172A] text-xs font-semibold px-1 py-0.5 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>

          {/* Real-time Collaboration Note */}
          <div className="p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xs text-[11px] text-[#1E40AF] leading-normal flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#2563EB] mt-0.5" />
            <div>
              <strong>Ambiente Multiusuário:</strong> Suas alterações ficarão salvas na nuvem com seu nome e área, sincronizando em tempo real com todos os outros computadores e celulares da equipe.
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-[#059669] hover:bg-[#047857] disabled:bg-[#9CA3AF] text-white text-sm font-bold tracking-wide flex items-center justify-center gap-2 rounded-xs shadow-md transition-colors cursor-pointer"
          >
            <span>
              {mode === 'select' && registeredUsers.length > 0
                ? `Entrar como ${selectedUser?.name || 'Usuário'}`
                : 'Criar Perfil e Entrar no Sistema'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
