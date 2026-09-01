import React, { useState, useRef } from 'react';
import { X, Download, Upload, CheckCircle2, AlertTriangle, Database, HardDrive, RefreshCw } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { StorageService } from '../../services/storage.service';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const { products } = useLibraryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  // --- Exportar Backup Completo ---
  const handleExportBackup = () => {
    try {
      const familyColsRaw = localStorage.getItem('cb_family_columns');
      const customPresetsRaw = localStorage.getItem('cb_custom_presets');

      const backupData = {
        app: 'PRESYS Catalog Builder',
        version: 1,
        brand: 'PRESYS Instrumentos e Sistemas',
        exportedAt: new Date().toISOString(),
        products: useLibraryStore.getState().products,
        familyColumns: familyColsRaw ? JSON.parse(familyColsRaw) : useLibraryStore.getState().familyColumns,
        currentCatalog: useCatalogStore.getState().currentCatalog,
        customPresets: customPresetsRaw ? JSON.parse(customPresetsRaw) : []
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `presys-workspace-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusMessage({
        type: 'success',
        text: 'Backup exportado com sucesso! Guarde este arquivo .json para restaurar em qualquer outro navegador ou computador.'
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: `Erro ao exportar backup: ${err.message}`
      });
    }
  };

  // --- Importar Backup ---
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);

        if (!data || (!data.products && !data.currentCatalog)) {
          throw new Error('Arquivo de backup inválido ou não reconhecido.');
        }

        // Restaura Produtos
        if (data.products && Array.isArray(data.products)) {
          await StorageService.saveProducts(data.products);
          useLibraryStore.setState({ products: data.products });
        }

        // Restaura Colunas de Famílias
        if (data.familyColumns) {
          localStorage.setItem('cb_family_columns', JSON.stringify(data.familyColumns));
          useLibraryStore.setState({ familyColumns: data.familyColumns });
        }

        // Restaura Presets Personalizados
        if (data.customPresets && Array.isArray(data.customPresets)) {
          localStorage.setItem('cb_custom_presets', JSON.stringify(data.customPresets));
        }

        // Restaura Catálogo Ativo
        if (data.currentCatalog) {
          await StorageService.saveCatalog(data.currentCatalog);
          useCatalogStore.setState({ currentCatalog: data.currentCatalog });
        }

        setStatusMessage({
          type: 'success',
          text: `Backup importado com sucesso! ${data.products?.length || 0} produtos e catálogos restaurados no workspace.`
        });
      } catch (err: any) {
        console.error(err);
        setStatusMessage({
          type: 'error',
          text: `Falha ao importar arquivo de backup: ${err.message}`
        });
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Exportar & Importar Dados do Workspace</h2>
              <p className="text-[11px] text-slate-500 font-mono">PRESYS Instrumentos — Sincronização entre computadores</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-800">
                <p className="font-bold flex items-center gap-1.5 text-slate-900">
                  <HardDrive className="w-4 h-4 text-slate-600" />
                  <span>Portabilidade Offline em Arquivo</span>
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Exporte todo o seu trabalho em um arquivo <strong>.json</strong> para manter uma cópia física em pendrive ou e-mail.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Bloco de Exportação */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block mb-1">Exportar Save Completo</span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Gera um arquivo com {products.length} produtos e o catálogo ativo.
                    </p>
                  </div>

                  <button
                    onClick={handleExportBackup}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-900 hover:bg-[#003366] text-white rounded-lg font-semibold text-xs transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar Save (.JSON)</span>
                  </button>
                </div>

                {/* Bloco de Importação */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block mb-1">Importar de Arquivo</span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Carregue um arquivo <strong>.json</strong> exportado anteriormente.
                    </p>
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-bold text-xs transition-colors shadow-2xs disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Importando...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Carregar Arquivo (.JSON)</span>
                      </>
                    )}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportFile}
                    accept=".json,application/json"
                    className="hidden"
                  />
                </div>
              </div>
          </div>

          {/* Mensagens de Feedback */}
          {statusMessage && (
            <div
              className={`p-3 rounded-lg flex items-start gap-2 text-xs font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 flex justify-end bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-md"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
