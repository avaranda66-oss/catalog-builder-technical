import React, { useState } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronRight, X } from 'lucide-react';

export interface HumanFriendlyErrorBannerProps {
  title?: string;
  message: string;
  details?: string | Record<string, unknown> | Error | null;
  onRetry?: () => void | Promise<void>;
  onDismiss?: () => void;
  className?: string;
}

export const HumanFriendlyErrorBanner: React.FC<HumanFriendlyErrorBannerProps> = ({
  title = 'Não foi possível carregar os dados',
  message,
  details,
  onRetry,
  onDismiss,
  className = ''
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const isDev = Boolean(import.meta.env?.DEV);

  const handleRetry = async () => {
    if (!onRetry || isRetrying) return;
    try {
      setIsRetrying(true);
      await Promise.resolve(onRetry());
    } finally {
      setIsRetrying(false);
    }
  };

  const formatDetails = (): string => {
    if (!details) return '';
    if (typeof details === 'string') return details;
    if (details instanceof Error) {
      return isDev ? `${details.name}: ${details.message}\n${details.stack || ''}` : `${details.name}: ${details.message}`;
    }
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  };

  return (
    <div
      role="alert"
      className={`bg-rose-50 border-b border-rose-200 p-3 text-xs text-rose-900 shrink-0 shadow-xs ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-rose-900 text-xs">{title}</h4>
            <p className="text-rose-700 mt-0.5 leading-relaxed">{message}</p>

            {details && (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-800 hover:text-rose-950 underline cursor-pointer"
                >
                  {showDetails ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <span>{showDetails ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}</span>
                </button>

                {showDetails && (
                  <pre className="mt-1.5 p-2 bg-rose-100/80 border border-rose-200 rounded text-[10px] font-mono text-rose-950 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {formatDetails()}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={() => void handleRetry()}
              disabled={isRetrying}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Tentando...' : 'Tentar novamente'}</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 text-rose-500 hover:text-rose-800 rounded transition-colors"
              title="Fechar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
