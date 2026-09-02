import React, { useState } from 'react';
import {
  Table2,
  FileText,
  Printer,
  HardDrive,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Globe,
  AlertTriangle,
  LogOut
} from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useMediaStore } from '../../stores/useMediaStore';
import { PresetModal } from '../editor/PresetModal';
import { BackupModal } from './BackupModal';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTranslationStore } from '../../stores/useTranslationStore';
import { TranslationCenterModal } from '../translation/TranslationCenterModal';
import { TranslationCenterErrorBoundary } from '../translation/TranslationCenterErrorBoundary';

export const Navbar: React.FC = () => {
  const { activeTab, setActiveTab, setExportPDFModalOpen } = useUIStore();
  const { currentCatalog, syncStatus, syncError, serverSavedAt } = useCatalogStore();
  const { openGallery } = useMediaStore();
  const openTranslationCenter = useTranslationStore((state) => state.openModal);
  const role = useAuthStore((state) => state.role);
  const signOut = useAuthStore((state) => state.signOut);

  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  return (
    <header className="h-12 bg-white border-b border-slate-300 px-4 flex items-center justify-between select-none z-30 flex-shrink-0">
      {/* Corporate Logo & Technical Branding */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#003366] text-white flex items-center justify-center font-bold text-xs rounded-none border border-[#002244] shadow-xs">
            P
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-extrabold text-sm tracking-tight text-[#003366]">PRESYS</span>
              <span className="text-[11px] font-normal text-slate-500">| Catalog Studio</span>
            </div>
            <span className="text-[9px] text-slate-400 font-mono tracking-tight block">
              Technical Editorial & Publishing System
            </span>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-5 w-[1px] bg-slate-200" />

        {/* 3 Core Workspace Tabs */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
              activeTab === 'library'
                ? 'bg-slate-100 text-[#003366] border border-slate-300 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Library (Spreadsheet)</span>
          </button>

          <button
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
              activeTab === 'editor'
                ? 'bg-slate-100 text-[#003366] border border-slate-300 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>A4 Studio (Editor)</span>
          </button>

          <button
            onClick={() => setActiveTab('catalogs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold transition-colors ${
              activeTab === 'catalogs'
                ? 'bg-slate-100 text-[#003366] border border-slate-300 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Publications & PDF</span>
          </button>
        </nav>
      </div>

      {/* Technical Actions & Status */}
      <div className="flex items-center gap-2.5">
        {/* Sync Status / Conflito / Nuvem */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 border">
          {syncStatus === 'saving' && (
            <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 border-blue-200">
              <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
              <span>Sincronizando nuvem...</span>
            </div>
          )}
          {syncStatus === 'synced' && (
            <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Nuvem v{currentCatalog?.version || 1} {serverSavedAt ? `(${new Date(serverSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})` : ''}</span>
            </div>
          )}
          {syncStatus === 'dirty' && (
            <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Alterações pendentes...</span>
            </div>
          )}
          {syncStatus === 'conflict' && (
            <div className="flex items-center gap-1.5 text-red-700 bg-red-50 border-red-200 font-bold" title={syncError || 'Conflito de concorrência detectado'}>
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span>Conflito de Versão:</span>
              <button
                onClick={() => void useCatalogStore.getState().resolveConflictReloadServer()}
                className="underline text-[10px] text-blue-800 hover:text-blue-950 font-semibold"
                title="Recarrega o documento com a versão mais recente do servidor"
              >
                [Usar versão do servidor]
              </button>
              <button
                onClick={() => {
                  if (window.confirm('A versão remota no servidor será substituída pelas suas alterações locais. Deseja continuar?')) {
                    void useCatalogStore.getState().resolveConflictKeepLocal();
                  }
                }}
                className="underline text-[10px] text-red-800 hover:text-red-950 font-semibold"
                title="Substitui a versão remota pelas edições locais atuais"
              >
                [Manter minhas alterações]
              </button>
            </div>
          )}
          {syncStatus === 'offline' && (
            <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Modo Offline</span>
            </div>
          )}
        </div>

        <span className="hidden md:inline text-[11px] font-mono text-slate-600 border border-slate-200 bg-slate-50 px-2 py-1">
          {role === 'admin' ? 'Administrador' : 'Colaborador limitado'}
        </span>

        {/* AI Translation Center Trigger */}
        <button
          type="button"
          onClick={openTranslationCenter}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-none shadow-2xs transition-colors"
          title="Abrir Central de Tradução Editorial & Multilíngue (AI)"
        >
          <Globe className="w-3.5 h-3.5 text-[#003366]" />
          <span>Traduzir (AI)</span>
        </button>

        {/* Photo Bank / Media Central */}
        <button
          onClick={() => openGallery(() => {})}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-none shadow-2xs transition-colors"
          title="Open Central Photo Bank & Media Library"
        >
          <ImageIcon className="w-3.5 h-3.5 text-[#003366]" />
          <span>Photo Bank</span>
        </button>

        {/* Templates / Presets */}
        <button
          onClick={() => setIsPresetModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-none shadow-2xs transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5 text-slate-600" />
          <span>Templates</span>
        </button>

        {/* Backup / Cloud Sync */}
        <button
          onClick={() => setIsBackupModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-none shadow-2xs transition-colors"
        >
          <HardDrive className="w-3.5 h-3.5 text-slate-600" />
          <span>Backup local</span>
        </button>

        {/* Export PDF */}
        <button
          onClick={() => setExportPDFModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-[#003366] hover:bg-[#002244] rounded-none border border-[#002244] shadow-xs transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Export PDF</span>
        </button>

        {/* User Identity & Role Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-300 text-xs select-none">
          <span className="text-slate-700 font-mono text-[11px] truncate max-w-[150px]">{useAuthStore.getState().email || 'Usuário'}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${role === 'admin' ? 'bg-emerald-700 text-white' : 'bg-blue-700 text-white'}`}>
            {role === 'admin' ? 'Admin' : 'Colaborador'}
          </span>
        </div>

        <button
          onClick={() => void signOut()}
          className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-300 bg-white hover:bg-slate-100 transition-colors"
          title="Sair do sistema"
          aria-label="Sair"
        >
          <LogOut className="w-3.5 h-3.5 text-red-600" />
        </button>
      </div>

      {/* Modals */}
      <PresetModal isOpen={isPresetModalOpen} onClose={() => setIsPresetModalOpen(false)} />
      <BackupModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} />
      <TranslationCenterErrorBoundary>
        <TranslationCenterModal />
      </TranslationCenterErrorBoundary>
    </header>
  );
};
