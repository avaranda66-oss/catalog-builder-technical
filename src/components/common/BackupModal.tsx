import React, { useState, useRef, useEffect } from 'react';
import { X, Download, Upload, CheckCircle2, AlertTriangle, Database, HardDrive, RefreshCw, Cloud, CloudUpload, CloudDownload } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { StorageService } from '../../services/storage.service';
import { SupabaseService } from '../../services/supabase.service';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const { products } = useLibraryStore();
  const { loadAllCatalogs, loadLatestCatalog } = useCatalogStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'cloud' | 'file'>('cloud');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<{ connected: boolean; url: string; error?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      SupabaseService.checkConnection().then(setCloudStatus);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // --- Sincronização Cloud (Supabase) ---
  const handlePushToCloud = async () => {
    setIsCloudSyncing(true);
    setStatusMessage(null);
    try {
      const currentProds = useLibraryStore.getState().products;
      const allCats = useCatalogStore.getState().savedCatalogs;
      const activeCat = useCatalogStore.getState().currentCatalog;
      const catalogsToPush = allCats.length > 0 ? allCats : (activeCat ? [activeCat] : []);

      const prodRes = await SupabaseService.pushProductsToCloud(currentProds);
      const catRes = await SupabaseService.pushCatalogsToCloud(catalogsToPush);

      if (prodRes.success && catRes.success) {
        setStatusMessage({
          type: 'success',
          text: `Sincronização concluída com sucesso! ${currentProds.length} produtos e ${catalogsToPush.length} catálogo(s) gravados no Supabase.`
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Aviso na sincronização: ${prodRes.message || catRes.message}`
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro ao enviar dados para a nuvem: ${err.message}`
      });
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const handlePullFromCloud = async () => {
    setIsCloudSyncing(true);
    setStatusMessage(null);
    try {
      const prodRes = await SupabaseService.pullProductsFromCloud();
      const catRes = await SupabaseService.pullCatalogsFromCloud();

      let msg = '';
      if (prodRes.success && prodRes.products.length > 0) {
        await StorageService.saveProducts(prodRes.products);
        useLibraryStore.setState({ products: prodRes.products });
        msg += `${prodRes.products.length} produtos atualizados da nuvem. `;
      }

      if (catRes.success && catRes.catalogs.length > 0) {
        for (const cat of catRes.catalogs) {
          await StorageService.saveCatalog(cat);
        }
        await loadAllCatalogs();
        await loadLatestCatalog();
        msg += `${catRes.catalogs.length} catálogo(s) sincronizados.`;
      }

      if (msg) {
        setStatusMessage({ type: 'success', text: `Dados baixados com sucesso! ${msg}` });
      } else {
        setStatusMessage({ type: 'success', text: 'Banco na nuvem consultado (sem alterações pendentes).' });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro ao baixar dados da nuvem: ${err.message}`
      });
    } finally {
      setIsCloudSyncing(false);
    }
  };

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

        {/* Abas */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1">
          <button
            onClick={() => { setActiveTab('cloud'); setStatusMessage(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'cloud' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Nuvem (Supabase)</span>
          </button>
          <button
            onClick={() => { setActiveTab('file'); setStatusMessage(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'file' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Arquivo Local (.JSON)</span>
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              {/* Status de Conexão */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1 text-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-[#003366]">
                    <Cloud className="w-4 h-4 text-[#003366]" />
                    <span>Sincronização Multi-Dispositivo</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${
                      cloudStatus?.connected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {cloudStatus?.connected ? 'Supabase Conectado' : 'Aguardando Conexão'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  Sincronize a Biblioteca de Produtos e Catálogos no banco de dados na nuvem para que seu pai possa abrir e editar exatamente o mesmo trabalho no computador dele.
                </p>
                <span className="text-[10px] text-slate-400 font-mono block truncate">
                  URL: {cloudStatus?.url || 'https://bjxqvrpbigwgabwbhtqa.supabase.co'}
                </span>
              </div>

              {/* Botões de Ação Cloud */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block mb-1">Salvar na Nuvem (Push)</span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Envia seus <strong>{products.length} produtos</strong> e catálogos locais para o Supabase.
                    </p>
                  </div>

                  <button
                    onClick={handlePushToCloud}
                    disabled={isCloudSyncing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-xs transition-colors shadow-xs disabled:opacity-50"
                  >
                    {isCloudSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sincronizando...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4" />
                        <span>Enviar Dados p/ Nuvem</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between space-y-3">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block mb-1">Baixar da Nuvem (Pull)</span>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Recupera as últimas alterações feitas na nuvem e atualiza a base local.
                    </p>
                  </div>

                  <button
                    onClick={handlePullFromCloud}
                    disabled={isCloudSyncing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-bold text-xs transition-colors shadow-2xs disabled:opacity-50"
                  >
                    {isCloudSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Baixando...</span>
                      </>
                    ) : (
                      <>
                        <CloudDownload className="w-4 h-4 text-[#003366]" />
                        <span>Puxar Dados da Nuvem</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'file' && (
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
          )}

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
