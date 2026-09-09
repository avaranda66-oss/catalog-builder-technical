import React from 'react';
import { A4Canvas } from '@/components/editor/A4Canvas';
import { PageThumbnailList } from '@/components/editor/PageThumbnailList';
import { auditLayoutPreflight } from '@/domain/layout-preflight';
import { computePageFlowPlan } from '@/domain/page-flow-planner';
import { catalogRowToCatalog } from '@/services/supabase.service';
import { useCatalogStore } from '@/stores/useCatalogStore';

type MalformedFixtureKind = 'string' | 'object' | 'number' | 'boolean';

const malformedFixtureValues: Record<MalformedFixtureKind, unknown> = {
  string: 'CORRUPT_BLOCKS',
  object: { corrupt: true },
  number: 42,
  boolean: false
};

const readFixtureKind = (): MalformedFixtureKind => {
  const requested = new URLSearchParams(window.location.search).get('kind');
  return requested === 'object' || requested === 'number' || requested === 'boolean'
    ? requested
    : 'string';
};

const hydratePersistedFixture = (kind: MalformedFixtureKind) => catalogRowToCatalog({
  id: `runtime-boundary-${kind}`,
  name: `Runtime Boundary ${kind}`,
  version: 3,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  brand: {
    themeId: 'default-technical',
    pages: [
      {
        id: `malformed-page-${kind}`,
        pageNumber: 1,
        pageType: 'technical',
        title: `Malformed ${kind} source`,
        blocks: malformedFixtureValues[kind]
      },
      {
        id: `valid-page-${kind}`,
        pageNumber: 2,
        pageType: 'technical',
        title: 'Known-good renderable page',
        blocks: [{
          id: `valid-text-${kind}`,
          type: 'text',
          textContent: 'The editor remains renderable after source normalization.'
        }]
      }
    ]
  }
});

export const A4RuntimeBoundaryProofPage: React.FC = () => {
  const [fixtureKind] = React.useState(readFixtureKind);
  const [runtimeCatalog] = React.useState(() => hydratePersistedFixture(fixtureKind));
  const [storeReady, setStoreReady] = React.useState(false);
  const flowPlan = React.useMemo(
    () => computePageFlowPlan(runtimeCatalog, [], { flowMode: 'smart' }),
    [runtimeCatalog]
  );
  const preflight = React.useMemo(
    () => auditLayoutPreflight(runtimeCatalog, flowPlan),
    [flowPlan, runtimeCatalog]
  );

  React.useLayoutEffect(() => {
    useCatalogStore.getState().setCurrentCatalog(runtimeCatalog, false);
    setStoreReady(true);
    return () => {
      setStoreReady(false);
      useCatalogStore.setState({ currentCatalog: null });
    };
  }, [runtimeCatalog]);

  if (!storeReady) {
    return <div data-runtime-boundary-loading>Hydrating malformed persisted catalog...</div>;
  }

  return (
    <div
      data-a4-runtime-boundary-proof
      data-fixture-kind={fixtureKind}
      data-runtime-safe={String(runtimeCatalog.pages.every((page) => Array.isArray(page.blocks)))}
      data-can-publish={String(preflight.canPublish)}
      data-diagnostic-count={runtimeCatalog.sourceDiagnostics?.length ?? 0}
      className="flex h-screen min-h-0 bg-slate-100"
    >
      <PageThumbnailList />
      <main className="min-w-0 flex-1">
        <output
          data-runtime-boundary-status
          data-proof-issues={JSON.stringify(preflight.issues)}
          className="sr-only"
        >
          {preflight.canPublish ? 'PUBLISHABLE' : `BLOCKED:${preflight.blockCount}`}
        </output>
        <A4Canvas />
      </main>
    </div>
  );
};

export default A4RuntimeBoundaryProofPage;
