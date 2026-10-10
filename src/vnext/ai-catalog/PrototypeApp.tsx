import React from 'react';
import { flushSync } from 'react-dom';
import { createDocumentSession } from '../application';
import { DocumentRenderer } from '../rendering';
import { reviewPublication, releasePublicationResources, type PublicationReviewResult, type PublicationSource } from '../publication/review';
import { PublicationReview } from '../app/PublicationReview';
import { publicationDiagnosticMessage, publicationDiagnosticLocation } from '../app/publication-diagnostic-presentation';
import { VNextApp } from '../app/VNextApp';
import { createSyntheticSpecifications } from './fixture';
import { reviewIssues, validateTechnicalInput, type TechnicalInput, type Decisions } from './contracts';
import { applyRefinement, approveGeneration, assertGeneratedIntegrity, compileCatalog, planMockRequest, proposeRefinement, type GeneratedCatalog, type Refinement } from './composition';
import { LocalGenerationRepository, type SavedGeneration } from './repository';
import { GeminiPlannerChat } from './GeminiPlannerChat';
import type { CatalogPlan } from './composition';
import { extractPdfText, type ExtractedPdf } from './pdf-intake';
import { ProviderCredentialsSettings } from './ProviderCredentialsSettings';
import type { CatalogAgentGateway } from './gemini-plan';
import '../app/styles.css';
import './prototype.css';

function CatalogPreview({ value }: { value: GeneratedCatalog }) {
  const root = React.useRef<HTMLDivElement>(null);
  const [preview, setPreview] = React.useState<PublicationReviewResult>();
  React.useEffect(() => {
    let cancelled = false, owned: PublicationReviewResult | undefined;
    void Promise.resolve().then(async () => {
      if (!root.current || cancelled) return;
      const source: PublicationSource = { document: value.document, openSessionId: 'local-preview', remoteRevision: 0, authLineage: 'synthetic-local', authorityScopeId: 'prototype', assetUrls: new Map() };
      const result = await reviewPublication(source, root.current, result => {
        if (!cancelled) flushSync(() => setPreview({ ...result }));
      }, () => !cancelled);
      if (cancelled) releasePublicationResources(result); else { owned = result; setPreview({ ...result }); }
    });
    return () => { cancelled = true; if (owned) releasePublicationResources(owned); };
  }, [value]);
  return <section aria-label="Prévia do catálogo"><p role="status" data-prototype-layout={preview?.snapshot ? preview.status : 'CHECKING'}>
    {!preview?.snapshot ? 'Medindo páginas e fontes…' : preview.status === 'READY' ? `${value.document.pages.length} páginas A4 verificadas. A aprovação técnica continua necessária.` : 'O conteúdo ultrapassa os limites físicos. A publicação ficará bloqueada.'}
  </p>{preview?.status === 'BLOCKED' && preview.diagnostics.length > 0 && <ul>{preview.diagnostics.map((item, index) => <li key={index} data-prototype-diagnostic={item.code}>{publicationDiagnosticLocation(value.document, item)}: {publicationDiagnosticMessage(item.code)}</li>)}</ul>}<div className="ai-pages" ref={root}>{preview && <DocumentRenderer document={preview.document} plans={preview.plans} assetUrls={preview.urls} />}</div></section>;
}

function ActiveCatalog({ active, repository, onLibrary }: { active: { value: GeneratedCatalog; saved?: SavedGeneration }; repository: LocalGenerationRepository; onLibrary: (value: GeneratedCatalog, saved?: SavedGeneration) => void }) {
  const [session] = React.useState(() => createDocumentSession(active.value.document, { createId: () => crypto.randomUUID() }));
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const value = React.useMemo(() => ({ ...active.value, document: snapshot.document }), [active.value, snapshot.document]);
  const [saved, setSaved] = React.useState(active.saved), [confirmed, setConfirmed] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [request, setRequest] = React.useState('Deixe mais compacto.'), [proposal, setProposal] = React.useState<Refinement>(), [message, setMessage] = React.useState('');
  const [publication, setPublication] = React.useState(false), [editor, setEditor] = React.useState(false);
  const matchesSaved = active.saved && JSON.stringify(active.saved.generation.document) === JSON.stringify(snapshot.document);
  const approvedDocument = React.useRef(matchesSaved ? snapshot.document : undefined);
  const approvedSequence = React.useRef(matchesSaved ? 0 : -1);
  const assets = React.useMemo(() => new Map<string, string>(), []);
  const current = Boolean(saved && approvedDocument.current === snapshot.document && approvedSequence.current === snapshot.localSequence);
  React.useEffect(() => { setConfirmed(false); }, [snapshot.localSequence]);
  const getSource = React.useCallback((): PublicationSource | undefined => {
    const now = session.getSnapshot();
    if (!saved || approvedDocument.current !== now.document || approvedSequence.current !== now.localSequence) return undefined;
    return { document: now.document, remoteRevision: saved.envelope.remoteRevision, openSessionId: 'prototype-' + now.document.id, authLineage: 'synthetic-local', authorityScopeId: 'prototype', assetUrls: assets };
  }, [session, saved, assets]);
  const save = async () => {
    setBusy(true); setMessage(''); const sequence = session.getSnapshot().localSequence;
    try {
      const approval = await approveGeneration(value);
      if (sequence !== session.getSnapshot().localSequence) throw new Error('STALE');
      await repository.stage(value, approval);
      const request = { mutationId: crypto.randomUUID(), documentSnapshot: value.document };
      const result = saved ? await repository.saveCAS({ ...request, catalogId: value.document.id, expectedRemoteRevision: saved.envelope.remoteRevision }) : await repository.createCatalog(request);
      if (!result.ok) throw new Error(result.error.code);
      const readback = await repository.getGeneration(value.document.id);
      if (sequence !== session.getSnapshot().localSequence) throw new Error('STALE');
      approvedDocument.current = snapshot.document; approvedSequence.current = sequence; setSaved(readback);
      setMessage('Versão aprovada salva neste navegador, com fontes e revisão.');
    } catch { setMessage('Não foi possível aprovar e salvar esta versão. Confira dados, origem e revisão; o catálogo anterior está preservado.'); }
    finally { setBusy(false); }
  };
  const propose = () => { try { const value = proposeRefinement(request); if (value !== 'compact') throw new Error('New plan needed'); setProposal(value); setMessage(''); } catch { setMessage('Este protótipo aceita “Deixe mais compacto”. Outros pedidos precisam de planejamento separado e não foram aplicados.'); } };
  return <>
    <div className="ai-actions"><button onClick={() => onLibrary(value, saved)} disabled={busy}>Library local</button><button onClick={() => { session.undo(); }} disabled={!snapshot.canUndo || busy}>Desfazer</button><button onClick={() => { session.redo(); }} disabled={!snapshot.canRedo || busy}>Refazer</button><button onClick={() => setEditor(!editor)}>Edição manual opcional</button></div>
    <h2>3. Revisar e publicar</h2><p>Confira valores, unidades, condições e as fontes. Uma mudança exige nova aprovação.</p>
    <label className="ai-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi os dados e a disposição das dúvidas desta versão</label>
    <div className="ai-actions"><button className="vnext-btn-primary" disabled={!confirmed || busy} onClick={() => { void save(); }}>Salvar versão aprovada</button><button disabled={!current || busy} onClick={() => setPublication(true)}>Revisar publicação / PDF</button></div>
    <p role="status">{message || (current ? 'Versão salva e aprovada.' : 'Esta versão precisa de aprovação e salvamento antes do PDF.')}</p>
    <section className="ai-card"><h3>Ajuste o resultado</h3><label>Pedido de ajuste<input value={request} onChange={event => { setRequest(event.target.value); setProposal(undefined); }} /></label><button disabled={busy} onClick={propose}>Preparar proposta</button>
      {proposal && <div className="ai-proposal"><p>Reduzir apenas o espaço interno das tabelas. Valores, unidades, fonte de 10 pt e páginas permanecem iguais. A aprovação atual será invalidada.</p><button disabled={busy} onClick={() => { applyRefinement(session, proposal); setProposal(undefined); }}>Aplicar proposta</button><button onClick={() => setProposal(undefined)}>Cancelar proposta</button></div>}
    </section>
    <Provenance value={value} />
    {editor ? <div className="ai-editor"><VNextApp session={session} /></div> : <CatalogPreview value={value} />}
    {publication && <PublicationReview getSource={getSource} subscribe={session.subscribe} onClose={() => setPublication(false)} />}
  </>;
}

function Provenance({ value }: { value: GeneratedCatalog }) {
  let trace: ReturnType<typeof assertGeneratedIntegrity>;
  try { trace = assertGeneratedIntegrity(value); } catch { return <p role="alert">Os dados foram alterados fora da proposta. Restaure a versão original para validar a proveniência.</p>; }
  return <details className="ai-card"><summary>Conferir origem dos {trace.length} valores técnicos</summary><table className="ai-trace"><thead><tr><th>Modelo / campo</th><th>Valor / unidade</th><th>Condição</th><th>Origem</th></tr></thead><tbody>{trace.map(item => <tr key={item.cellId}><td>{item.model} · {item.label}</td><td>{item.value || '(vazio legítimo)'} {item.unit}</td><td>{item.condition}</td><td>{item.source ? `${value.input.sources.find(source => source.id === item.source?.sourceId)?.name} · p. ${item.source.page}` : 'Ausente; não preenchido'}{item.source && <details><summary>Trecho literal</summary><pre>{item.source.quote}</pre></details>}</td></tr>)}</tbody></table></details>;
}

export function AiCatalogPrototypeApp({ gateway }: { gateway?: CatalogAgentGateway } = {}) {
  React.useEffect(() => {
    const previous = document.body.getAttribute('data-vnext-print-policy');
    document.body.setAttribute('data-vnext-print-policy', 'ai-original-prototype');
    return () => { if (previous === null) document.body.removeAttribute('data-vnext-print-policy'); else document.body.setAttribute('data-vnext-print-policy', previous); };
  }, []);
  const [repository] = React.useState(() => new LocalGenerationRepository(localStorage));
  const [step, setStep] = React.useState<'library' | 'intake' | 'proposal' | 'review'>('library');
  const [input, setInput] = React.useState<TechnicalInput>(), [candidate, setCandidate] = React.useState<GeneratedCatalog>();
  const [pdfDocuments, setPdfDocuments] = React.useState<ExtractedPdf[]>([]);
  const [active, setActive] = React.useState<{ value: GeneratedCatalog; saved?: SavedGeneration }>();
  const [savedItems, setSavedItems] = React.useState<{ id: string; title: string }[]>([]), [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false);
  const [request, setRequest] = React.useState('Crie uma comparação por seção.');
  const [chosenPlan, setChosenPlan] = React.useState<CatalogPlan>();
  const epoch = React.useRef(0);
  const library = React.useCallback(async () => { setStep('library'); const result = await repository.listCatalogs(); if (result.ok) setSavedItems(result.value.map(item => ({ id: item.catalogId, title: item.title }))); else setMessage('Um registro local não pôde ser verificado. Nenhum conteúdo foi substituído.'); }, [repository]);
  React.useEffect(() => { void library(); }, [library]);
  const generate = async (raw: unknown, decisions: Decisions = {}, explicitPlan?: CatalogPlan) => {
    const generation = ++epoch.current; setBusy(true); setMessage('');
    try {
      if (!request.trim()) throw new Error('EMPTY_REQUEST');
      const parsed = await validateTechnicalInput(raw);
      const value = await compileCatalog(parsed, explicitPlan ?? chosenPlan ?? planMockRequest(parsed, request), decisions);
      if (generation !== epoch.current) return;
      setCandidate(value); setStep('proposal');
    } catch (error) { setMessage(error instanceof Error && error.message === 'REQUEST_NOT_SUPPORTED' ? 'Pedido não suportado neste protótipo. Use “Crie uma comparação por seção” ou “Comece pelas especificações elétricas”. Nenhuma alteração aplicada.' : 'Material inválido ou fora do escopo sintético. Confira o arquivo; o catálogo anterior está preservado.'); }
    finally { if (generation === epoch.current) setBusy(false); }
  };
  const issues = candidate ? reviewIssues(candidate.input, candidate.decisions) : [];
  return <main className="ai-shell"><header className="ai-header"><div><p>PRESYS · Catalog Builder</p><h1>Criar com IA</h1></div><span className="vnext-badge">Protótipo local · geração simulada</span></header>
    <p className="ai-boundary">{"Demonstra\u00e7\u00e3o local: PDFs podem ser indexados neste navegador, mas extra\u00e7\u00e3o inteligente de tabelas e IA real ainda n\u00e3o est\u00e3o habilitadas. Nenhum PDF \u00e9 enviado ao provedor."}</p>
    {step !== 'library' && <ol className="ai-steps" aria-label="Etapas"><li>Fornecer materiais</li><li>Gerar catálogo</li><li>Revisar e publicar</li></ol>}
    {message && <p role="alert">{message}</p>}
    {step === 'library' && <section className="ai-card"><h2>Library local de demonstração</h2><p>Receba uma primeira versão completa e revise os dados antes do PDF.</p><button className="vnext-btn-primary" onClick={() => { setChosenPlan(undefined); setStep('intake'); setMessage(''); }}>Criar com IA</button>{active && <button onClick={() => setStep('review')}>Voltar ao catálogo em revisão</button>}<ul>{savedItems.map(item => <li key={item.id}>{item.title} <button onClick={() => { void repository.getGeneration(item.id).then(saved => { setActive({ value: saved.generation, saved }); setStep('review'); }).catch(() => setMessage('Registro ou aprovação inválidos; reabertura bloqueada.')); }}>Reabrir catálogo</button></li>)}</ul></section>}
    {step === 'library' && <details className="ai-card"><summary>Configurar provedores de IA no dispositivo</summary><ProviderCredentialsSettings /></details>}
    {step === 'intake' && <section className="ai-card"><h2>1. Fornecer materiais</h2><p>Use o conjunto original de exemplo: três instrumentos fictícios, duas seções técnicas e duas dúvidas para revisar.</p><div className="ai-actions"><button disabled={busy} onClick={() => { void createSyntheticSpecifications().then(setInput); }}>Usar especificações de exemplo</button><label>Arquivo de especificações sintéticas<input type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) { setInput(undefined); void file.text().then(text => validateTechnicalInput(JSON.parse(text))).then(setInput).catch(() => setMessage('Arquivo sintético inválido. Confira conteúdo, origem e hash; nenhum catálogo foi alterado.')); } }} /></label></div>
      <section className="ai-card" aria-label="Documentos PDF locais"><h3>Seus documentos técnicos</h3>
        <p>Selecione até cinco PDFs. A leitura é local e indica páginas que precisam de inspeção visual. Esta etapa ainda não gera fichas a partir dos PDFs automaticamente.</p>
        <label>Adicionar PDFs (leitura local)
          <input aria-label="Adicionar PDFs" type="file" accept=".pdf,application/pdf" multiple disabled={busy}
            onChange={event => {
              const selected = Array.from(event.target.files ?? []);
              if (!selected.length) return;
              if (selected.length > 5) { setMessage('Limite de cinco PDFs por análise. Nenhum arquivo foi processado.'); return; }
              setBusy(true); setMessage('Lendo os PDFs neste navegador, sem envio externo.');
              void Promise.all(selected.map(async file => extractPdfText(file.name, await file.arrayBuffer()))).then(results => {
                setPdfDocuments(results);
                const unreadable = results.reduce((count, pdf) => count + pdf.pages.filter(page => page.needsVisualExtraction).length, 0);
                setMessage(`${results.length} PDF(s) indexados neste navegador. ${unreadable} página(s) exigem inspeção visual. Extração de especificações por IA ainda não habilitada.`);
              }).catch(() => {
                setPdfDocuments([]);
                setMessage('Não foi possível analisar os arquivos. Confirme PDF válido, sem senha e menor que 50 MB.');
              }).finally(() => { setBusy(false); });
            }} />
        </label>
        {pdfDocuments.length > 0 && <ul data-pdf-index-summary>{pdfDocuments.map(pdf =>
          <li key={pdf.sha256}>{pdf.fileName}: {pdf.pageCount} páginas; {pdf.pages.filter(page => !page.needsVisualExtraction).length} com texto disponível; hash {pdf.sha256.slice(0, 12)}…
            {pdf.truncated ? ' (leitura limitada; revisar antes de usar)' : ''}
          </li>)}</ul>}
      </section>
      {input && <p>{input.models.join(' · ')} — {input.sections.reduce((count, section) => count + section.rows.length, 0)} características; {input.sources.length} fontes identificadas.</p>}
      <label>Descreva o catálogo<textarea value={request} onChange={event => { setRequest(event.target.value); setChosenPlan(undefined); }} rows={3} /></label>
      {input && import.meta.env.VITE_VNEXT_CATALOG_AGENT_ENABLED === 'true' && gateway &&
        <GeminiPlannerChat input={input} gateway={gateway}
          onApprove={(plan, prompt) => { setChosenPlan(plan); setRequest(prompt); void generate(input, {}, plan); }} />}<p>Pedidos simulados disponíveis: “Crie uma comparação por seção” ou “Comece pelas especificações elétricas”. Os dados vêm somente do material.</p><div className="ai-actions"><button className="vnext-btn-primary" disabled={!input || busy || !request.trim()} onClick={() => { if (input) void generate(input); }}>Gerar catálogo</button><button onClick={() => { epoch.current++; setBusy(false); void library(); }}>Voltar à Library</button></div>
    </section>}
    {step === 'proposal' && candidate && <><h2>2. Gerar catálogo</h2><p>Primeira versão: {candidate.document.pages.length} páginas, comparação de {candidate.input.models.length} modelos. A proposta ainda não substituiu um catálogo salvo.</p>
      <section className="ai-card"><h3>Dados que precisam de sua revisão</h3>{issues.map(issue => <div className="ai-issue" key={issue.id}><strong>{issue.model} · {issue.label}</strong>{issue.fact.status === 'missing' ? <><p>{issue.fact.reason}</p><label><input type="checkbox" disabled={busy} checked={issue.resolved} onChange={event => { const decisions = { ...candidate.decisions }; if (event.target.checked) decisions[issue.id] = 'missing'; else delete decisions[issue.id]; void generate(candidate.input, decisions); }} />Manter “Não informado” e reconhecer a ausência</label></> : <><p>As fontes divergem. Selecione o valor que será aprovado.</p><select aria-label={`Resolver ${issue.model} ${issue.label}`} disabled={busy} value={issue.resolved ? candidate.decisions[issue.id] : ''} onChange={event => { const decisions = { ...candidate.decisions }; if (event.target.value === '') delete decisions[issue.id]; else decisions[issue.id] = Number(event.target.value); void generate(candidate.input, decisions); }}><option value="">Revisar fontes</option>{issue.fact.status === 'conflict' && issue.fact.candidates.map((item, index) => <option key={index} value={index}>{item.value} — {candidate.input.sources.find(source => source.id === item.source.sourceId)?.name}, p. {item.source.page}</option>)}</select></>}</div>)}
        <p role="status">{issues.filter(issue => !issue.resolved).length} dúvidas pendentes</p><div className="ai-actions"><button className="vnext-btn-primary" disabled={busy || issues.some(issue => !issue.resolved)} onClick={() => { setActive({ value: candidate }); setStep('review'); }}>Aceitar catálogo para revisão</button><button disabled={busy} onClick={() => { setCandidate(undefined); setStep('intake'); }}>Rejeitar proposta</button></div></section><Provenance value={candidate} /><CatalogPreview value={candidate} /></>}
    {step === 'review' && active && <ActiveCatalog key={active.value.document.id} active={active} repository={repository} onLibrary={(value, saved) => { setActive({ value, saved }); void library(); }} />}
  </main>;
}
