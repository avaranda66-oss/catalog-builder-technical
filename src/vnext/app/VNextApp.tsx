import React from 'react';
import type { NativeComposeFunctionsClient } from '../ai-catalog/native-compose-client';
import type { SpecTableGateway } from '../ai-catalog/spec-table/spec-table-gateway';
import { createDocumentSession, createStaticPageTemplateRegistry, type DocumentSession } from '../application';
import type { VNextPersistenceRuntime } from '../persistence';
import type { AssetPersistenceBridge } from '../asset';
import { createW2CDemoDocument } from './editor-defaults';
import { EditorWorkspace } from './EditorWorkspace';
import { RecoveryCenter, type RecoveryGatePhase } from './RecoveryCenter';
import { W2E_PAGE_TEMPLATE } from './page-template-fixtures';
import './styles.css';
import type { TranslationReviewCoordinator } from '../translation/review-coordinator';
import { TranslationReview } from './TranslationReview';
import { PublicationReview } from './PublicationReview';
import type { PublicationSource } from '../publication/review';
import type { EditorLocateRequest } from './editor/use-issue-navigation';
import { publicationWaitingMessage } from './publication-diagnostic-presentation';
import type { ArsenalEditorRuntime } from './editor/arsenal/arsenal-runtime';

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

export interface VNextAppProps {
  session?: DocumentSession;
  runtime?: VNextPersistenceRuntime;
  composerClient?: NativeComposeFunctionsClient;
  /** J2-lite: reading a PDF with the AI to build a verified specification table (server key). */
  factExtraction?: SpecTableGateway;
  assetBridge?: AssetPersistenceBridge;
  simpleByDefault?: boolean;
  onRequestLibrary?: () => void;
  translation?: TranslationReviewCoordinator;
  onOpenTranslatedCopy?: (catalogId: string) => void;
  getPublicationSource?: () => PublicationSource | undefined;
  /** Onda 4.5: the team's saved models; the editor shows "Arsenal" only when it is given. */
  arsenal?: ArsenalEditorRuntime;
}

function RuntimeWorkspace({
  runtime,
  assetBridge,
  composerClient,
  factExtraction,
  simpleByDefault,
  onRequestLibrary,
  translation,
  onOpenTranslatedCopy,
  getPublicationSource,
  arsenal,
}: {
  runtime: VNextPersistenceRuntime;
  assetBridge?: AssetPersistenceBridge;
  composerClient?: NativeComposeFunctionsClient;
  /** J2-lite: reading a PDF with the AI to build a verified specification table (server key). */
  factExtraction?: SpecTableGateway;
  simpleByDefault?: boolean;
  onRequestLibrary?: () => void;
  translation?: TranslationReviewCoordinator;
  onOpenTranslatedCopy?: (catalogId: string) => void;
  getPublicationSource?: () => PublicationSource | undefined;
  arsenal?: ArsenalEditorRuntime;
}) {
  const [translationOpen, setTranslationOpen] = React.useState(false);
  const [publicationOpen, setPublicationOpen] = React.useState(false);
  // "Corrigir este item": the review closes and the editor of the same open session goes to the object.
  const [locateRequest, setLocateRequest] = React.useState<EditorLocateRequest & { readonly openSessionId: string }>();
  const locateSequence = React.useRef(0);
  // Drop a request once the editor used it, so an editor that mounts again does not jump to an old problem.
  const dropLocateRequest = React.useCallback((id: number) => {
    setLocateRequest(current => current?.id === id ? undefined : current);
  }, []);
  React.useEffect(() => {
    if (!getPublicationSource) return;
    document.body.setAttribute('data-vnext-print-policy', '');
    return () => document.body.removeAttribute('data-vnext-print-policy');
  }, [getPublicationSource]);
  const snapshot = React.useSyncExternalStore(
    runtime.workspace.subscribe,
    runtime.workspace.getSnapshot,
    runtime.workspace.getSnapshot
  );
  const [recoveryGate, setRecoveryGate] = React.useState<{
    readonly authorityScopeId: string;
    readonly phase: RecoveryGatePhase;
  }>(() => ({
    authorityScopeId: snapshot.activeAuthorityScopeId,
    phase: runtime.recoveryStartup ? 'PENDING' : 'RELEASED',
  }));
  const activeRecoveryGatePhase = recoveryGate.authorityScopeId === snapshot.activeAuthorityScopeId
    ? recoveryGate.phase
    : 'PENDING';
  const updateRecoveryGate = React.useCallback((phase: RecoveryGatePhase) => {
    setRecoveryGate({ authorityScopeId: snapshot.activeAuthorityScopeId, phase });
  }, [snapshot.activeAuthorityScopeId]);
  const recoveredOverlay = runtime.getRecoveredOverlay(snapshot.binding.openSessionId);
  return (
    <>
      {activeRecoveryGatePhase === 'RELEASED' && (
        <EditorWorkspace
          key={snapshot.binding.openSessionId}
          session={snapshot.session}
          composerClient={composerClient}
          factExtraction={factExtraction}
          simpleByDefault={simpleByDefault}
          arsenal={arsenal}
          onRequestLibrary={onRequestLibrary}
          onRequestTranslation={translation ? () => setTranslationOpen(true) : undefined}
          onRequestPublication={getPublicationSource ? () => setPublicationOpen(true) : undefined}
          locateRequest={locateRequest?.openSessionId === snapshot.binding.openSessionId ? locateRequest : undefined}
          persistence={{
            runtime,
            openSessionId: snapshot.binding.openSessionId,
            save: snapshot.save,
            assetUrls: snapshot.assetUrls,
            assetRuntimeStates: snapshot.assetRuntimeStates,
            localProtection: snapshot.localProtection,
            ...(snapshot.localProtectionMessage
              ? { localProtectionMessage: snapshot.localProtectionMessage }
              : {}),
            ...(recoveredOverlay
              ? { recoveredOverlay }
              : {}),
            assetBridge,
          }}
        />
      )}
      {activeRecoveryGatePhase === 'RELEASED' && translationOpen && translation && onOpenTranslatedCopy && (
        <TranslationReview coordinator={translation} sourceLocale={snapshot.session.getSnapshot().document.locale}
          sourceTitle={snapshot.session.getSnapshot().document.title}
          onClose={() => setTranslationOpen(false)} onOpenCopy={onOpenTranslatedCopy} save={() => runtime.manualSave()} />
      )}
      {activeRecoveryGatePhase === 'RELEASED' && publicationOpen && getPublicationSource && (
        <PublicationReview getSource={getPublicationSource} subscribe={runtime.workspace.subscribe} onClose={() => setPublicationOpen(false)}
          waitingMessage={publicationWaitingMessage(snapshot.save)} simple={simpleByDefault}
          onLocateDiagnostic={diagnostic => setLocateRequest({
            id: ++locateSequence.current, diagnostic, openSessionId: snapshot.binding.openSessionId, onHandled: dropLocateRequest,
          })} />
      )}
      {runtime.recoveryStartup && (
        <RecoveryCenter
          key={snapshot.activeAuthorityScopeId}
          runtime={runtime}
          authorityScopeId={snapshot.activeAuthorityScopeId}
          onGatePhaseChange={updateRecoveryGate}
        />
      )}
    </>
  );
}

function InMemoryWorkspace({ suppliedSession, simpleByDefault, arsenal }: { suppliedSession?: DocumentSession; simpleByDefault?: boolean; arsenal?: ArsenalEditorRuntime }) {
  const sessionRef = React.useRef<DocumentSession | null>(null);
  if (!suppliedSession && !sessionRef.current) {
    sessionRef.current = createDocumentSession(createW2CDemoDocument(createBrowserId), { createId: createBrowserId, templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]) });
  }
  const session = suppliedSession ?? sessionRef.current;
  if (!session) throw new Error('VNext document session unavailable');
  return <EditorWorkspace session={session} demoAssets simpleByDefault={simpleByDefault} arsenal={arsenal} />;
}

export function VNextApp({ session: suppliedSession, runtime, assetBridge, composerClient, factExtraction, simpleByDefault, onRequestLibrary, translation, onOpenTranslatedCopy, getPublicationSource, arsenal }: VNextAppProps = {}) {
  return runtime
    ? <RuntimeWorkspace runtime={runtime} assetBridge={assetBridge} composerClient={composerClient} factExtraction={factExtraction} simpleByDefault={simpleByDefault} onRequestLibrary={onRequestLibrary} translation={translation} onOpenTranslatedCopy={onOpenTranslatedCopy} getPublicationSource={getPublicationSource} arsenal={arsenal} />
    : <InMemoryWorkspace suppliedSession={suppliedSession} simpleByDefault={simpleByDefault} arsenal={arsenal} />;
}
