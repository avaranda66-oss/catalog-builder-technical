// src/components/library/product-workspace/WorkspaceDocumentsEvidenceTab.tsx
// FASE 15 & EMENDA 13: Tab Documentos Fonte, Evidências e Fila de Ingestão Assistida

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  ExtractedDatumCandidate,
  approveDatumCandidate,
  rejectDatumCandidate
} from '../../../domain/product-workbook';

interface WorkspaceDocumentsEvidenceTabProps {
  workbook: ProductWorkbookV2;
  effectiveKnowledge: ResolvedProductKnowledge;
  onUpdateWorkbook: (updated: ProductWorkbookV2) => void;
}

export const WorkspaceDocumentsEvidenceTab: React.FC<WorkspaceDocumentsEvidenceTabProps> = ({
  workbook,
  effectiveKnowledge,
  onUpdateWorkbook
}) => {
  // Mock ou fila local de candidatos de ingestão assistida (EMENDA 13)
  const [candidates, setCandidates] = useState<ExtractedDatumCandidate[]>([
    {
      id: 'cand_demo_1',
      jobId: 'job_pdf_001',
      sourceDocumentId: 'doc_manual_fabrica',
      suggestedSemanticKey: 'metrology.temperature.stability',
      suggestedLabel: 'Estabilidade Térmica (Ensaio Oficial)',
      suggestedValue: { type: 'text', value: '±0.015 °C' },
      confidence: 0.96,
      page: 14,
      section: 'Tabela 4.2',
      locator: 'Página 14, Linha 3',
      excerpt: 'Estabilidade medida a 50 °C em poço seco: ±0.015 °C por 30 minutos',
      status: 'pending_review'
    }
  ]);

  const [activeSubTab, setActiveSubTab] = useState<'evidence' | 'ingestion_queue'>('evidence');

  // Coleta todas as evidências registradas em todos os fatos do produto
  const allEvidence = Array.from(effectiveKnowledge.effectiveData.values()).flatMap((eff) =>
    eff.datum.evidence.map((ev) => ({
      ...ev,
      datumSemanticKey: eff.datum.semanticKey,
      datumLabel: eff.datum.label
    }))
  );

  const handleApproveCandidate = (cand: ExtractedDatumCandidate) => {
    if (effectiveKnowledge.modules.length === 0) {
      alert('Nenhum módulo técnico disponível.');
      return;
    }
    const targetMod = effectiveKnowledge.modules[0];
    try {
      const { updatedWorkbook, updatedCandidate } = approveDatumCandidate({
        candidate: cand,
        targetWorkbook: workbook,
        targetModuleId: targetMod.id,
        reviewerId: 'usuário_atual'
      });
      onUpdateWorkbook(updatedWorkbook);
      setCandidates((prev) => prev.map((c) => (c.id === cand.id ? updatedCandidate : c)));
    } catch (err: any) {
      alert(`Erro ao aprovar candidato: ${err.message}`);
    }
  };

  const handleRejectCandidate = (cand: ExtractedDatumCandidate) => {
    const reason = prompt('Motivo da rejeição:', 'Dado inconsistente com o manual técnico');
    if (!reason) return;
    const rejected = rejectDatumCandidate({
      candidate: cand,
      rejectionReason: reason,
      reviewerId: 'usuário_atual'
    });
    setCandidates((prev) => prev.map((c) => (c.id === cand.id ? rejected : c)));
  };

  return (
    <div className="space-y-4">
      {/* Sub-navegação */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('evidence')}
          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
            activeSubTab === 'evidence'
              ? 'bg-[#003366] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Evidências Ativas ({allEvidence.length})
        </button>
        <button
          onClick={() => setActiveSubTab('ingestion_queue')}
          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'ingestion_queue'
              ? 'bg-[#003366] text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Fila de Ingestão Assistida ({candidates.filter((c) => c.status === 'pending_review').length})</span>
        </button>
      </div>

      {activeSubTab === 'evidence' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                <th className="py-2.5 px-3">Dado Técnico</th>
                <th className="py-2.5 px-3">Documento Fonte</th>
                <th className="py-2.5 px-3">Localizador / Citação</th>
                <th className="py-2.5 px-3">Trecho Citado (Excerpt)</th>
                <th className="py-2.5 px-3">Capturado Em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allEvidence.map((ev, idx) => (
                <tr key={`${ev.id}-${idx}`} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3">
                    <div className="font-bold text-slate-900">{ev.datumLabel}</div>
                    <div className="font-mono text-[10px] text-slate-400">{ev.datumSemanticKey}</div>
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-700">
                    {ev.sourceDocumentId}
                  </td>
                  <td className="py-2 px-3 text-slate-600">
                    {ev.page ? `Pág. ${ev.page}` : ''} {ev.section ? `· ${ev.section}` : ''} {ev.locator ? `· ${ev.locator}` : ''}
                  </td>
                  <td className="py-2 px-3 text-slate-700 italic max-w-sm">
                    "{ev.excerpt || 'Sem trecho'}"
                  </td>
                  <td className="py-2 px-3 text-[11px] text-slate-400">
                    {ev.capturedAt ? new Date(ev.capturedAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}

              {allEvidence.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Nenhuma evidência documental anexada aos dados deste produto ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Invariante de Segurança (EMENDA 13):</strong> Zero Aprovação Automática.
              Sugestões extraídas de PDFs aguardam validação de engenharia antes de entrarem no catálogo.
            </div>
          </div>

          <div className="space-y-2">
            {candidates.map((cand) => (
              <div
                key={cand.id}
                className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{cand.suggestedLabel}</span>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {cand.suggestedSemanticKey}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                      {Math.round(cand.confidence * 100)}% confiança
                    </span>
                  </div>

                  <div className="text-xs text-slate-700">
                    Valor sugerido:{' '}
                    <strong className="font-mono font-bold text-slate-900">
                      {(cand.suggestedValue as any).value || (cand.suggestedValue as any).amount}
                    </strong>
                  </div>

                  <p className="text-[11px] text-slate-500 italic">
                    "{cand.excerpt}" — {cand.sourceDocumentId} (Pág. {cand.page})
                  </p>
                </div>

                {cand.status === 'pending_review' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRejectCandidate(cand)}
                      className="px-3 py-1.5 border border-slate-300 text-rose-600 hover:bg-rose-50 rounded text-xs font-bold flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Rejeitar
                    </button>
                    <button
                      onClick={() => handleApproveCandidate(cand)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Aprovar Fato
                    </button>
                  </div>
                ) : (
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    cand.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {cand.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
