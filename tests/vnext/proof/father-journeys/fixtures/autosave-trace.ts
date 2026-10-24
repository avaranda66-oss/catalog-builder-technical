// Rastreio opcional do salvamento automático para as provas (investigação "autosave para após Criar tabela").
// Só liga quando a prova injeta window.__AUTOSAVE_TRACE_ENABLED__ (lib.mjs, AUTOSAVE_TRACE=1). Só lê e embrulha
// métodos da instância em memória: não muda decisão nenhuma do produto.
import { canonicalDocumentEquivalence, type VNextPersistenceRuntime } from '@/vnext/persistence';

type TraceEvent = Record<string, unknown> & { t: number; ev: string };

declare global {
  interface Window {
    __AUTOSAVE_TRACE_ENABLED__?: boolean;
    __AUTOSAVE_TRACE__?: {
      events: TraceEvent[];
      probe(): Record<string, unknown>;
      nudge(): void;
    };
  }
}

const MAX_EVENTS = 20000;

export function autosaveTraceEnabled(): boolean {
  return window.__AUTOSAVE_TRACE_ENABLED__ === true;
}

export function installAutosaveTrace(runtime: VNextPersistenceRuntime, repository: any, readStored: (catalogId: string) => any): void {
  const events: TraceEvent[] = window.__AUTOSAVE_TRACE__?.events ?? (window as any).__AUTOSAVE_TRACE_EVENTS__ ?? [];
  const now = () => Math.round(performance.now() * 10) / 10;
  const push = (ev: string, data: Record<string, unknown> = {}) => {
    if (events.length < MAX_EVENTS) events.push({ t: now(), ev, ...data });
  };
  const ws: any = runtime.workspace;
  const ac: any = runtime.autosaveCoordinator;
  let barrier: any;
  let lastPending: boolean | undefined;

  const docSummary = () => {
    const doc = ws.getSnapshot().session.getSnapshot().document;
    return doc.pages.map((page: any) => page.objects.map((o: any) => (o.type === 'table'
      ? `T${o.table.rows?.length ?? '?'}x${o.table.columns?.length ?? '?'}h${Math.round(o.frame.heightMm * 100) / 100}`
      : o.type[0])).join(',')).join('|');
  };
  const inputs = () => {
    const snap = ws.getSnapshot();
    const pd = barrier ? Boolean(barrier.hasPendingDraftRaw()) : false;
    return {
      dirty: snap.dirty, phase: snap.save.phase, seq: snap.session.getSnapshot().localSequence, pd,
      kind: snap.binding.kind, rev: snap.binding.kind === 'PERSISTED' ? snap.binding.remoteRevision : null,
      timer: ac ? ac.timer !== undefined : null, running: ac ? Boolean(ac.running) : null,
      suspended: ac ? ac.suspendedSessionToken !== undefined : null,
    };
  };

  // 1. Every workspace publish (runs after the autosave coordinator's own listener).
  ws.subscribe(() => {
    const overlay = barrier?.captureRecoveryOverlay?.();
    push('pub', { ...inputs(), ov: overlay?.kind ?? null, docs: docSummary() });
  });

  // 2. Authoring barrier: log each transition of hasPendingDraft with the caller.
  const originalRegister = ws.registerAuthoringBarrier.bind(ws);
  ws.registerAuthoringBarrier = (openSessionId: string, registered: any) => {
    const wrapped = {
      ...registered,
      hasPendingDraftRaw: () => registered.hasPendingDraft(),
      hasPendingDraft: () => {
        const value = Boolean(registered.hasPendingDraft());
        if (value !== lastPending) {
          lastPending = value;
          const overlay = registered.captureRecoveryOverlay?.();
          const stack = (new Error().stack ?? '').split('\n').slice(2, 6)
            .map((line) => line.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^)]*\/(src|tests)\//, '$1/').replace(/\?[^:)]*/, ''))
            .join(' <- ');
          push('pd', {
            value, ov: overlay?.kind ?? null,
            draft: overlay?.kind === 'INSPECTOR_FRAME_DRAFT_V1' ? overlay.draft : undefined,
            expected: overlay?.kind === 'INSPECTOR_FRAME_DRAFT_V1'
              ? { h: overlay.expectedFrame?.heightMm, w: overlay.expectedFrame?.widthMm, x: overlay.expectedFrame?.xMm, y: overlay.expectedFrame?.yMm }
              : undefined,
            caller: stack,
          });
        }
        return value;
      },
    };
    barrier = wrapped;
    (window as any).__AUTOSAVE_PD__ = () => {
      if (!registered.hasPendingDraft()) return false;
      const overlay = registered.captureRecoveryOverlay?.();
      return overlay?.kind === 'INSPECTOR_FRAME_DRAFT_V1'
        ? `inspector:${overlay.draft?.height}/${Math.round((overlay.expectedFrame?.heightMm ?? 0) * 100) / 100}`
        : (overlay?.kind ?? true);
    };
    push('barrier', { openSessionId: openSessionId.slice(0, 8) });
    const unregister = originalRegister(openSessionId, wrapped);
    return () => { push('barrier-off'); unregister(); };
  };

  // 3. Autosave coordinator: debounce timer, scheduling decisions, timer firing, flush.
  if (ac) {
    const clock = ac.clock;
    const handles = new Map<unknown, number>();
    let nextId = 1;
    ac.clock = {
      setTimeout: (callback: () => void, delayMs: number) => {
        const id = nextId++;
        const handle = clock.setTimeout(() => { push('timer-fire', { id, delayMs }); callback(); }, delayMs);
        handles.set(handle, id);
        push('timer-set', { id, delayMs });
        return handle;
      },
      clearTimeout: (handle: unknown) => {
        push('timer-clear', { id: handles.get(handle) ?? null });
        clock.clearTimeout(handle);
      },
    };
    const scheduleDebounce = ac.scheduleDebounce.bind(ac);
    ac.scheduleDebounce = () => {
      const before = inputs();
      scheduleDebounce();
      push('sched', { ...before, armedAfter: ac.timer !== undefined });
    };
    const runScheduled = ac.runScheduled.bind(ac);
    ac.runScheduled = async () => {
      const before = inputs();
      push('run-scheduled', before);
      const result = await runScheduled();
      push('run-scheduled-done', { ok: result?.ok, ack: result?.acknowledged, code: result?.error?.code ?? null });
      return result;
    };
    const flush = ac.flush.bind(ac);
    ac.flush = async () => {
      push('flush', inputs());
      const result = await flush();
      push('flush-done', { ok: result?.ok, ack: result?.acknowledged, code: result?.error?.code ?? null });
      return result;
    };
  }

  // 4. Repository: each save dispatched and its answer.
  if (!repository.__traced) {
    repository.__traced = true;
    const saveCAS = repository.saveCAS;
    const latencyMs = Number((window as any).__SAVE_LATENCY_MS__ ?? 0);
    const wait = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
    repository.saveCAS = async (request: any) => {
      push('save>', { exp: request.expectedRemoteRevision, mid: String(request.mutationId).slice(0, 8), latencyMs });
      await wait(latencyMs / 2);
      const result = await saveCAS(request);
      await wait(latencyMs / 2);
      push('save<', { ok: result.ok, rev: result.ok ? result.value.remoteRevision : null, code: result.ok ? null : result.error.code });
      return result;
    };
  }

  // 6. Optional (window.__PD_POLL__): sample hasPendingDraft every ~1 ms for 800 ms after "Criar tabela", independent
  //    of who asks, to measure the window in which a stale inspector draft makes the barrier say "pending".
  //    Optional (window.__FORCE_RACE__ = 'stale' | 'control'): the save in flight is held from "Colar tabela do Excel"
  //    and released either inside that window after the fit ('stale') or well after it ('control').
  const forceRace = (window as any).__FORCE_RACE__ as string | undefined;
  const poll = (window as any).__PD_POLL__ === true || Boolean(forceRace);
  // The save already answered by the repository waits, after the local recovery step, until the gate opens: what
  // runs after it (acknowledge -> publish -> autosave reschedule) is synchronous, so it lands where the gate opens.
  let ackGate: { promise: Promise<void>; open: () => void } | undefined;
  const openAckGate = () => { const gate = ackGate; ackGate = undefined; gate?.open(); };
  const lifecycle = (runtime.saveCoordinator as any).options?.recoveryLifecycle;
  if (forceRace && lifecycle?.afterAcknowledged) {
    const afterAcknowledged = lifecycle.afterAcknowledged.bind(lifecycle);
    lifecycle.afterAcknowledged = async (...args: unknown[]) => {
      const result = await afterAcknowledged(...args);
      const gate = ackGate;
      if (gate) { push('ack-gated'); await gate.promise; push('ack-released'); }
      return result;
    };
  }
  const startPoll = () => {
    if (!barrier) return;
    const startSeq = ws.getSnapshot().session.getSnapshot().localSequence;
    const t0 = performance.now();
    let last = '';
    let released = false;
    let fitSeenAt: number | undefined;
    // Right after React writes the fitted frame to the DOM (MutationObserver microtask, before any later task such as
    // deferred passive effects): is the barrier saying "pending" there? In 'stale' mode, the gated save lands there.
    let observer: MutationObserver | undefined;
    let moCount = 0;
    const unsubscribeFit = ws.subscribe(() => {
      const seq = ws.getSnapshot().session.getSnapshot().localSequence;
      if (seq < startSeq + 2 || observer) return;
      fitSeenAt ??= performance.now();
      observer = new MutationObserver(() => {
        moCount += 1;
        const ov = barrier.captureRecoveryOverlay?.();
        const pd = Boolean(barrier.hasPendingDraftRaw());
        if (moCount <= 6) push('mo', { n: moCount, pd, ov: ov?.kind ?? null, draftH: ov?.draft?.height, expectedH: ov?.expectedFrame?.heightMm, sinceFitMs: Math.round(performance.now() - (fitSeenAt ?? 0)) });
        if (forceRace === 'stale' && !released && pd && ov?.kind === 'INSPECTOR_FRAME_DRAFT_V1') {
          released = true;
          push('force-release', { mode: 'stale@mo', gated: Boolean(ackGate), pd, sinceFitMs: Math.round(performance.now() - (fitSeenAt ?? 0)) });
          openAckGate();
        }
        if (moCount >= 6 || released) { observer?.disconnect(); }
      });
      observer.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
    });
    setTimeout(() => { unsubscribeFit(); observer?.disconnect(); }, 1500);
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const snap = ws.getSnapshot();
      const seq = snap.session.getSnapshot().localSequence;
      const ov = barrier.captureRecoveryOverlay?.();
      const pd = Boolean(barrier.hasPendingDraftRaw());
      const key = `${pd}|${ov?.kind ?? '-'}|${ov?.draft?.height ?? ''}|${ov?.expectedFrame?.heightMm ?? ''}|${seq}`;
      if (key !== last) {
        last = key;
        push('pdpoll', { pd, ov: ov?.kind ?? null, draftH: ov?.draft?.height, expectedH: ov?.expectedFrame?.heightMm, seq, phase: snap.save.phase });
      }
      if (seq >= startSeq + 2 && fitSeenAt === undefined) fitSeenAt = performance.now();
      if (forceRace && !released && fitSeenAt !== undefined) {
        const stale = forceRace === 'stale' && pd && ov?.kind === 'INSPECTOR_FRAME_DRAFT_V1';
        const control = forceRace === 'control' && !pd && performance.now() - fitSeenAt > 400;
        if (stale || control) {
          released = true;
          push('force-release', { mode: forceRace, gated: Boolean(ackGate), pd, sinceFitMs: Math.round(performance.now() - fitSeenAt) });
          openAckGate();
        }
      }
      if (performance.now() - t0 < 1500) setTimeout(() => channel.port2.postMessage(0), 1);
      else {
        if (forceRace && !released) { push('force-release', { mode: 'timeout', gated: Boolean(ackGate) }); openAckGate(); }
        channel.port1.close();
      }
    };
    channel.port2.postMessage(0);
  };

  // 5. The father's gestures, to line the timeline up with the journey steps.
  const gesture = (type: string) => (event: Event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('button,[role=button],[role=gridcell],textarea,input');
    const label = (button?.getAttribute('aria-label') || button?.textContent || target?.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    push(type, { label, key: (event as KeyboardEvent).key });
    if (type === 'click' && forceRace && !(window as any).__FORCE_HELD_ONCE__ && /^Colar tabela do Excel$/.test(label)
      && ws.getSnapshot().session.getSnapshot().document.pages.length > 1) {
      (window as any).__FORCE_HELD_ONCE__ = true;
      let open: () => void = () => {};
      const promise = new Promise<void>((resolve) => { open = resolve; });
      ackGate = { promise, open };
      push('force-hold', { mode: forceRace });
    }
    if (type === 'click' && /^Criar tabela$/.test(label)) forceStartSeq = ws.getSnapshot().session.getSnapshot().localSequence;
    if (type === 'click' && poll && /^Criar tabela$/.test(label)) startPoll();
  };
  // FORCE_RACE=ack-after-fit: the gated save is acknowledged right after the passive effects of the commit that drew
  // the fitted frame (the inspector draft state update from that effect is still pending at default priority).
  let forceStartSeq: number | undefined;
  if (forceRace === 'ack-after-fit') {
    (window as any).__AUTOSAVE_ON_PASSIVE__ = (commitPd: unknown) => {
      if (!ackGate || forceStartSeq === undefined) return;
      const seq = ws.getSnapshot().session.getSnapshot().localSequence;
      if (seq < forceStartSeq + 2 || typeof commitPd !== 'string' || !commitPd.startsWith('inspector:') || commitPd.startsWith('inspector:/')) return;
      push('force-release', { mode: 'ack-after-fit', commitPd, pdNow: Boolean(barrier?.hasPendingDraftRaw()) });
      openAckGate();
    };
  }
  if (!(window as any).__AUTOSAVE_TRACE_GESTURES__) {
    (window as any).__AUTOSAVE_TRACE_GESTURES__ = true;
    document.addEventListener('click', gesture('click'), true);
    document.addEventListener('keydown', gesture('key'), true);
    document.addEventListener('paste', gesture('paste'), true);
  }

  window.__AUTOSAVE_TRACE__ = {
    events,
    probe() {
      const snap = ws.getSnapshot();
      const doc = snap.session.getSnapshot().document;
      const binding = snap.binding;
      const current = canonicalDocumentEquivalence(doc);
      const stored = binding.kind === 'PERSISTED' ? readStored(binding.catalogId) : null;
      return {
        at: now(),
        snapshotDirty: snap.dirty,
        phase: snap.save.phase,
        label: snap.save.label,
        seq: snap.session.getSnapshot().localSequence,
        pendingDraftNow: barrier ? Boolean(barrier.hasPendingDraftRaw()) : null,
        overlayNow: barrier?.captureRecoveryOverlay?.() ?? null,
        documentDiffersFromAcknowledged: binding.kind === 'PERSISTED' ? current !== binding.acknowledgedEquivalence : null,
        bindingRemoteRevision: binding.kind === 'PERSISTED' ? binding.remoteRevision : null,
        storedRemoteRevision: stored?.remoteRevision ?? null,
        storedEqualsLocal: stored ? canonicalDocumentEquivalence(stored.documentSnapshot) === current : null,
        autosaveTimerArmed: ac ? ac.timer !== undefined : null,
        autosaveRunning: ac ? Boolean(ac.running) : null,
        autosaveSuspended: ac ? ac.suspendedSessionToken !== undefined : null,
        autosaveRetryArmed: ac ? ac.retryTimer !== undefined : null,
        unresolvedMutation: runtime.saveCoordinator.hasUnresolvedActiveMutation(),
        saveDispatchCount: repository.saveDispatchCount,
        docs: docSummary(),
      };
    },
    /** Experiment only: republish the workspace (what notifyDraftStateChanged does) to see if autosave resumes. */
    nudge() {
      push('nudge');
      ws.notifyDraftStateChanged();
    },
  };
  push('installed', { seq: inputs().seq });
}
