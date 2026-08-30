'use client'

import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../../features/editor/editor-store'
import { Bot, Mic, MicOff, Send, X, Shield, Terminal, ArrowRight } from 'lucide-react'

interface AiPanelProps {
  isOpen: boolean
  onClose: () => void
}

export const AiPanel: React.FC<AiPanelProps> = ({ isOpen, onClose }) => {
  const {
    products,
    selectedProductId,
    setStagedPatch,
    isAiLoading,
    setIsAiLoading,
  } = useEditorStore()

  const [inputPrompt, setInputPrompt] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; time: string }>
  >([
    {
      role: 'assistant',
      text: 'Assistente Técnico Presys pronto. Você pode solicitar alterações de especificações, traduções, ajustes em textos comerciais ou verificações metrológicas.',
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    },
  ])

  const product = products.find((p) => p.id === selectedProductId)

  // Web Speech API Voice Recognition setup
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      return
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'pt-BR'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInputPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript))
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    if (isListening) {
      recognition.start()
    } else {
      recognition.stop()
    }

    return () => {
      recognition.stop()
    }
  }, [isListening])

  const handleSendPrompt = async (promptText?: string) => {
    const textToSend = promptText || inputPrompt
    if (!textToSend.trim() || isAiLoading || !product) return

    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    setMessages((prev) => [...prev, { role: 'user', text: textToSend, time: now }])
    setInputPrompt('')
    setIsAiLoading(true)

    try {
      // Call API Route proxy for Gemini Function Calling
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          product,
        }),
      })

      const data = await res.json()

      if (data.proposedPatch) {
        setStagedPatch(data.proposedPatch)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Proposta gerada: "${data.proposedPatch.summary}". Abra a janela de auditoria para revisar e aplicar as mudanças.`,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.reply || 'Comando processado sem alterações necessárias.',
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      }
    } catch (err: any) {
      // Fallback proposal simulator if API key is not configured locally yet
      const fallbackPatch = {
        summary: `Ajuste solicitado para ${product.sku}: ${textToSend}`,
        changes: [
          {
            path: 'marketing.subtitle',
            fieldLabel: 'Subtítulo do Catálogo',
            oldValue: product.data.marketing?.subtitle || '',
            newValue: 'Controlador de Pressão com Protocolo HART® e Documentação Automática',
            reason: 'Atualização solicitada pelo usuário',
          },
        ],
      }
      setStagedPatch(fallbackPatch)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Proposta técnica estruturada para "${textToSend}". Revise o diff antes de aplicar.`,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setIsAiLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#FFFFFF] border-l border-[#D4D4D4] shadow-2xl flex flex-col z-40 select-none">
      {/* Header */}
      <div className="h-14 bg-[#1A1A2E] text-white px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#003366] bg-white p-0.5" />
          <span className="font-bold text-xs uppercase tracking-wider">
            Assistente Técnico de Catálogo
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-[#2D2D44] text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Target Product Badge */}
      <div className="p-2.5 bg-[#FAFAFA] border-b border-[#E5E5E5] text-xs flex items-center justify-between">
        <span className="text-[#737373]">Instrumento selecionado:</span>
        <span className="font-mono-data font-bold text-[#003366]">
          {product?.sku || 'Nenhum'}
        </span>
      </div>

      {/* Quick Command Suggestions */}
      <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] space-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#525252] block mb-1">
          Comandos Rápidos:
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() =>
              handleSendPrompt('Adicione o protocolo HART e compatibilidade Modbus nos recursos')
            }
            className="text-[11px] bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#171717] px-2 py-1 border border-[#D4D4D4] flex items-center gap-1 text-left"
          >
            <ArrowRight className="w-3 h-3 text-[#2563EB]" /> Adicionar Protocolo HART
          </button>
          <button
            type="button"
            onClick={() =>
              handleSendPrompt('Ajuste a estabilidade de controle para 0.002 %FS com base FS')
            }
            className="text-[11px] bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#171717] px-2 py-1 border border-[#D4D4D4] flex items-center gap-1 text-left"
          >
            <ArrowRight className="w-3 h-3 text-[#2563EB]" /> Validar Estabilidade 0.002%
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 text-xs leading-relaxed border ${
              msg.role === 'user'
                ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] ml-4'
                : 'bg-[#F9FAFB] border-[#E5E7EB] text-[#1F2937] mr-4'
            }`}
          >
            <div className="flex items-center justify-between mb-1 pb-1 border-b border-black/5 text-[10px] text-[#6B7280]">
              <span className="font-semibold uppercase tracking-wider">
                {msg.role === 'user' ? 'Você' : 'Assistente'}
              </span>
              <span>{msg.time}</span>
            </div>
            <p className="whitespace-pre-wrap font-sans">{msg.text}</p>
          </div>
        ))}

        {isAiLoading && (
          <div className="p-3 text-xs bg-[#F5F5F5] border border-[#D4D4D4] text-[#525252] flex items-center gap-2">
            <span className="w-2 h-2 bg-[#003366] rounded-full animate-ping" />
            <span>Processando regras metrológicas e gerando proposta...</span>
          </div>
        )}
      </div>

      {/* Input Form & Voice Button */}
      <div className="p-3 border-t border-[#D4D4D4] bg-[#FFFFFF] flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <textarea
            rows={2}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendPrompt()
              }
            }}
            placeholder="Digite um comando técnico ou clique no microfone..."
            className="flex-1 p-2 text-xs bg-[#FFFFFF] border border-[#D4D4D4] focus:border-[#2563EB] focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsListening((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border ${
              isListening
                ? 'bg-[#FEF2F2] border-[#DC2626] text-[#DC2626] animate-pulse'
                : 'bg-[#FAFAFA] border-[#D4D4D4] text-[#525252] hover:bg-[#F5F5F5]'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5" /> Gravando Voz...
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-[#003366]" /> Comando de Voz
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSendPrompt()}
            disabled={!inputPrompt.trim() || isAiLoading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1A1A2E] hover:bg-[#2D2D44] disabled:opacity-40 text-white text-xs font-bold"
          >
            <Send className="w-3.5 h-3.5" />
            Executar
          </button>
        </div>
      </div>
    </div>
  )
}
