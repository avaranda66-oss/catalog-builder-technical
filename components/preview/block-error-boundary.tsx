'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  blockTitle?: string
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class BlockErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[BlockErrorBoundary caught an error]:', error, errorInfo)
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          role="alert"
          aria-label={`Erro ao renderizar bloco ${this.props.blockTitle || ''}`}
          className="p-3 my-2 border border-dashed border-[#EF4444] bg-[#FEF2F2] text-[#991B1B] text-xs rounded-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
            <div>
              <span className="font-bold block">
                Erro ao renderizar bloco: {this.props.blockTitle || 'Bloco Técnico'}
              </span>
              <span className="text-[10px] text-[#B91C1C] font-mono-data">
                {this.state.error?.message || 'Dados incompatíveis com o formato do bloco.'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={this.handleRetry}
            className="flex items-center gap-1 px-2 py-1 bg-white border border-[#FECACA] hover:bg-[#FEE2E2] text-[#991B1B] text-[11px] font-semibold"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar Novamente
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
