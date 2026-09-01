import React, { useState } from 'react';
import {
  Table2,
  FileText,
  Printer,
  HardDrive,
  BookOpen,
  CheckCircle2,
  RefreshCw,
  Image
} from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useMediaStore } from '../../stores/useMediaStore';
import { PresetModal } from '../editor/PresetModal';
import { BackupModal } from './BackupModal';

export const Navbar: React.FC = () => {
  const { activeTab, setActiveTab, setExportPDFModalOpen } = useUIStore();
  const { isSaving, lastSavedAt } = useCatalogStore();
  const { openGallery } = useMediaStore();

  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  return (
    <header className="h-12 bg-white border-b border-slate-300 px-4 flex items-center justify-between select-none z-30 flex-shrink-0">
      {/* Logotipo Corporativo e Identidade Técnica */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#003366] text-white flex items-center justify-center font-bold text-xs rounded border border-[#002244] shadow-xs">
            P
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-extrabold text-sm tracking-tight text-[#003366]">PRESYS</span>
              <span className="text-[11px] font-normal text-slate-500">| Catalog Studio</span>
            </div>
            <span className="text-[9px] text-slate-400 font-mono tracking-tight block">
              Sistema Editorial & Base Técnica
            </span>
          </div>
        </div>

        {/* Separador Vertical */}
        <div className="h-5 w-[1px] bg-slate-200" />

        {/* 3 Ambientes Principais do Produto */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === 'library'
                ? 'bg-slate-100 text-[#003366] border border-slate-300 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Biblioteca (Planilha)</span>
          </button>

          <button
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === 'editor'
                ? 'bg-slate-100 text-[#003366] border border-slate-300 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Studio A4 (Editor)</span>
          </button>

          <button
            onClick={() => setActiveTab('catalogs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTab === 'catalogs'
                ? 'bg-slate-100 text-[#003366] border border-slate-300 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Publicações & PDF</span>
          </button>
        </nav>
      </div>

      {/* Ações Técnicas e Status */}
      <div className="flex items-center gap-2.5">
        {/* Status de Salvamento */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200">
          {isSaving ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
              <span>Gravando alterações...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Salvo localmente {lastSavedAt ? `às ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
            </>
          )}
        </div>

        {/* Galeria de Fotos / Banco de Imagens */}
        <button
          onClick={() => openGallery(() => {})}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-2xs transition-colors"
          title="Abrir Banco Central de Imagens e Fotografias"
        >
          <Image className="w-3.5 h-3.5 text-[#003366]" />
          <span>Banco de Fotos</span>
        </button>

        {/* Modelos / Presets */}
        <button
          onClick={() => setIsPresetModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-2xs transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5 text-slate-600" />
          <span>Modelos</span>
        </button>

        {/* Backup / Portabilidade */}
        <button
          onClick={() => setIsBackupModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-2xs transition-colors"
        >
          <HardDrive className="w-3.5 h-3.5 text-slate-600" />
          <span>Backup / Sincronizar</span>
        </button>

        {/* Exportar PDF */}
        <button
          onClick={() => setExportPDFModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-[#003366] hover:bg-[#002244] rounded border border-[#002244] shadow-xs transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Gerar PDF</span>
        </button>
      </div>

      {/* Modais */}
      <PresetModal isOpen={isPresetModalOpen} onClose={() => setIsPresetModalOpen(false)} />
      <BackupModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} />
    </header>
  );
};
