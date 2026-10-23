import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { PageSchema } from '@/vnext/domain/editorial-model';
import type { ArsenalPreset, ArsenalPresetSummary } from '@/vnext/arsenal';
import {
  arsenalAuthorLabel,
  arsenalInsertedMessage,
  arsenalInsertFailureMessage,
  arsenalOriginBadge,
  arsenalPayloadHasTables,
  arsenalSaveRequestForSelection,
  arsenalTargetFor,
  arsenalUsageLabel,
  createSessionInsertionPort,
  parseArsenalTags,
  sortArsenalSummaries,
} from '@/vnext/app/editor/arsenal/arsenal-runtime';
import {
  arsenalPreviewDocument,
  arsenalPreviewViewport,
  buildArsenalPreview,
  withArsenalImagePlaceholders,
} from '@/vnext/app/editor/arsenal/arsenal-preview';
import {
  CONTRACT_ACTORS,
  CONTRACT_ASSET,
  builtinCoverPreset,
  coverPageDraft,
  headerBlockDraft,
  logoBlockDraft,
  specTableDraft,
  teamPresetFromDraft,
  titleStyleDraft,
} from '../../arsenal/contract/fixtures';

const ana = { userId: CONTRACT_ACTORS.author.userId, role: 'editor' as const };
const header = teamPresetFromDraft(headerBlockDraft());
const style = teamPresetFromDraft(titleStyleDraft());

describe('Onda 4.5 — palavras dos cartões', () => {
  it('origem: PRESYS, IA, Você ou Equipe; autor em português simples', () => {
    expect(arsenalOriginBadge(builtinCoverPreset(), ana)).toBe('PRESYS');
    expect(arsenalOriginBadge({ origin: 'ai', createdBy: ana.userId }, ana)).toBe('IA');
    expect(arsenalOriginBadge({ origin: 'person', createdBy: ana.userId }, ana)).toBe('Você');
    expect(arsenalOriginBadge({ origin: 'person', createdBy: 'outra' }, ana)).toBe('Equipe');
    expect(arsenalAuthorLabel(builtinCoverPreset(), ana)).toBe('Modelo PRESYS');
    expect(arsenalAuthorLabel({ origin: 'person', createdBy: 'b', createdByName: 'Bruno' }, ana)).toBe('Guardado por Bruno');
    expect(arsenalAuthorLabel({ origin: 'person', createdBy: 'b', createdByName: null }, ana)).toBe('Guardado por alguém da equipe');
    expect(arsenalAuthorLabel({ origin: 'ai', createdBy: ana.userId, createdByName: 'Ana' }, ana)).toBe('Sugerido pela IA, guardado por você');
    expect(arsenalUsageLabel(0)).toBe('Ainda não usado');
    expect(arsenalUsageLabel(7)).toBe('Usado 7×');
  });

  it('ordena por categoria, mais usados primeiro e nome', () => {
    const base = header as ArsenalPresetSummary;
    const sorted = sortArsenalSummaries([
      { ...base, id: 'c', category: 'tabelas', name: 'Tabela', useCount: 0 },
      { ...base, id: 'b', category: 'cabecalhos', name: 'Beta', useCount: 1 },
      { ...base, id: 'a', category: 'cabecalhos', name: 'Alfa', useCount: 1 },
      { ...base, id: 'd', category: 'cabecalhos', name: 'Zeta', useCount: 9 },
      { ...base, id: 'e', category: 'capas', name: 'Capa', useCount: 0 },
    ]);
    // Gallery order of the categories: Capas, Tabelas, Cabeçalhos, Rodapés, Páginas, Estilos.
    expect(sorted.map((entry) => entry.id)).toEqual(['e', 'c', 'd', 'a', 'b']);
  });

  it('etiquetas: vírgulas, espaços e repetidas (sem acento ou maiúscula)', () => {
    expect(parseArsenalTags(' azul, PCON ,, Azul;  faixa   larga\nAZUL ')).toEqual(['azul', 'PCON', 'faixa larga']);
    expect(parseArsenalTags('Cabeçalho, cabecalho')).toEqual(['Cabeçalho']);
  });

  it('mensagens: entrou sem IA, fotos a escolher, falhas sem mudança', () => {
    expect(arsenalInsertedMessage({ name: 'Capa', kind: 'page' }, { placeholders: 0 }))
      .toBe('“Capa” entrou como página nova sem usar IA. Para voltar, use Desfazer.');
    expect(arsenalInsertedMessage({ name: 'Logo', kind: 'block' }, { pageNumber: 3, placeholders: 1 }))
      .toBe('“Logo” entrou na página 3 sem usar IA. Para voltar, use Desfazer. Uma foto ficou como “Foto a escolher (A COMPLETAR)”: troque-a antes de publicar.');
    expect(arsenalInsertFailureMessage({ ok: false, rolledBack: true, error: { code: 'ACTION_FAILED', details: '' } }))
      .toBe('Não foi possível usar o modelo. Nada foi alterado.');
  });
});

describe('Onda 4.5 — onde "Usar" põe cada modelo', () => {
  const ctx = { pageId: 'p1', selectedObjects: [] };
  it('página depois da atual, bloco no lugar original, tabela na página', () => {
    expect(arsenalTargetFor(teamPresetFromDraft(coverPageDraft()), ctx)).toEqual({ ok: true, target: { kind: 'new-page', afterPageId: 'p1' } });
    expect(arsenalTargetFor(header, ctx)).toEqual({ ok: true, target: { kind: 'page', pageId: 'p1', placement: 'original' } });
    expect(arsenalTargetFor(teamPresetFromDraft(specTableDraft()), ctx)).toEqual({ ok: true, target: { kind: 'page', pageId: 'p1' } });
  });

  it('estilo: precisa de um objeto do tipo certo e destravado', () => {
    expect(arsenalTargetFor(style, ctx)).toMatchObject({ ok: false, message: expect.stringContaining('selecione um texto') });
    expect(arsenalTargetFor(style, { pageId: 'p1', selectedObjects: [{ id: 's', type: 'shape' }] }).ok).toBe(false);
    expect(arsenalTargetFor(style, { pageId: 'p1', selectedObjects: [{ id: 't', type: 'text' }, { id: 'u', type: 'text' }] }).ok).toBe(false);
    expect(arsenalTargetFor(style, { pageId: 'p1', selectedObjects: [{ id: 't', type: 'text', locked: true }] }))
      .toMatchObject({ ok: false, message: expect.stringContaining('travado') });
    expect(arsenalTargetFor(style, { pageId: 'p1', selectedObjects: [{ id: 't', type: 'text' }] }))
      .toEqual({ ok: true, target: { kind: 'object', objectId: 't' } });
  });

  it('guardar a seleção: tabela sozinha vira modelo de tabela; o resto vira bloco', () => {
    expect(arsenalSaveRequestForSelection('p', [])).toBeUndefined();
    expect(arsenalSaveRequestForSelection('p', [{ id: 't', type: 'table' }])).toEqual({ source: { kind: 'table', objectId: 't' }, styleObjectId: 't' });
    expect(arsenalSaveRequestForSelection('p', [{ id: 'x', type: 'text' }])).toEqual({ source: { kind: 'objects', pageId: 'p', objectIds: ['x'] }, styleObjectId: 'x' });
    expect(arsenalSaveRequestForSelection('p', [{ id: 'i', type: 'image' }])).toEqual({ source: { kind: 'objects', pageId: 'p', objectIds: ['i'] } });
    expect(arsenalSaveRequestForSelection('p', [{ id: 'x', type: 'text' }, { id: 'y', type: 'shape' }]))
      .toEqual({ source: { kind: 'objects', pageId: 'p', objectIds: ['x', 'y'] } });
  });

  it('sabe quando o conteúdo tem tabela (para o aviso dos valores)', () => {
    expect(arsenalPayloadHasTables(specTableDraft().payload)).toBe(true);
    expect(arsenalPayloadHasTables(headerBlockDraft().payload)).toBe(false);
    expect(arsenalPayloadHasTables(titleStyleDraft().payload)).toBe(false);
  });

  it('a porta da sessão não chama nada além do editor e marca as imagens como indisponíveis sem verificador', async () => {
    const session = createDocumentSession(createCatalogDocument(() => crypto.randomUUID(), 'T'), { createId: () => crypto.randomUUID() });
    const port = createSessionInsertionPort(session, { createId: () => '11111111-2222-4333-8444-555555555555' });
    expect(port.createTransactionId()).toBe('arsenal:11111111-2222-4333-8444-555555555555');
    expect(await port.isAssetAvailable(CONTRACT_ASSET)).toBe(false);
    expect(port.getDocument()).toBe(session.getSnapshot().document);
  });
});

describe('Onda 4.5 — miniatura ao vivo do modelo', () => {
  const valid = (preset: ArsenalPreset) => {
    const preview = buildArsenalPreview(preset);
    expect(PageSchema.safeParse(preview.page).success).toBe(true);
    return preview;
  };

  it('página inteira: a própria página, sem recorte', () => {
    const preview = valid(teamPresetFromDraft(coverPageDraft()));
    expect(preview.focusMm).toBeUndefined();
    expect(arsenalPreviewViewport(preview.focusMm)).toEqual({ xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 });
  });

  it('bloco: volta ao lugar de origem, e o cartão mostra a faixa (nunca uma tira fina)', () => {
    const preview = valid(header);
    const payload = headerBlockDraft().payload;
    if (payload.kind !== 'block') throw new Error('block fixture');
    expect(preview.focusMm).toEqual(payload.frame);
    const title = preview.page.objects.find((object) => object.id === 'hdr-title')!;
    expect(title.frame.xMm).toBe(payload.frame.xMm + 18);
    const view = arsenalPreviewViewport(preview.focusMm);
    expect(view.heightMm / view.widthMm).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(view.xMm).toBeGreaterThanOrEqual(0);
    expect(view.yMm).toBeGreaterThanOrEqual(0);
    expect(view.xMm + view.widthMm).toBeLessThanOrEqual(210 + 1e-9);
  });

  it('tabela no topo da página e estilo numa amostra', () => {
    const table = valid(teamPresetFromDraft(specTableDraft()));
    expect(table.page.objects[0].type).toBe('table');
    expect(table.focusMm?.yMm).toBe(15);
    const sample = valid(style);
    expect(sample.page.objects[0]).toMatchObject({ type: 'text', style: { fontSizePt: 20, fontWeight: 700, color: '#ffffff' } });
    for (const target of ['shape', 'polygon', 'line', 'table'] as const) {
      const styleByTarget = {
        shape: { target, shape: { fill: '#003366' } },
        polygon: { target, polygon: { fill: { kind: 'solid', color: '#003366' } } },
        line: { target, line: { color: '#003366', thicknessPt: 2, dash: 'dashed' } },
        table: { target, table: specTableDraft().payload.kind === 'table' ? (specTableDraft().payload as { table: { style: unknown } }).table.style : {} },
      }[target];
      valid({ ...style, payload: { kind: 'style', style: styleByTarget } } as ArsenalPreset);
    }
  });

  it('imagem sem endereço vira a moldura "Foto a escolher"; os assets do modelo entram no documento da miniatura', () => {
    const logo = teamPresetFromDraft(logoBlockDraft());
    const preview = buildArsenalPreview(logo);
    expect(preview.page.objects.some((object) => object.type === 'image')).toBe(true);
    const framed = withArsenalImagePlaceholders(preview.page, () => false);
    expect(framed.objects.some((object) => object.type === 'image')).toBe(false);
    expect(framed.objects.find((object) => object.id === 'logo-image')).toMatchObject({ type: 'shape', style: { strokeDash: 'dashed' } });
    expect(withArsenalImagePlaceholders(preview.page, () => true)).toBe(preview.page);
    const document = createCatalogDocument(() => crypto.randomUUID(), 'T');
    const withAssets = arsenalPreviewDocument(document, [CONTRACT_ASSET]);
    expect(withAssets.assets.map((asset) => asset.id)).toEqual([CONTRACT_ASSET.id]);
    expect(arsenalPreviewDocument(document, [])).toBe(document);
  });
});
