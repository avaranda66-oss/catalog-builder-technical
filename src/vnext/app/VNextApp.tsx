import React from 'react';
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

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

export interface VNextAppProps {
  session?: DocumentSession;
  runtime?: VNextPersistenceRuntime;
  assetBridge?: AssetPersistenceBridge;
  simpleByDefault?: boolean;
  onRequestLibrary?: () => void;
  translation?: TranslationReviewCoordinator;
  onOpenTranslatedCopy?: (catalogId: string) => void;
  getPublicationSource?: () => PublicationSource | undefined;
}

function RuntimeWorkspace({
  runtime,
  assetBridge,
  simpleByDefault,
  onRequestLibrary,
  translation,
  onOpenTranslatedCopy,
  getPublicationSource,
}: {
  runtime: VNextPersistenceRuntime;
  assetBridge?: AssetPersistenceBridge;
  simpleByDefault?: boolean;
  onRequestLibrary?: () => void;
  translation?: TranslationReviewCoordinator;
  onOpenTranslatedCopy?: (catalogId: string) => void;
  getPublicationSource?: () => PublicationSource | undefined;
}) {
  const [translationOpen, setTranslationOpen] = React.useState(false);
  const [publicationOpen, setPublicationOpen] = React.useState(false);
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
          simpleByDefault={simpleByDefault}
          onRequestLibrary={onRequestLibrary}
          onRequestTranslation={translation ? () => setTranslationOpen(true) : undefined}
          onRequestPublication={getPublicationSource ? () => setPublicationOpen(true) : undefined}
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
          onClose={() => setTranslationOpen(false)} onOpenCopy={onOpenTranslatedCopy} />
      )}
      {activeRecoveryGatePhase === 'RELEASED' && publicationOpen && getPublicationSource && (
        <PublicationReview getSource={getPublicationSource} subscribe={runtime.workspace.subscribe} onClose={() => setPublicationOpen(false)} />
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

function InMemoryWorkspace({ suppliedSession, simpleByDefault }: { suppliedSession?: DocumentSession; simpleByDefault?: boolean }) {
  const sessionRef = React.useRef<DocumentSession | null>(null);
  if (!suppliedSession && !sessionRef.current) {
    sessionRef.current = createDocumentSession(createW2CDemoDocument(createBrowserId), { createId: createBrowserId, templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]) });
  }
  const session = suppliedSession ?? sessionRef.current;
  if (!session) throw new Error('VNext document session unavailable');
  return <EditorWorkspace session={session} demoAssets simpleByDefault={simpleByDefault} />;
}

export function VNextApp({ session: suppliedSession, runtime, assetBridge, simpleByDefault, onRequestLibrary, translation, onOpenTranslatedCopy, getPublicationSource }: VNextAppProps = {}) {
  return runtime
    ? <RuntimeWorkspace runtime={runtime} assetBridge={assetBridge} simpleByDefault={simpleByDefault} onRequestLibrary={onRequestLibrary} translation={translation} onOpenTranslatedCopy={onOpenTranslatedCopy} getPublicationSource={getPublicationSource} />
    : <InMemoryWorkspace suppliedSession={suppliedSession} simpleByDefault={simpleByDefault} />;
}
