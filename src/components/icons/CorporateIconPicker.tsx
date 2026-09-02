// src/components/icons/CorporateIconPicker.tsx
// Seletor Modal Controlado de Ícones Corporativos — PRESYS Catalog Studio (Fase 3A.3)
// Componente puro (controlled UI) sem dependência direta do Store. Suporta busca normalizada,
// categorização, indicador de seleção ativa, remoção de ícone e navegação acessível.

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Trash2, Check } from 'lucide-react';
import {
  CorporateIconCategory,
  CORPORATE_ICON_CATEGORIES,
  searchCorporateIcons,
  getCorporateIcon
} from './corporate-icon.registry';
import { CorporateIcon } from './CorporateIcon';

export interface CorporateIconPickerProps {
  isOpen: boolean;
  currentIconId?: string;
  onSelect: (iconId: string) => void;
  onClear: () => void;
  onClose: () => void;
  title?: string;
}

export const CorporateIconPicker: React.FC<CorporateIconPickerProps> = ({
  isOpen,
  currentIconId,
  onSelect,
  onClear,
  onClose,
  title = 'Biblioteca de Ícones Corporativos PRESYS'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CorporateIconCategory | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const prevIsOpenRef = useRef(false);

  // Focus capture e restoration ao abrir e fechar
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) {
        // Captura o elemento ativo como trigger antes de abrir
        triggerRef.current = (document.activeElement as HTMLElement) || null;
      }
      searchInputRef.current?.focus();
    } else if (!isOpen && prevIsOpenRef.current) {
      setSearchQuery('');
      setSelectedCategory('all');
      // Restaura o foco ao trigger anterior
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        if (document.body.contains(triggerRef.current)) {
          triggerRef.current.focus();
        }
      }
      triggerRef.current = null;
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Restauração defensiva no unmount se o componente for desmontado aberto
  useEffect(() => {
    return () => {
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        if (document.body.contains(triggerRef.current)) {
          triggerRef.current.focus();
        }
      }
    };
  }, []);

  // Keyboard navigation: Escape fecha e Tab/Shift+Tab mantém o foco confinado (Focus Trap)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;

        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Ícones filtrados pela combinação de busca e categoria
  const filteredIcons = useMemo(() => {
    return searchCorporateIcons(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  if (!isOpen) {
    return null;
  }

  const currentIconDef = getCorporateIcon(currentIconId);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="corporate-icon-picker-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. CABEÇALHO DO MODAL */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3
              id="corporate-icon-picker-title"
              className="text-sm font-bold text-[#003366] flex items-center gap-2"
            >
              <span>{title}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Selecione um símbolo semântico vetorial aprovado para o catálogo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar seletor de ícones"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. BARRA DE BUSCA E FILTROS */}
        <div className="p-4 border-b border-slate-200/80 bg-white space-y-3">
          {/* Input de Busca */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por símbolo ou função (ex: rede, manômetro, usb, temperatura)..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-[#003366] transition-all"
              aria-label="Buscar ícones"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                aria-label="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Abas de Categorias */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[#003366] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              Todas as Categorias
            </button>
            {CORPORATE_ICON_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-full font-medium transition-all shrink-0 cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-[#003366] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. GRID DE ÍCONES */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[260px] max-h-[380px] bg-slate-50/40">
          {filteredIcons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
              <Search className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">Nenhum ícone encontrado.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tente outros termos de busca ou selecione outra categoria.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="mt-3 text-xs text-[#003366] font-bold hover:underline cursor-pointer"
              >
                Limpar filtros de busca
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {filteredIcons.map((def) => {
                const isSelected = def.id === currentIconId;

                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => {
                      onSelect(def.id);
                      onClose();
                    }}
                    aria-label={`Selecionar ícone ${def.label}`}
                    className={`relative p-3 rounded-lg border text-center flex flex-col items-center justify-center gap-1.5 transition-all group cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-500 shadow-xs ring-2 ring-blue-600 ring-offset-1'
                        : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-blue-600 text-white rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                    <CorporateIcon
                      iconId={def.id}
                      context="picker"
                      size="lg"
                      className={`transition-transform group-hover:scale-110 ${
                        isSelected ? 'text-[#003366]' : 'text-slate-700'
                      }`}
                    />
                    <span
                      className={`text-[9.5px] font-medium leading-tight truncate w-full px-0.5 ${
                        isSelected ? 'text-[#003366] font-bold' : 'text-slate-600'
                      }`}
                      title={def.label}
                    >
                      {def.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. BARRA DE RODAPÉ */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentIconDef ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="text-[11px] text-slate-400">Atual:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  <CorporateIcon iconId={currentIconDef.id} size="xs" className="text-[#003366]" />
                  {currentIconDef.label}
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">Nenhum ícone selecionado</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentIconId && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remover Ícone</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-md transition-all cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
