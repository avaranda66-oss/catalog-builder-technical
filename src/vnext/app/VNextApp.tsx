import React from 'react';
import { createDocumentSession, createStaticPageTemplateRegistry, type DocumentSession } from '../application';
import type { VNextPersistenceRuntime } from '../persistence';
import { createW2CDemoDocument } from './editor-defaults';
import { EditorWorkspace } from './EditorWorkspace';
import { RecoveryCenter, type RecoveryGatePhase } from './RecoveryCenter';
import { W2E_PAGE_TEMPLATE } from './page-template-fixtures';
import './styles.css';

function createBrowserId(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure UUID generation is unavailable');
  return globalThis.crypto.randomUUID();
}

export interface VNextAppProps {
  session?: DocumentSession;
  runtime?: VNextPersistenceRuntime;
}

function RuntimeWorkspace({ runtime }: { runtime: VNextPersistenceRuntime }) {
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
          persistence={{
            runtime,
            openSessionId: snapshot.binding.openSessionId,
            save: snapshot.save,
            assetUrls: snapshot.assetUrls,
            localProtection: snapshot.localProtection,
            ...(snapshot.localProtectionMessage
              ? { localProtectionMessage: snapshot.localProtectionMessage }
              : {}),
            ...(recoveredOverlay
              ? { recoveredOverlay }
              : {}),
          }}
        />
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

function InMemoryWorkspace({ suppliedSession }: { suppliedSession?: DocumentSession }) {
  const sessionRef = React.useRef<DocumentSession | null>(null);
  if (!suppliedSession && !sessionRef.current) {
    sessionRef.current = createDocumentSession(createW2CDemoDocument(createBrowserId), { createId: createBrowserId, templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]) });
  }
  const session = suppliedSession ?? sessionRef.current;
  if (!session) throw new Error('VNext document session unavailable');
  return <EditorWorkspace session={session} />;
}

export function VNextApp({ session: suppliedSession, runtime }: VNextAppProps = {}) {
  return runtime
    ? <RuntimeWorkspace runtime={runtime} />
    : <InMemoryWorkspace suppliedSession={suppliedSession} />;
}
