'use client'

import React, { useState } from 'react'
import { AuditLogItem } from '@/lib/types/auth-user'
import { History, X, User, Building, Clock, Search, ShieldCheck, Filter } from 'lucide-react'

interface AuditLogModalProps {
  isOpen: boolean
  onClose: () => void
  logs: AuditLogItem[]
  onClearLogs?: () => void
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
}) => {
  const [search, setSearch] = useState('')
  const [selectedArea, setSelectedArea] = useState<string>('all')

  if (!isOpen) return null

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.user_name.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(search.toLowerCase()))

    const matchesArea = selectedArea === 'all' || log.user_area === selectedArea
    return matchesSearch && matchesArea
  })

  const uniqueAreas = Array.from(new Set(logs.map((l) => l.user_area))).filter(Boolean)

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden rounded-xs">
        {/* Header */}
        <div className="bg-[#1A1A2E] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#2563EB] rounded-xs flex items-center justify-center text-white">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Histórico de Alterações & Auditoria da Equipe
              </h2>
              <span className="text-[11px] text-[#94A3B8]">
                Registro cronológico de quem editou o quê na nuvem
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[#2D2D44] text-white rounded-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-3 bg-[#FAFAFA] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#94A3B8]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por usuário ou ação..."
                className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:outline-none rounded-xs"
              />
            </div>

            {uniqueAreas.length > 0 && (
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="h-8 px-2 text-xs bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:outline-none rounded-xs"
              >
                <option value="all">Todas as Áreas ({logs.length})</option>
                {uniqueAreas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </div>

          <span className="text-[11px] text-[#64748B] font-semibold">
            {filteredLogs.length} registro(s)
          </span>
        </div>

        {/* Log Entries List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 divide-y divide-[#F1F5F9]">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="pt-2.5 first:pt-0 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[#0F172A] flex items-center gap-1">
                    <User className="w-3 h-3 text-[#2563EB]" />
                    {log.user_name}
                  </span>

                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] rounded-xs flex items-center gap-1">
                    <Building className="w-2.5 h-2.5" />
                    {log.user_area}
                  </span>

                  {log.entity_name && (
                    <span className="text-[10px] font-mono-data bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded-xs">
                      {log.entity_name}
                    </span>
                  )}
                </div>

                <p className="text-[#334155] font-medium leading-tight">{log.action}</p>

                {log.details && (
                  <p className="text-[11px] text-[#64748B] italic">{log.details}</p>
                )}
              </div>

              <span className="text-[10px] text-[#94A3B8] font-mono-data shrink-0 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {formatTime(log.timestamp)}
              </span>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="py-12 text-center text-[#94A3B8] space-y-1">
              <ShieldCheck className="w-8 h-8 text-[#CBD5E1] mx-auto mb-1" />
              <p className="text-xs font-semibold text-[#475569]">Nenhum registro encontrado</p>
              <p className="text-[11px]">As alterações feitas pela equipe aparecerão aqui.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#FAFAFA] border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] shrink-0">
          <span>Persistência na Nuvem ativa • Supabase Cloud PostgreSQL</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-xs font-semibold rounded-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
