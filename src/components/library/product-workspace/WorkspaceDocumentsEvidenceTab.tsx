// src/components/library/product-workspace/WorkspaceDocumentsEvidenceTab.tsx
// FASE 15 & PIM.PRODUCTION.CORE1.1: Documentos Fonte Reais, Evidências Manuais e Ingestão Assistida (Itens 5 e 10).
// Zero mocks em produção.

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Edit2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  Link as LinkIcon,
  Check,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  ExtractedDatumCandidate,
  SourceDocument,
  Evidence,
  attachEvidence,
  approveDatumCandidate,
  rejectDatumCandidate
} from '../../../domain/product-workbook';
import { Product } from '../../../domain/product.schema';
import {
  ProductSourceDocumentRepository,
  ProductWorkbookRepository
} from '../../../services/product-workbook/persistence.types';
import { SupabaseProductSourceDocumentRepository } from '../../../services/product-workbook/source-document.repository';
import { getSupabase } from '../../../services/supabase.service';

interface WorkspaceDocumentsEvidenceTabProps {
  workbook: ProductWorkbookV2;
  effectiveKnowledge: ResolvedProductKnowledge;
  onUpdateWorkbook: (updated: ProductWorkbookV2) => void;
  product?: Product;
  repository?: ProductWorkbookRepository;
  sourceDocRepository?: ProductSourceDocumentRepository;
}

export const WorkspaceDocumentsEvidenceTab: React.FC<WorkspaceDocumentsEvidenceTabProps> = ({
  workbook,
  effectiveKnowledge,
  onUpdateWorkbook,
  sourceDocRepository
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'source_docs' | 'evidence' | 'ingestion_queue'>('source_docs');

  // Repositório de Documentos Fonte
  const docRepo = sourceDocRepository || new SupabaseProductSourceDocumentRepository(getSupabase());

  // Lista de Documentos Fonte Reais
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Fila de candidatos de ingestão assistida (inicializada estritamente vazia em produção — PIM.PRODUCTION.CORE1.1)
  const [candidates, setCandidates] = useState<ExtractedDatumCandidate[]>([]);

  // Modais de Criação e Edição
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState<boolean>(false);
  const [editingDoc, setEditingDoc] = useState<SourceDocument | null>(null);
  const [isAttachEvidenceModalOpen, setIsAttachEvidenceModalOpen] = useState<boolean>(false);
  const [selectedDocForEvidence, setSelectedDocForEvidence] = useState<SourceDocument | null>(null);

  // Form states de Documento
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState<SourceDocument['documentType']>('manual');
  const [docRevision, setDocRevision] = useState('');
  const [docLanguage, setDocLanguage] = useState('pt-BR');
  const [docFileRef, setDocFileRef] = useState('');
  const [docExternalUrl, setDocExternalUrl] = useState('');

  // Form states de Evidência Manual (Item 10)
  const [evidenceDatumId, setEvidenceDatumId] = useState('');
  const [evidenceDocId, setEvidenceDocId] = useState('');
  const [evidencePage, setEvidencePage] = useState('');
  const [evidenceSection, setEvidenceSection] = useState('');
  const [evidenceLocator, setEvidenceLocator] = useState('');
  const [evidenceExcerpt, setEvidenceExcerpt] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [attachError, setAttachError] = useState<string | null>(null);

  // Carrega documentos fonte reais
  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    setDocsError(null);
    try {
      const list = await docRepo.listSourceDocuments();
      setDocuments(list);
    } catch (err: any) {
      // Falha silenciosa em dev se tabela ainda vazia ou offline
      setDocsError(err.message);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // Coleta todas as evidências registradas em todos os fatos do produto
  const allEvidence = Array.from(effectiveKnowledge.effectiveData.values()).flatMap((eff) =>
    eff.datum.evidence.map((ev) => ({
      ...ev,
      datumId: eff.datum.id,
      datumSemanticKey: eff.datum.semanticKey,
      datumLabel: eff.datum.label
    }))
  );

  // Salvar ou Criar Documento Fonte
  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) {
      alert('Informe o título do documento fonte.');
      return;
    }

    try {
      const docId = editingDoc ? editingDoc.id : `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const docToSave: SourceDocument = {
        id: docId,
        title: docTitle.trim(),
        documentType: docType,
        revision: docRevision.trim() || undefined,
        language: docLanguage.trim() || undefined,
        fileReference: docFileRef.trim() || undefined,
        externalUrl: docExternalUrl.trim() || undefined,
        metadata: editingDoc?.metadata ? { ...editingDoc.metadata } : {}
      };

      const saved = await docRepo.upsertSourceDocument(docToSave);
      setDocuments((prev) => {
        const idx = prev.findIndex((d) => d.id === saved.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = saved;
          return copy;
        }
        return [saved, ...prev];
      });

      setIsAddDocModalOpen(false);
      setEditingDoc(null);
      setDocTitle('');
      setDocRevision('');
      setDocFileRef('');
      setDocExternalUrl('');
    } catch (err: any) {
      alert(`Erro ao salvar documento fonte: ${err.message}`);
    }
  };

  // Abrir Modal de Edição de Documento
  const handleOpenEditDoc = (doc: SourceDocument) => {
    setEditingDoc(doc);
    setDocTitle(doc.title);
    setDocType(doc.documentType);
    setDocRevision(doc.revision || '');
    setDocLanguage(doc.language || 'pt-BR');
    setDocFileRef(doc.fileReference || '');
    setDocExternalUrl(doc.externalUrl || '');
    setIsAddDocModalOpen(true);
  };

  // Anexar Evidência Manual (Item 10)
  const handleAttachManualEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    setAttachError(null);

    const targetDocId = evidenceDocId || selectedDocForEvidence?.id;
    if (!targetDocId) {
      setAttachError('Selecione o documento fonte da evidência.');
      return;
    }

    if (!evidenceDatumId) {
      setAttachError('Selecione o dado técnico deste produto.');
      return;
    }

    try {
      const targetDatum = workbook.data[evidenceDatumId];
      if (!targetDatum) {
        setAttachError('Dado técnico selecionado não existe no workbook do produto.');
        return;
      }

      const newEvidence: Evidence = {
        id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sourceDocumentId: targetDocId,
        page: evidencePage.trim() || undefined,
        section: evidenceSection.trim() || undefined,
        locator: evidenceLocator.trim() || undefined,
        observedValue: targetDatum.value,
        excerpt: evidenceExcerpt.trim() || undefined,
        capturedAt: new Date().toISOString(),
        notes: evidenceNotes.trim() || undefined
      };

      const updatedWb = attachEvidence(workbook, evidenceDatumId, newEvidence);
      onUpdateWorkbook(updatedWb as ProductWorkbookV2);

      setIsAttachEvidenceModalOpen(false);
      setSelectedDocForEvidence(null);
      setEvidenceDatumId('');
      setEvidenceDocId('');
      setEvidencePage('');
      setEvidenceSection('');
      setEvidenceLocator('');
      setEvidenceExcerpt('');
      setEvidenceNotes('');
    } catch (err: any) {
      setAttachError(err.message);
    }
  };

  // Candidatos de Ingestão Assistida
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
        reviewerId: 'responsavel_tecnico'
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
      reviewerId: 'responsavel_tecnico'
    });
    setCandidates((prev) => prev.map((c) => (c.id === cand.id ? rejected : c)));
  };

  return (
    <div className="space-y-4">
      {/* Sub-navegação */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('source_docs')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'source_docs'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Documentos Fonte ({documents.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('evidence')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'evidence'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Evidências Vinculadas ({allEvidence.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('ingestion_queue')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'ingestion_queue'
                ? 'bg-[#003366] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Fila de Ingestão Assistida ({candidates.filter((c) => c.status === 'pending_review').length})</span>
          </button>
        </div>

        {activeSubTab === 'source_docs' && (
          <button
            onClick={() => {
              setEditingDoc(null);
              setDocTitle('');
              setDocRevision('');
              setDocFileRef('');
              setDocExternalUrl('');
              setIsAddDocModalOpen(true);
            }}
            className="px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Documento Fonte</span>
          </button>
        )}

        {activeSubTab === 'evidence' && (
          <button
            onClick={() => {
              setSelectedDocForEvidence(null);
              setIsAttachEvidenceModalOpen(true);
            }}
            className="px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Vincular Evidência Manual</span>
          </button>
        )}
      </div>

      {/* Sub-aba: Documentos Fonte (Source Documents Reais - Item 10) */}
      {activeSubTab === 'source_docs' && (
        <div className="space-y-3">
          {docsError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
              <span>{docsError}</span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-2.5 px-3">Título / Documento</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Revisão</th>
                  <th className="py-2.5 px-3">Idioma</th>
                  <th className="py-2.5 px-3">Referência / URL</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{doc.title}</div>
                      <div className="font-mono text-[10px] text-slate-400">{doc.id}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-bold">
                        {doc.documentType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {doc.revision || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {doc.language || 'pt-BR'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                      {doc.externalUrl ? (
                        <a
                          href={doc.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <span className="truncate">{doc.externalUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        doc.fileReference || '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedDocForEvidence(doc);
                            setEvidenceDocId(doc.id);
                            setIsAttachEvidenceModalOpen(true);
                          }}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#003366] rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Anexar evidência deste documento a um dado do produto"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>Vincular Evidência</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditDoc(doc)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                          title="Editar metadados do documento"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {documents.length === 0 && !isLoadingDocs && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                      Nenhum documento fonte cadastrado. Clique em "+ Novo Documento Fonte" para adicionar manuais técnicos ou certificados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-aba: Evidências Vinculadas (Item 10) */}
      {activeSubTab === 'evidence' && (
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
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900">{ev.datumLabel}</div>
                    <div className="font-mono text-[10px] text-slate-400">{ev.datumSemanticKey}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    {ev.sourceDocumentId}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {ev.page ? `Pág. ${ev.page}` : ''} {ev.section ? `· ${ev.section}` : ''} {ev.locator ? `· ${ev.locator}` : ''}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 italic max-w-sm">
                    "{ev.excerpt || 'Sem citação'}"
                  </td>
                  <td className="py-2.5 px-3 text-[11px] text-slate-400">
                    {ev.capturedAt ? new Date(ev.capturedAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}

              {allEvidence.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Nenhuma evidência documental anexada aos dados deste produto ainda.
                    Clique em "+ Vincular Evidência Manual" para citar fontes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub-aba: Fila de Ingestão Assistida (Item 5: Zero mocks) */}
      {activeSubTab === 'ingestion_queue' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Invariante de Segurança (EMENDA 13):</strong> Zero Aprovação Automática.
              Sugestões extraídas de PDFs aguardam validação humana explícita antes de ingressarem no workbook técnico.
            </div>
          </div>

          <div className="space-y-2">
            {candidates.map((cand) => (
              <div
                key={cand.id}
                className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{cand.suggestedLabel}</span>
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {cand.suggestedSemanticKey}
                    </span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Confiança: {Math.round(cand.confidence * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Valor sugerido: <strong className="font-mono text-slate-800">{JSON.stringify(cand.suggestedValue)}</strong>
                  </div>
                  {cand.excerpt && (
                    <div className="mt-1 text-[11px] text-slate-500 italic">
                      "{cand.excerpt}"
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRejectCandidate(cand)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rejeitar</span>
                  </button>
                  <button
                    onClick={() => handleApproveCandidate(cand)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Aprovar para o Catálogo</span>
                  </button>
                </div>
              </div>
            ))}

            {candidates.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 italic text-xs">
                Nenhuma sugestão pendente de revisão na fila de ingestão assistida.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Adicionar / Editar Documento Fonte (Item 10) */}
      {isAddDocModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#003366]" />
                <h3 className="text-xs font-bold text-slate-800">
                  {editingDoc ? 'Editar Documento Fonte' : 'Cadastrar Documento Fonte'}
                </h3>
              </div>
              <button onClick={() => setIsAddDocModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveDocument} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título do Documento *</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="Ex: Manual de Operação e Calibração TA-500"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:border-[#003366] focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Documento</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                  >
                    <option value="manual">Manual Técnico</option>
                    <option value="datasheet">Folha de Dados (Datasheet)</option>
                    <option value="calibration_cert">Certificado de Calibração</option>
                    <option value="standard">Norma Técnica</option>
                    <option value="catalog">Catálogo Comercial</option>
                    <option value="other">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Revisão</label>
                  <input
                    type="text"
                    value={docRevision}
                    onChange={(e) => setDocRevision(e.target.value)}
                    placeholder="Ex: Rev. 4.1"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Idioma</label>
                  <input
                    type="text"
                    value={docLanguage}
                    onChange={(e) => setDocLanguage(e.target.value)}
                    placeholder="Ex: pt-BR"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Referência de Arquivo</label>
                  <input
                    type="text"
                    value={docFileRef}
                    onChange={(e) => setDocFileRef(e.target.value)}
                    placeholder="Ex: s3://docs/manual.pdf"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">URL Externa</label>
                <input
                  type="text"
                  value={docExternalUrl}
                  onChange={(e) => setDocExternalUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddDocModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Documento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Associar Evidência a Datum (Item 10) */}
      {isAttachEvidenceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-[#003366]" />
                <h3 className="text-xs font-bold text-slate-800">
                  Vincular Evidência Documental Manual (PIM Core 1.1)
                </h3>
              </div>
              <button onClick={() => setIsAttachEvidenceModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleAttachManualEvidence} className="p-4 space-y-3.5 text-xs">
              {attachError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{attachError}</span>
                </div>
              )}

              {/* Seleção do Documento Fonte */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Documento Fonte *
                </label>
                <select
                  value={evidenceDocId || selectedDocForEvidence?.id || ''}
                  onChange={(e) => setEvidenceDocId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                >
                  <option value="">Selecione um documento fonte...</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} {doc.revision ? `(${doc.revision})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seleção do Dado Técnico do Produto */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Dado Técnico deste Produto *
                </label>
                <select
                  value={evidenceDatumId}
                  onChange={(e) => setEvidenceDatumId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                >
                  <option value="">Selecione o dado técnico para anexar a evidência...</option>
                  {Object.values(workbook.data).map((datum) => (
                    <option key={datum.id} value={datum.id}>
                      {datum.label} ({datum.semanticKey})
                    </option>
                  ))}
                </select>
              </div>

              {/* Localizadores da Evidência */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Página</label>
                  <input
                    type="text"
                    value={evidencePage}
                    onChange={(e) => setEvidencePage(e.target.value)}
                    placeholder="Ex: 14"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Seção</label>
                  <input
                    type="text"
                    value={evidenceSection}
                    onChange={(e) => setEvidenceSection(e.target.value)}
                    placeholder="Ex: 3.2 Incerteza"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Localizador Exato</label>
                  <input
                    type="text"
                    value={evidenceLocator}
                    onChange={(e) => setEvidenceLocator(e.target.value)}
                    placeholder="Ex: Tabela 2, Linha 4"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
              </div>

              {/* Trecho Citado */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Trecho Citado (Excerpt)</label>
                <textarea
                  rows={2}
                  value={evidenceExcerpt}
                  onChange={(e) => setEvidenceExcerpt(e.target.value)}
                  placeholder="Trecho exato do texto do manual ou relatório"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              {/* Notas de Auditoria */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notas de Engenharia (opcional)</label>
                <input
                  type="text"
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  placeholder="Ex: Conferido conforme calibração de fábrica"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAttachEvidenceModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Vincular Evidência</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
