import React from 'react';
import { createDocumentSession, createStaticPageTemplateRegistry, type DocumentSession } from '../application';
import type { VNextPersistenceRuntime } from '../persistence';
import { createW2CDemoDocument } from './editor-defaults';
import { EditorWorkspace } from './EditorWorkspace';
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
  return (
    <EditorWorkspace
      key={snapshot.binding.openSessionId}
      session={snapshot.session}
      persistence={{
        runtime,
        openSessionId: snapshot.binding.openSessionId,
        save: snapshot.save,
        assetUrls: snapshot.assetUrls,
      }}
    />
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
