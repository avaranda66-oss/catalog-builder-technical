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
  ownerScope?: string;
  compactMode?: boolean;
  onBeforeMutation?: () => boolean;
}
interface ReferenceImage { id: string; name: string; url: string }
/**
 * Local review assistant, intentionally NOT an LLM general editing tool:
 * executes only bounded/reversible native document actions in the existing
 * DocumentSession. No unchecked freeform HTML, PDF mutations or remote uploads.
 */
export function CatalogWorkbenchChat({ documentId, session, canPublish, onPublication, onEditor, ownerScope, compactMode = false, onBeforeMutation }: Props) {
  const [message, setMessage] = React.useState('');
  const [entries, setEntries] = React.useState<WorkbenchEntry[]>(() =>
    readWorkbenchDialogue(localStorage, documentId, ownerScope));
  const entriesRef = React.useRef(entries);
  const [references, setReferences] = React.useState<ReferenceImage[]>([]);
  const [warning, setWarning] = React.useState('');
  const logRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
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
  // Persist synchronously before navigation/unmount; never write to storage
  // as a side effect inside React's state updater (which may be replayed).
  const persist = (next: WorkbenchEntry) => {
    try {
      const nextEntries = appendWorkbenchDialogue(
        localStorage, documentId, entriesRef.current, next, ownerScope);
      entriesRef.current = nextEntries;
      setEntries(nextEntries);
    } catch {
      setWarning('Histórico local indisponível ou no limite. Exporte a conversa antes de continuar.');
    }
  };
  const submit = () => {
    const submitted = message.trim();
    if (!submitted || submitted.length > 800 || entries.length > WORKBENCH_MESSAGE_LIMIT - 2) return;
    setMessage(''); setWarning('');
    const user = writeEntry('user', submitted);
    const action = interpretWorkbenchRequest(submitted);
    let response = '';
    try {
      if (['compact', 'undo', 'redo'].includes(action) && onBeforeMutation && !onBeforeMutation()) {
        response = 'Conclua ou cancele a edição em andamento antes de pedir outra alteração. O catálogo não foi modificado.';
      } else switch (action) {
        case 'compact':
          if (!session.getSnapshot().document.pages.some(page => page.objects.some(object => object.type === 'table'))) {
            response = 'Ainda não há tabelas neste catálogo para compactar. Adicione uma tabela ou peça outra alteração.';
          } else {
            applyRefinement(session, 'compact');
            response = 'Compactei as tabelas no catálogo aberto. Veja a mudança na página, confira e use Salvar quando estiver satisfeito.';
          }
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
      <div><h3>Como posso ajudar?</h3>
        <p>Peça uma mudança neste catálogo. A página é atualizada quando a ação for suportada.</p></div>
      <span aria-label="Quantidade de mensagens" className="ai-chat-count">{entries.length}</span>
    </div>
    <div ref={logRef} className="ai-chat-log" role="log" aria-label="Histórico do catálogo" aria-live="polite">
      {entries.length === 0 && <div className="ai-chat-welcome"><p>O que você quer ajustar primeiro?</p><div className="ai-chat-suggestions">{['Deixe as tabelas mais compactas', 'Desfaça a última alteração', canPublish ? 'Abra a revisão do PDF' : 'Abra o editor'].map(suggestion => <button key={suggestion} type="button" onClick={() => { setMessage(suggestion); inputRef.current?.focus(); }}>{suggestion}</button>)}</div><small>Por enquanto, só comandos seguros do editor. O Gemini ainda não controla este catálogo.</small></div>}
      {entries.map(entry => <article key={entry.id} className={'ai-chat-turn ai-chat-' + entry.role}>
        <strong>{entry.role === 'user' ? 'Você' : 'Assistente'}</strong>
        <p>{entry.content}</p>
        <small>Revisão local {entry.revision}</small>
      </article>)}
    </div>
    <div className="ai-chat-compose">
      <label htmlFor="ai-workbench-command">Peça uma alteração</label>
      <textarea ref={inputRef} id="ai-workbench-command" aria-label="Peça uma alteração" rows={3}
        value={message} maxLength={800}
        placeholder="Ex.: Deixe as tabelas mais compactas"
        onChange={event => setMessage(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
      <div className="ai-chat-actions">
        <button type="button" className="vnext-btn-primary"
          disabled={!message.trim() || entries.length > WORKBENCH_MESSAGE_LIMIT - 2}
          onClick={submit}>Enviar pedido <span aria-hidden="true">↗</span></button>
        <button type="button" disabled={!entries.length} onClick={exportHistory}>Exportar histórico</button>
      </div>
      {!compactMode && <label className="ai-image-reference">Fotos de referência (consulta visual, sem processamento por IA)
        <input aria-label="Anexar imagens de referência" type="file" accept="image/png,image/jpeg,image/webp" multiple
          onChange={event => { addImages(event.target.files); event.target.value = ''; }} />
      </label>}
      {references.length > 0 && <div className="ai-reference-thumbs">
        {references.map(ref => <div key={ref.id}>
          <img src={ref.url} alt={'Referência: ' + ref.name} loading="lazy" />
          <small>{ref.name}</small>
        </div>)}
      </div>}
      {warning && <p role="alert">{warning}</p>}
      <p className="ai-boundary">{compactMode
        ? 'Este painel executa somente alterações guiadas disponíveis. Gemini ainda não edita este catálogo. Histórico local neste navegador.'
        : `Seu histórico fica neste navegador, separado por conta e catálogo (até ${WORKBENCH_MESSAGE_LIMIT} mensagens). Gemini, tratamento de imagens e edição livre por IA ainda não estão conectados nesta tela.`}</p>
    </div>
  </section>;
}
