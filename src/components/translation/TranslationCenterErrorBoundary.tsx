// src/components/translation/TranslationCenterErrorBoundary.tsx
// ErrorBoundary corporativo local para isolar qualquer exceção do módulo de tradução e impedir White Screen global.

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { useTranslationStore } from '@/stores/useTranslationStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
  errorStack: string | null;
}

export class TranslationCenterErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: null,
    errorStack: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado na renderização do Translation Center.',
      errorStack: error?.stack || null
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TranslationCenterErrorBoundary] Exceção capturada no módulo de tradução:', {
      message: error?.message,
      componentStack: errorInfo?.componentStack
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorMessage: null, errorStack: null });
    try {
      useTranslationStore.getState().resetWorkflow();
    } catch {
      // Ignora falha de reset do store
    }
  };

  private handleClose = () => {
    this.setState({ hasError: false, errorMessage: null, errorStack: null });
    try {
      useTranslationStore.getState().closeModal();
    } catch {
      // Ignora falha de fechamento
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-rose-300 shadow-2xl w-full max-w-lg overflow-hidden rounded-none animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-rose-800 text-white">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-200" />
                <h3 className="text-sm font-bold tracking-tight">Central de Tradução — Recuperação de Falha</h3>
              </div>
              <button
                type="button"
                onClick={this.handleClose}
                className="p-1 text-rose-200 hover:text-white hover:bg-white/10 transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 text-rose-900">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Não foi possível carregar a Central de Tradução</p>
                  <p className="text-slate-600">
                    Ocorreu uma incompatibilidade na estrutura do documento aberto ou no motor de tradução. O seu catálogo original e a navegação permanecem 100% seguros e intactos.
                  </p>
                </div>
              </div>

              {this.state.errorMessage && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 break-words">
                  <span className="font-bold text-slate-500 block mb-0.5">Diagnóstico Técnico:</span>
                  {this.state.errorMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={this.handleClose}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="px-4 py-2 bg-[#003366] text-white hover:bg-[#002244] font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tentar Novamente</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
