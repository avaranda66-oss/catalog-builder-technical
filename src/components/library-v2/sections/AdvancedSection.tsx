// src/components/library-v2/sections/AdvancedSection.tsx
// Seção 8 da Library V2: Modo Avançado de Engenharia (Transparência Técnica).

import React from 'react';
import { ContextHelpTrigger, TermHelp } from '../../guided-help/index';
import { Database } from 'lucide-react';

export interface AdvancedSectionProps {
  currentFamily: string;
}

export const AdvancedSection: React.FC<AdvancedSectionProps> = ({ currentFamily: _currentFamily }) => {
  const semanticRegistryItems = [
    {
      semanticKey: 'metrology.temperature.range',
      label: 'Faixa de Temperatura',
      valueType: 'range (°C)',
      ownerKind: 'family (com override no TA-25N)',
      stability: 'Canônico Estável'
    },
    {
      semanticKey: 'metrology.accuracy',
      label: 'Exatidão Instrumental',
      valueType: 'quantity (± °C)',
      ownerKind: 'family',
      stability: 'Canônico Estável'
    },
    {
      semanticKey: 'metrology.stability',
      label: 'Estabilidade Térmica',
      valueType: 'quantity (± °C)',
      ownerKind: 'family',
      stability: 'Canônico Estável'
    },
    {
      semanticKey: 'electrical.power_supply',
      label: 'Tensão de Alimentação',
      valueType: 'text',
      ownerKind: 'family',
      stability: 'Canônico Estável'
    },
    {
      semanticKey: 'electrical.communication',
      label: 'Porta de Comunicação',
      valueType: 'text',
      ownerKind: 'family',
      stability: 'Canônico Estável'
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Engenharia & Arquitetura de Dados
            </span>
            <ContextHelpTrigger helpId="semantic-key" variant="subtle" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Transparência Técnica & Registro Semântico
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            O Modo Avançado não cria regras secretas: ele revela a identidade imutável das{' '}
            <TermHelp helpId="semantic-key" label="Chaves Semânticas" /> que alimentam integrações e catálogos.
          </p>
        </div>
      </div>

      {/* Tabela do Registro Semântico */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <Database size={16} className="text-indigo-600" />
            <span>Mapeamento Semântico Canônico ({semanticRegistryItems.length})</span>
          </span>
          <span className="text-xs text-indigo-600 font-mono font-semibold">Integridade: 100% OK</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold font-mono">
                <th className="p-3">Chave Semântica (CPF)</th>
                <th className="p-3">Rótulo Humano</th>
                <th className="p-3">Tipo do Valor</th>
                <th className="p-3">Escopo Resolvido</th>
                <th className="p-3 text-right">Estabilidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {semanticRegistryItems.map((item) => (
                <tr key={item.semanticKey} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3 text-indigo-700 font-bold">{item.semanticKey}</td>
                  <td className="p-3 font-sans font-semibold text-slate-800">{item.label}</td>
                  <td className="p-3 text-slate-600">{item.valueType}</td>
                  <td className="p-3 text-slate-600 font-sans">{item.ownerKind}</td>
                  <td className="p-3 text-right text-emerald-600 font-bold font-sans">
                    {item.stability}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
