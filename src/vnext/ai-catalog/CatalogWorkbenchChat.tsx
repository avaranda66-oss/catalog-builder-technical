import React from 'react';
import type { createDocumentSession } from '../application';
import { applyRefinement } from './composition';
import {
  WORKBENCH_MESSAGE_LIMIT, appendWorkbenchDialogue,
  interpretWorkbenchRequest, readWorkbenchDialogue, type WorkbenchEntry,
} from './workbench-dialogue';

interface Props {
  documentId: string;
  session: ReturnType<typeof createDocumentSession>;
  canPublish: boolean;
  onPublication: () => void;
  onEditor: () => void;
}
interface ReferenceImage { id: string; name: string; url: string }
/**
 * Local review assistant, intentionally NOT an LLM general editing tool:
 * executes only bounded/reversible native document actions in the existing
 * DocumentSession. No unchecked freeform HTML, PDF mutations or remote uploads.
 */
export function CatalogWorkbenchChat({ documentId, session, canPublish, onPublication, onEditor }: Props) {
  const [message, setMessage] = React.useState('');
  const [entries, setEntries] = React.useState<WorkbenchEntry[]>(() =>
    readWorkbenchDialogue(localStorage, documentId));
  const [references, setReferences] = React.useState<ReferenceImage[]>([]);
  const [warning, setWarning] = React.useState('');
  const logRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight, behavior: 'auto' });
  }, [entries]);
  const referencesRef = React.useRef(references);
  referencesRef.current = references;
  React.useEffect(() => () => {
    // Only revoke on unmount: revoking on each addition breaks earlier previews.
    referencesRef.current.forEach(reference => URL.revokeObjectURL(reference.url));
  }, []);

  const writeEntry = (role: WorkbenchEntry['role'], content: string,
    action?: WorkbenchEntry['action']): WorkbenchEntry => ({
    id: crypto.randomUUID(), role, content,
    timestamp: new Date().toISOString(), revision: session.getSnapshot().localSequence,
    ...(action ? { action } : {}),
  });
  const persist = (next: WorkbenchEntry) => {
    setEntries(previous => {
      try {
        return appendWorkbenchDialogue(localStorage, documentId, previous, next);
      } catch {
        setWarning('Limite de histórico local atingido ou espaço indisponível. Exporte a conversa antes de continuar.');
        return previous;
      }
    });
  };
  const submit = () => {
    const submitted = message.trim();
    if (!submitted || submitted.length > 800 || entries.length > WORKBENCH_MESSAGE_LIMIT - 2) return;
    setMessage(''); setWarning('');
    const user = writeEntry('user', submitted);
    const action = interpretWorkbenchRequest(submitted);
    let response = '';
    try {
      switch (action) {
        case 'compact':
          applyRefinement(session, 'compact');
          response = 'Apliquei uma alteração reversível no espaçamento das tabelas. A prévia foi atualizada; revise e salve a nova versão antes do PDF.';
          break;
        case 'undo':
          session.undo();
          response = 'Executei Desfazer. Confira a prévia; alterações não salvas exigem nova aprovação.';
          break;
        case 'redo':
          session.redo();
          response = 'Executei Refazer. Confira a prévia antes de publicar.';
          break;
        case 'publication':
          if (canPublish) { onPublication(); response = 'Abri a revisão física das páginas para impressão e PDF.'; }
          else response = 'Primeiro confira e salve a versão atual. O PDF não será liberado com alterações pendentes.';
          break;
        case 'editor':
          onEditor();
          response = 'Abri a edição manual com as ferramentas avançadas do Catalog Builder.';
          break;
        default:
          response = 'Ainda não consigo executar essa alteração automaticamente com segurança. Posso compactar tabelas, desfazer, refazer, abrir o editor ou revisar o PDF. Alterações de valores, fotos, capa e títulos exigem revisão no editor. Não alterei o catálogo.';
      }
    } catch {
      response = 'Essa operação não pôde ser concluída com segurança. O documento anterior foi preservado. Abra o editor para verificar os detalhes.';
    }
    persist(user);
    // The second setState is queued after the first in the same event.
    persist(writeEntry('assistant', response, action));
  };

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const incoming = [...files];
    if (incoming.length + references.length > 4 ||
        incoming.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
          || file.size > 5 * 1024 * 1024 || file.size === 0)) {
      setWarning('Até 4 imagens PNG, JPEG ou WebP de no máximo 5 MB cada. Nenhum arquivo foi anexado.');
      return;
    }
    const next = incoming.map(file => ({
      id: crypto.randomUUID(), name: file.name.slice(0, 120),
      url: URL.createObjectURL(file),
    }));
    setReferences(previous => [...previous, ...next]);
    persist(writeEntry('assistant',
      `${next.length} imagem(ns) anexada(s) somente para consulta visual nesta sessão. Elas ainda NÃO foram interpretadas pelo Gemini, tratadas, recortadas ou inseridas no PDF.`,
      'reference'));
  };
  const exportHistory = () => {
    const json = JSON.stringify({
      version: 1, scope: 'LOCAL_PROTOTYPE_REVERSIBLE_ACTIONS',
      documentId, count: entries.length, entries,
      referenceImages: 'NOT_EXPORTED', pdfHash: null,
      noModelInference: true,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'catalog-workbench-history.json';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  return <section className="ai-workbench-chat" aria-label="Chat de edição do catálogo">
    <div className="ai-chat-heading">
      <div><h3>Assistente de edição</h3>
        <p>Alterações reversíveis, com atualização imediata na prévia.</p></div>
      <span aria-label="Quantidade de mensagens" className="ai-chat-count">{entries.length}</span>
    </div>
    <div ref={logRef} className="ai-chat-log" role="log" aria-label="Histórico do catálogo" aria-live="polite">
      {entries.length === 0 && <p className="ai-chat-start">Experimente: “Deixe as tabelas mais compactas”. Você também pode pedir “Desfaça”, “Refaça” ou “Abra o editor”.</p>}
      {entries.map(entry => <article key={entry.id} className={'ai-chat-turn ai-chat-' + entry.role}>
        <strong>{entry.role === 'user' ? 'Você' : 'Assistente'}</strong>
        <p>{entry.content}</p>
        <small>Revisão local {entry.revision}</small>
      </article>)}
    </div>
    <div className="ai-chat-compose">
      <label htmlFor="ai-workbench-command">Peça uma alteração</label>
      <textarea id="ai-workbench-command" aria-label="Peça uma alteração" rows={3}
        value={message} maxLength={800}
        placeholder="Ex.: Deixe as tabelas mais compactas"
        onChange={event => setMessage(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); } }} />
      <div className="ai-chat-actions">
        <button type="button" className="vnext-btn-primary"
          disabled={!message.trim() || entries.length > WORKBENCH_MESSAGE_LIMIT - 2}
          onClick={submit}>Aplicar pedido seguro</button>
        <button type="button" disabled={!entries.length} onClick={exportHistory}>Exportar histórico</button>
      </div>
      <label className="ai-image-reference">Fotos de referência (consulta visual, sem processamento por IA)
        <input aria-label="Anexar imagens de referência" type="file" accept="image/png,image/jpeg,image/webp" multiple
          onChange={event => { addImages(event.target.files); event.target.value = ''; }} />
      </label>
      {references.length > 0 && <div className="ai-reference-thumbs">
        {references.map(ref => <div key={ref.id}>
          <img src={ref.url} alt={'Referência: ' + ref.name} loading="lazy" />
          <small>{ref.name}</small>
        </div>)}
      </div>}
      {warning && <p role="alert">{warning}</p>}
      <p className="ai-boundary">Histórico local por catálogo, até {WORKBENCH_MESSAGE_LIMIT} mensagens. Não é ainda um chat Gemini contínuo. Nenhuma imagem é enviada ao provedor.</p>
    </div>
  </section>;
}
