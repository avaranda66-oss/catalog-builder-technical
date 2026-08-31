'use client'

import React, { useState } from 'react'
import { AuditLogItem } from '@/lib/types/auth-user'
import {
  History,
  X,
  User,
  Building,
  Clock,
  Search,
  ShieldCheck,
  Package,
  FileText,
  Sparkles,
  Palette,
  Layers,
  Trash2,
} from 'lucide-react'

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
  const [selectedType, setSelectedType] = useState<string>('all')

  if (!isOpen) return null

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.user_name.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (log.entity_name && log.entity_name.toLowerCase().includes(search.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(search.toLowerCase()))

    const matchesArea = selectedArea === 'all' || log.user_area === selectedArea
    const matchesType = selectedType === 'all' || log.entity_type === selectedType

    return matchesSearch && matchesArea && matchesType
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

  const getTypeBadge = (type: AuditLogItem['entity_type']) => {
    switch (type) {
      case 'product':
        return {
          icon: <Package className="w-3 h-3" />,
          label: 'Produto',
          bg: 'bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]',
        }
      case 'page':
        return {
          icon: <FileText className="w-3 h-3" />,
          label: 'Página A4',
          bg: 'bg-[#FAF5FF] text-[#6B21A8] border-[#E9D5FF]',
        }
      case 'pdf_import':
        return {
          icon: <Sparkles className="w-3 h-3" />,
          label: 'Importação PDF',
          bg: 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]',
        }
      case 'theme':
        return {
          icon: <Palette className="w-3 h-3" />,
          label: 'Tema & Estilo',
          bg: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
        }
      default:
        return {
          icon: <Layers className="w-3 h-3" />,
          label: 'Sistema',
          bg: 'bg-[#F8FAFC] text-[#475569] border-[#CBD5E1]',
        }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#FFFFFF] border-2 border-[#1A1A2E] shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden rounded-xs">
        {/* Header */}
        <div className="bg-[#1A1A2E] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#2563EB] rounded-xs flex items-center justify-center text-white shadow-md">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Histórico & Auditoria Detalhada da Equipe
              </h2>
              <span className="text-[11px] text-[#94A3B8]">
                Registro em tempo real de quem editou, criou ou excluiu cada item
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
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#94A3B8]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por produto, usuário ou detalhe..."
                className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:outline-none rounded-xs"
              />
            </div>

            {uniqueAreas.length > 0 && (
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="h-8 px-2 text-xs bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:outline-none rounded-xs"
              >
                <option value="all">Todas as Áreas</option>
                {uniqueAreas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-8 px-2 text-xs bg-white border border-[#CBD5E1] focus:border-[#2563EB] focus:outline-none rounded-xs"
            >
              <option value="all">Todos os Tipos</option>
              <option value="product">Produtos</option>
              <option value="page">Páginas A4</option>
              <option value="pdf_import">PDFs Importados</option>
              <option value="theme">Temas</option>
              <option value="general">Geral / Nuvem</option>
            </select>
          </div>

          <span className="text-[11px] text-[#64748B] font-semibold shrink-0">
            {filteredLogs.length} registro(s)
          </span>
        </div>

        {/* Log Entries List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {filteredLogs.map((log) => {
            const badge = getTypeBadge(log.entity_type)
            return (
              <div
                key={log.id}
                className="p-3 bg-[#FFFFFF] border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xs shadow-2xs space-y-1.5 transition-colors"
              >
                {/* Header Line */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#2563EB]" />
                      {log.user_name}
                    </span>

                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] rounded-xs flex items-center gap-1">
                      <Building className="w-2.5 h-2.5" />
                      {log.user_area}
                    </span>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 border rounded-xs flex items-center gap-1 ${badge.bg}`}
                    >
                      {badge.icon}
                      {badge.label}
                    </span>

                    {log.entity_name && (
                      <span className="text-[10px] font-mono-data font-bold bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1] px-1.5 py-0.5 rounded-xs">
                        {log.entity_name}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#94A3B8] font-mono-data shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#94A3B8]" />
                    {formatTime(log.timestamp)}
                  </span>
                </div>

                {/* Action Title */}
                <p className="text-xs font-semibold text-[#1E293B] leading-tight">
                  {log.action}
                </p>

                {/* Rich Details */}
                {log.details && (
                  <div className="p-2 bg-[#F8FAFC] border border-[#F1F5F9] rounded-xs text-[11px] text-[#475569] font-mono-data leading-normal">
                    {log.details}
                  </div>
                )}
              </div>
            )
          })}

          {filteredLogs.length === 0 && (
            <div className="py-12 text-center text-[#94A3B8] space-y-1.5">
              <ShieldCheck className="w-10 h-10 text-[#CBD5E1] mx-auto mb-1" />
              <p className="text-xs font-bold text-[#475569]">Nenhum registro no histórico</p>
              <p className="text-[11px] text-[#94A3B8]">
                Todas as edições da equipe serão detalhadas aqui automaticamente.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#FAFAFA] border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="text-[11px]">Banco Supabase Cloud PostgreSQL • Sincronizado</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1A1A2E] hover:bg-[#2D2D44] text-white text-xs font-bold rounded-xs cursor-pointer shadow-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
