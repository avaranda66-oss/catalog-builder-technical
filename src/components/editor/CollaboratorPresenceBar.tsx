import React, { useState, useEffect, useRef } from 'react';
import { usePresenceStore } from '../../stores/usePresenceStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { Users, Eye, Edit3, ChevronDown, Wifi } from 'lucide-react';

export const CollaboratorPresenceBar: React.FC = () => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentCatalog = useCatalogStore((state) => state.currentCatalog);
  const editorContext = useCatalogStore((state) => state.editorContext);
  const activePageIndex = useCatalogStore((state) => state.activePageIndex);
  const selectedBlockId = useCatalogStore((state) => state.selectedBlockId);

  const {
    presenceStatus,
    currentSession,
    initializePresence,
    trackLocation,
    getRemoteParticipants
  } = usePresenceStore();

  const remoteParticipants = getRemoteParticipants();
  const totalCount = (currentSession ? 1 : 0) + remoteParticipants.length;
  const isTemplate = editorContext?.kind === 'template';

  // Fecha o popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopoverOpen]);

  // Inicializa ou atualiza presença quando o catálogo muda
  useEffect(() => {
    if (currentCatalog?.id) {
      const activePage = currentCatalog.pages[activePageIndex];
      initializePresence(currentCatalog.id, activePageIndex + 1, activePage?.id);
    }
  }, [currentCatalog?.id, initializePresence]);

  // Atualiza a localização (página/bloco) do usuário local
  useEffect(() => {
    if (currentCatalog?.id && presenceStatus === 'connected') {
      const activePage = currentCatalog.pages[activePageIndex];
      const selectedBlock = activePage?.blocks?.find((b) => b.id === selectedBlockId);
      trackLocation(
        activePageIndex + 1,
        activePage?.id,
        selectedBlockId,
        selectedBlock?.type
      );
    }
  }, [currentCatalog?.id, activePageIndex, selectedBlockId, presenceStatus, trackLocation]);

  if (!currentCatalog) return null;

  return (
    <div className="relative inline-flex items-center no-print" ref={popoverRef}>
      {/* Botão Principal da Barra de Presença */}
      <button
        onClick={() => setIsPopoverOpen((prev) => !prev)}
        className="flex items-center gap-2 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md text-xs transition-colors shadow-2xs group"
        title="Colaboradores conectados neste catálogo em tempo real"
      >
        {/* Indicador de Status Realtime */}
        <span className="flex h-2 w-2 relative">
          {presenceStatus === 'connected' ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-300"></span>
          )}
        </span>

        {/* Pilha de Avatares dos Participantes */}
        <div className="flex items-center -space-x-1.5">
          {currentSession && (
            <div
              className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center border-2 border-white shadow-2xs"
              style={{ backgroundColor: currentSession.color }}
              title={`${currentSession.displayLabel} (Você)`}
            >
              {currentSession.avatarText}
            </div>
          )}

          {remoteParticipants.slice(0, 3).map((p) => (
            <div
              key={p.presenceKey}
              className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center border-2 border-white shadow-2xs"
              style={{ backgroundColor: p.color }}
              title={`${p.displayLabel} (Folha ${p.pageNumber})`}
            >
              {p.avatarText}
            </div>
          ))}

          {remoteParticipants.length > 3 && (
            <div className="w-5 h-5 rounded-full text-[9px] font-bold bg-slate-200 text-slate-700 flex items-center justify-center border-2 border-white shadow-2xs">
              +{remoteParticipants.length - 3}
            </div>
          )}
        </div>

        {/* Label de Contagem e Detalhes */}
        <div className="flex items-center gap-1 font-medium text-slate-700">
          <Users className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
          <span>
            {totalCount === 1
              ? '1 participante'
              : `${totalCount} colaboradores`}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
        </div>
      </button>

      {/* Popover Detalhado de Participantes */}
      {isPopoverOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-300 p-3.5 z-[100] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-150">
            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              Presença em Tempo Real
            </span>
            <span className="text-[10.5px] font-mono text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
              {totalCount} ativo(s)
            </span>
          </div>

          {/* Contexto do Documento Ativo */}
          <div className="text-[10.5px] text-slate-600 font-medium mb-2.5 pb-1.5 border-b border-slate-100 flex items-center justify-between">
            <span className="truncate max-w-[200px]">
              <strong className={isTemplate ? 'text-purple-800' : 'text-[#003366]'}>
                {isTemplate ? 'Template:' : 'Catálogo:'}
              </strong>{' '}
              {currentCatalog?.title}
            </span>
            <span className="font-mono text-slate-400 text-[10px]">v{currentCatalog?.version || 1}</span>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {/* Sessão Local (Você) */}
            {currentSession && (
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-150 text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-2xs"
                    style={{ backgroundColor: currentSession.color }}
                  >
                    {currentSession.avatarText}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-1">
                      <span>{currentSession.displayLabel}</span>
                      <span className="text-[10px] font-normal text-slate-500 bg-white px-1 py-0.2 rounded border border-slate-200">
                        você
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Folha {currentSession.pageNumber}
                      {currentSession.blockType ? ` · ${currentSession.blockType}` : ''}
                    </div>
                  </div>
                </div>

                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  <Eye className="w-3 h-3 text-emerald-600" />
                  Ativo
                </span>
              </div>
            )}

            {/* Participantes Remotos */}
            {remoteParticipants.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-2 italic">
                Nenhum outro colaborador neste catálogo no momento.
              </p>
            ) : (
              remoteParticipants.map((p) => (
                <div
                  key={p.presenceKey}
                  className="flex items-center justify-between p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow-2xs"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.avatarText}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">
                        {p.displayLabel}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Folha {p.pageNumber}
                        {p.blockType ? ` · ${p.blockType}` : ''}
                      </div>
                    </div>
                  </div>

                  {p.activity === 'editing' ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 animate-pulse">
                      <Edit3 className="w-3 h-3 text-amber-600" />
                      Editando
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                      <Eye className="w-3 h-3 text-blue-600" />
                      Visualizando
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
