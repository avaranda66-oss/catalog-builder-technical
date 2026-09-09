import React from 'react';
import { CleanA4Document } from '@/components/export/CleanA4Document';
import type { A4RenderPlan } from '@/domain/a4-render-plan';
import type { Catalog, ContentBlock } from '@/domain/catalog.schema';
import type { LayoutPreflightReport } from '@/domain/layout-preflight';
import { buildPresysTechnicalCatalog } from '@/data/presys-technical-catalogs';

type PresysModel = 'TA-25N' | 'TA-35N' | 'TA-50N';

const MODELS: PresysModel[] = ['TA-25N', 'TA-35N', 'TA-50N'];

const updateLongestTable = (
  source: Catalog,
  update: (block: ContentBlock) => ContentBlock
): Catalog => {
  const tables = source.pages.flatMap((page) => (page.blocks ?? []).filter((block) => Boolean(block && block.tableRows?.length)));
  const longest = tables.sort((left, right) => (right.tableRows?.length ?? 0) - (left.tableRows?.length ?? 0))[0];
  if (!longest) return source;
  return {
    ...source,
    version: source.version + 1,
    updatedAt: new Date().toISOString(),
    pages: source.pages.map((page) => ({
      ...page,
      blocks: (page.blocks ?? []).map((block) => block.id === longest.id ? update(block) : block)
    }))
  };
};

const canonicalTableRows = (catalog: Catalog) => Object.fromEntries(
  catalog.pages.flatMap((page) => page.blocks ?? [])
    .filter((block) => Boolean(block && block.tableRows?.length))
    .map((block) => [block.id, block.tableRows!.map((row) => row.id)])
);

export const A4PhysicalProofPage: React.FC = () => {
  const initialModel = new URLSearchParams(window.location.search).get('model');
  const [model, setModel] = React.useState<PresysModel>(
    MODELS.includes(initialModel as PresysModel) ? initialModel as PresysModel : 'TA-25N'
  );
  const [catalog, setCatalog] = React.useState<Catalog>(() => buildPresysTechnicalCatalog(model));
  const [layout, setLayout] = React.useState<LayoutPreflightReport | null>(null);
  const [renderPlan, setRenderPlan] = React.useState<A4RenderPlan | null>(null);
  const handleLayoutPreflightChange = React.useCallback((
    report: LayoutPreflightReport,
    plan: A4RenderPlan,
    isComplete: boolean
  ) => {
    if (!isComplete) return;
    setRenderPlan(plan);
    setLayout(report);
  }, []);

  const beginMutation = () => {
    setLayout(null);
    setRenderPlan(null);
  };

  const selectModel = (next: PresysModel) => {
    setModel(next);
    setLayout(null);
    setRenderPlan(null);
    setCatalog(buildPresysTechnicalCatalog(next));
  };

  const setMode = (mode: 'smart' | 'manual') => {
    beginMutation();
    setCatalog((current) => ({
      ...current,
      layoutFlowMode: mode,
      version: current.version + 1,
      updatedAt: new Date().toISOString()
    }));
  };

  const addRows = () => {
    beginMutation();
    setCatalog((current) => updateLongestTable(current, (block) => {
    const rows = block.tableRows ?? [];
    const seed = rows.find((row) => row.kind !== 'section') ?? rows[0];
    const added = Array.from({ length: 18 }, (_, index) => ({
      ...(seed ?? { localOverrides: {} }),
      id: `proof-added-${current.version}-${index}`,
      order: rows.length + index,
      kind: 'data' as const,
      localOverrides: {
        ...(seed?.localOverrides ?? {}),
        proof: `Linha de ensaio dinâmica ${index + 1}`
      }
    }));
      return { ...block, tableRows: [...rows, ...added] };
    }));
  };

  const deleteAddedRows = () => {
    beginMutation();
    setCatalog((current) => updateLongestTable(current, (block) => ({
      ...block,
      tableRows: (block.tableRows ?? []).filter((row) => !row.id.startsWith('proof-added-'))
    })));
  };

  const addManualBreak = () => {
    beginMutation();
    setCatalog((current) => updateLongestTable(current, (block) => {
      const rowId = block.tableRows?.find((row, index) => index >= 4 && row.kind !== 'section')?.id;
      return rowId ? {
        ...block,
        customData: { ...block.customData, manualBreakRowIds: [rowId] }
      } : block;
    }));
  };

  const addLongCode = () => {
    beginMutation();
    setCatalog((current) => updateLongestTable(current, (block) => {
      const rows = block.tableRows ?? [];
      const targetIndex = rows.findIndex((row) => row.kind !== 'section');
      if (targetIndex < 0) return block;
      const target = rows[targetIndex];
      const firstKey = Object.keys(target.localOverrides ?? {})[0] ?? 'value';
      const nextRows = [...rows];
      nextRows[targetIndex] = {
        ...target,
        localOverrides: {
          ...target.localOverrides,
          [firstKey]: 'PRESYS-UNBREAKABLE-TECHNICAL-CODE-'.repeat(18)
        }
      };
      return { ...block, tableRows: nextRows };
    }));
  };

  const addTallCell = () => {
    beginMutation();
    setCatalog((current) => updateLongestTable(current, (block) => {
      const rows = block.tableRows ?? [];
      const targetIndex = rows.findIndex((row) => row.kind !== 'section');
      if (targetIndex < 0) return block;
      const target = rows[targetIndex];
      const firstKey = Object.keys(target.localOverrides ?? {})[0] ?? 'value';
      const nextRows = [...rows];
      nextRows[targetIndex] = {
        ...target,
        localOverrides: {
          ...target.localOverrides,
          [firstKey]: Array.from({ length: 24 }, (_, index) => `trecho técnico editado ${index + 1}`).join(' ')
        }
      };
      return { ...block, tableRows: nextRows };
    }));
  };

  const selectLegacy = () => {
    beginMutation();
    setModel('Legacy' as any);
    setCatalog({
      id: 'legacy-hydrated-catalog',
      title: 'Legacy Catalog',
      themeId: 'default',
      pages: [{
        id: 'legacy-p1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Legacy Page'
      } as any],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1
    });
  };

  const addDelayedImage = () => {
    beginMutation();
    setCatalog((current) => ({
      ...current,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      pages: current.pages.map((p, idx) => idx === 1 ? {
        ...p,
        blocks: [
          {
            id: `delayed-img-${Date.now()}`,
            type: 'image',
            customData: {
              url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="%23003366"/><text x="50%" y="50%" fill="white" font-size="16" text-anchor="middle" dy=".3em">Delayed Asset</text></svg>'
            }
          },
          ...p.blocks
        ]
      } : p)
    }));
  };

  return (
    <div
      data-a4-physical-proof
      data-proof-model={model}
      data-proof-canonical-page-count={catalog.pages.length}
      data-proof-canonical-rows={JSON.stringify(canonicalTableRows(catalog))}
      className="min-h-screen bg-slate-800 p-4"
    >
      <div className="sticky top-0 z-50 mb-4 flex flex-wrap items-center gap-2 bg-slate-950 p-3 text-white">
        {MODELS.map((candidate) => (
          <button key={candidate} type="button" onClick={() => selectModel(candidate)}>{candidate}</button>
        ))}
        <button type="button" onClick={selectLegacy}>Legacy</button>
        <button type="button" onClick={() => setMode('smart')}>Inteligente</button>
        <button type="button" onClick={() => setMode('manual')}>Manual</button>
        <button type="button" onClick={addRows}>Adicionar linhas</button>
        <button type="button" onClick={deleteAddedRows}>Excluir linhas adicionadas</button>
        <button type="button" onClick={addManualBreak}>Quebrar página antes desta linha</button>
        <button type="button" onClick={addTallCell}>Editar célula longa</button>
        <button type="button" onClick={addLongCode}>Código horizontal adversarial</button>
        <button type="button" onClick={addDelayedImage}>Imagem atrasada</button>
        <output
          data-proof-status
          data-layout-ready={Boolean(layout?.canPublish)}
          data-page-count={renderPlan?.pages.length ?? 0}
          data-proof-issues={JSON.stringify(layout?.issues || [])}
        >
          {layout ? `${layout.canPublish ? 'PASS' : 'BLOCKED'}:${layout.blockCount}` : 'MEASURING'}
        </output>
      </div>
      <CleanA4Document
        document={catalog}
        onLayoutPreflightChange={handleLayoutPreflightChange}
      />
    </div>
  );
};

export default A4PhysicalProofPage;
