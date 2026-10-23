import { describe, expect, it } from 'vitest';
import { validateTable } from '../../../src/vnext/table';
import { plainRichText, type TableModel } from '../../../src/vnext/domain/editorial-model';
import {
  ARSENAL_CATEGORIES,
  ARSENAL_CATEGORY_LABELS,
  ARSENAL_KIND_CATEGORIES,
  ARSENAL_LIMITS,
  ARSENAL_PRESET_KINDS,
  arsenalPresetMatchesQuery,
  buildArsenalCompactIndex,
  builtinArsenalPresetId,
  canManageArsenalPreset,
  canUseArsenal,
  collectArsenalPayloadAssetIds,
  findArsenalTableValueViolations,
  isArsenalCategoryAllowed,
  isArsenalPayloadVersionSupported,
  normalizeArsenalSearchText,
  parseArsenalPreset,
  parseArsenalPresetDraft,
  parseArsenalPresetSummary,
  stripArsenalTableValues,
  validateArsenalPayload,
  type ArsenalBlockPayload,
  type ArsenalIndexable,
  type ArsenalPresetDraft,
} from '../../../src/vnext/arsenal/contracts';
import {
  builtinCoverPreset,
  CONTRACT_ACTORS,
  CONTRACT_ASSET,
  contractTable,
  coverPageDraft,
  headerBlockDraft,
  logoBlockDraft,
  specTableDraft,
  teamPresetFromDraft,
  titleStyleDraft,
} from './contract/fixtures';

const codes = (draft: unknown) => {
  const parsed = parseArsenalPresetDraft(draft);
  return parsed.ok ? [] : parsed.issues.map((issue) => issue.code === 'ARSENAL_SCHEMA_INVALID' ? issue.details : issue.code);
};

const blockWith = (patch: Partial<ArsenalBlockPayload>): ArsenalPresetDraft => {
  const draft = headerBlockDraft();
  return { ...draft, payload: { ...(draft.payload as ArsenalBlockPayload), ...patch } };
};

describe('vocabulário do arsenal', () => {
  it('seis categorias em português, todas alcançáveis por algum tipo', () => {
    expect(ARSENAL_CATEGORIES.map((category) => ARSENAL_CATEGORY_LABELS[category]))
      .toEqual(['Capas', 'Tabelas', 'Cabeçalhos', 'Rodapés', 'Páginas', 'Estilos']);
    const reachable = new Set(ARSENAL_PRESET_KINDS.flatMap((kind) => ARSENAL_KIND_CATEGORIES[kind]));
    expect([...reachable].sort()).toEqual([...ARSENAL_CATEGORIES].sort());
    expect(isArsenalCategoryAllowed('block', 'rodapes')).toBe(true);
    expect(isArsenalCategoryAllowed('table', 'capas')).toBe(false);
  });

  it('id de embutido segue builtin:<slug> e recusa slug estranho', () => {
    expect(builtinArsenalPresetId('presys-p1-capa')).toBe('builtin:presys-p1-capa');
    expect(() => builtinArsenalPresetId('Capa PRESYS')).toThrow('ARSENAL_BUILTIN_ID_INVALID');
    expect(() => builtinArsenalPresetId('')).toThrow('ARSENAL_BUILTIN_ID_INVALID');
  });
});

describe('rascunho e payload', () => {
  it('aceita um rascunho de cada tipo', () => {
    for (const draft of [headerBlockDraft(), logoBlockDraft(), coverPageDraft(), specTableDraft(), specTableDraft('generic-values'), titleStyleDraft()]) {
      expect(codes(draft)).toEqual([]);
    }
  });

  it('recusa nome com espaço sobrando, comprido demais, etiqueta repetida e excesso de etiquetas', () => {
    expect(codes({ ...headerBlockDraft(), name: ' Cabeçalho' })).toContain('ARSENAL_TEXT_UNTRIMMED');
    expect(codes({ ...headerBlockDraft(), name: 'x'.repeat(ARSENAL_LIMITS.nameMaxChars + 1) }).length).toBeGreaterThan(0);
    expect(codes({ ...headerBlockDraft(), tags: ['Cabeçalho', 'cabecalho'] })).toContain('ARSENAL_TERM_DUPLICATE');
    expect(codes({ ...headerBlockDraft(), tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }).length).toBeGreaterThan(0);
    expect(codes({ ...headerBlockDraft(), synonyms: ['linha\nquebrada'] })).toContain('Control character');
  });

  it('recusa categoria fora do tipo, payload de outro tipo e chave desconhecida', () => {
    expect(codes({ ...headerBlockDraft(), category: 'tabelas' })).toContain('ARSENAL_CATEGORY_NOT_ALLOWED_FOR_KIND');
    expect(codes({ ...headerBlockDraft(), kind: 'page', category: 'capas' })).toContain('ARSENAL_PAYLOAD_KIND_MISMATCH');
    expect(codes({ ...headerBlockDraft(), extra: true }).length).toBeGreaterThan(0);
    expect(codes({ ...headerBlockDraft(), origin: 'builtin' }).length).toBeGreaterThan(0);
  });

  it('bloco: objeto fora do quadro, id repetido, muitos objetos e payload grande demais', () => {
    const draft = headerBlockDraft();
    const [band, title] = (draft.payload as ArsenalBlockPayload).objects;
    if (title.type !== 'text') throw new Error('fixture: the second header object is the title text');
    expect(codes(blockWith({ objects: [band, { ...title, frame: { ...title.frame, xMm: 200 } }] }))).toContain('ARSENAL_BLOCK_OBJECT_OUTSIDE_FRAME');
    expect(codes(blockWith({ objects: [band, { ...title, id: band.id }] }))).toContain('ARSENAL_DUPLICATE_ID');
    const many = Array.from({ length: ARSENAL_LIMITS.objectsMax + 1 }, (_, i) => ({ ...band, id: `s${i}` }));
    expect(codes(blockWith({ objects: many }))).toContain('ARSENAL_TOO_MANY_OBJECTS');
    const huge = blockWith({ objects: [{ ...title, text: plainRichText('big', 'x'.repeat(ARSENAL_LIMITS.payloadMaxBytes)) }] });
    const parsed = parseArsenalPresetDraft(huge);
    expect(parsed.ok ? 'ok' : parsed.code).toBe('TOO_LARGE');
  });

  it('imagens: a lista de assets bate exatamente com as referências', () => {
    const logo = logoBlockDraft();
    expect(collectArsenalPayloadAssetIds(logo.payload)).toEqual([CONTRACT_ASSET.id]);
    const payload = logo.payload as ArsenalBlockPayload;
    expect(codes({ ...logo, payload: { ...payload, assets: [] } })).toContain('ARSENAL_ASSET_MISSING');
    expect(codes({ ...headerBlockDraft(), payload: { ...(headerBlockDraft().payload as ArsenalBlockPayload), assets: [CONTRACT_ASSET] } })).toContain('ARSENAL_ASSET_UNUSED');
    expect(codes({ ...logo, payload: { ...payload, assets: [CONTRACT_ASSET, CONTRACT_ASSET] } })).toContain('ARSENAL_ASSET_DUPLICATE');
    expect(collectArsenalPayloadAssetIds({ kind: 'page', objects: [], tableValues: 'structure-only', assets: [CONTRACT_ASSET], background: { image: { assetId: CONTRACT_ASSET.id, fit: 'cover' } } }))
      .toEqual([CONTRACT_ASSET.id]);
    expect(collectArsenalPayloadAssetIds(titleStyleDraft().payload)).toEqual([]);
  });
});

describe('valores técnicos em tabelas', () => {
  it('"só estrutura" recusa corpo, medida, notas e título; "valores genéricos" aceita', () => {
    const withValues = specTableDraft('generic-values');
    const leaked = { ...withValues, payload: { ...withValues.payload, tableValues: 'structure-only' } };
    expect(codes(leaked)).toEqual(expect.arrayContaining([
      'ARSENAL_TABLE_BODY_VALUE', 'ARSENAL_TABLE_TECHNICAL_VALUE', 'ARSENAL_TABLE_NOTES', 'ARSENAL_TABLE_TITLE',
    ]));
    expect(codes(withValues)).toEqual([]);
  });

  it('a regra vale também para tabelas dentro de página e bloco', () => {
    const page = coverPageDraft();
    const table = { id: 'page-table', type: 'table' as const, zIndex: 5, frame: { xMm: 18, yMm: 200, widthMm: 174, heightMm: 30 }, table: contractTable('pg', 'with-values') };
    const payload = page.payload.kind === 'page' ? page.payload : undefined;
    expect(codes({ ...page, payload: { ...payload, objects: [...payload!.objects, table] } })).toContain('ARSENAL_TABLE_TECHNICAL_VALUE');
    expect(codes({ ...page, payload: { ...payload, tableValues: 'generic-values', objects: [...payload!.objects, table] } })).toEqual([]);
  });

  it('a limpeza deixa a grade, o estilo e o cabeçalho, e o resultado é uma tabela válida', () => {
    const source: TableModel = {
      ...contractTable('src', 'with-values'),
      legend: [{ id: 'src:legend', markerCode: 'a', text: plainRichText('src:legend', 'opcional') }],
    };
    source.cells[3] = { ...source.cells[3], content: { type: 'marker', legendEntryId: 'src:legend' } };
    source.cells[5] = { ...source.cells[5], content: { type: 'image', assetId: CONTRACT_ASSET.id }, contentPresentation: { wrapPolicy: 'nowrap', image: { fit: 'contain', targetWidthMm: 10, targetHeightMm: 10 } } };
    source.cells[2] = { ...source.cells[2], annotationIds: ['src:note'] };
    expect(findArsenalTableValueViolations(source).length).toBeGreaterThan(0);

    const stripped = stripArsenalTableValues(source);
    expect(findArsenalTableValueViolations(stripped)).toEqual([]);
    expect(validateTable(stripped, [])).toEqual([]);
    expect(stripped.cells.map((cell) => cell.id)).toEqual(source.cells.map((cell) => cell.id));
    expect(stripped.columns).toEqual(source.columns);
    expect(stripped.rows).toEqual(source.rows);
    expect(stripped.style).toEqual(source.style);
    expect(stripped.cells.slice(0, 2).map((cell) => cell.content)).toEqual(source.cells.slice(0, 2).map((cell) => cell.content));
    expect(stripped.cells[5].contentPresentation).toEqual({ wrapPolicy: 'nowrap' });
    expect(stripped).not.toHaveProperty('title');
    expect(stripped).not.toHaveProperty('annotationIds');
    expect(stripped.annotations).toEqual([]);
    expect(stripped.legend).toEqual([]);
  });
});

describe('envelope do preset', () => {
  it('aceita preset da equipe e embutido; versão nova vira UNSUPPORTED_VERSION', () => {
    expect(parseArsenalPreset(teamPresetFromDraft(coverPageDraft())).ok).toBe(true);
    expect(parseArsenalPreset(builtinCoverPreset()).ok).toBe(true);
    const newer = parseArsenalPreset({ ...builtinCoverPreset(), payloadSchemaVersion: 2, payload: { kind: 'page', future: true } });
    expect(newer.ok ? 'ok' : newer.code).toBe('UNSUPPORTED_VERSION');
  });

  it('a lista aceita versão nova (para avisar) e marca como não suportada', () => {
    const { payload: _payload, ...summary } = builtinCoverPreset();
    const parsed = parseArsenalPresetSummary({ ...summary, payloadSchemaVersion: 2 });
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && isArsenalPayloadVersionSupported(parsed.value)).toBe(false);
  });

  it('escopo, id, origem e autor precisam combinar', () => {
    const issues = (input: unknown) => {
      const parsed = parseArsenalPreset(input);
      return parsed.ok ? [] : parsed.issues.map((issue) => issue.details);
    };
    expect(issues({ ...builtinCoverPreset(), id: '55555555-5555-4555-8555-555555555555' })).toContain('ARSENAL_SCOPE_ID_MISMATCH');
    expect(issues({ ...teamPresetFromDraft(headerBlockDraft()), origin: 'builtin' })).toContain('ARSENAL_SCOPE_ORIGIN_MISMATCH');
    expect(issues({ ...builtinCoverPreset(), createdBy: CONTRACT_ACTORS.admin.userId })).toContain('ARSENAL_BUILTIN_HAS_NO_AUTHOR');
    expect(issues({ ...teamPresetFromDraft(headerBlockDraft()), category: 'estilos' })).toContain('ARSENAL_CATEGORY_NOT_ALLOWED_FOR_KIND');
  });
});

describe('quem pode o quê', () => {
  const team = { scope: 'team' as const, createdBy: CONTRACT_ACTORS.author.userId };
  it('autor e admin gerenciam; outro editor e leitor não; embutido ninguém', () => {
    expect(canManageArsenalPreset(team, CONTRACT_ACTORS.author)).toBe(true);
    expect(canManageArsenalPreset(team, CONTRACT_ACTORS.admin)).toBe(true);
    expect(canManageArsenalPreset(team, CONTRACT_ACTORS.otherEditor)).toBe(false);
    expect(canManageArsenalPreset(team, { ...CONTRACT_ACTORS.author, role: 'viewer' })).toBe(false);
    expect(canManageArsenalPreset({ scope: 'builtin', createdBy: null }, CONTRACT_ACTORS.admin)).toBe(false);
    expect(canUseArsenal(CONTRACT_ACTORS.viewer)).toBe(false);
    expect(canUseArsenal({ userId: null, role: 'admin' })).toBe(false);
  });
});

describe('busca', () => {
  const cover = { ...coverPageDraft(), description: 'Fundo azul e título grande' };
  it('ignora acentos e maiúsculas e casa por começo de palavra', () => {
    expect(normalizeArsenalSearchText('  Cabeçalho   AZUL ')).toBe('cabecalho azul');
    expect(arsenalPresetMatchesQuery(headerBlockDraft(), 'cabecalho azul')).toBe(true);
    expect(arsenalPresetMatchesQuery(headerBlockDraft(), 'CAB')).toBe(true);
    expect(arsenalPresetMatchesQuery(cover, 'frente')).toBe(true);
    expect(arsenalPresetMatchesQuery(cover, 'primeira pagina')).toBe(true);
    expect(arsenalPresetMatchesQuery(cover, 'titulo grande')).toBe(true);
    expect(arsenalPresetMatchesQuery(cover, 'tabela')).toBe(false);
    expect(arsenalPresetMatchesQuery(cover, '   ')).toBe(true);
  });
});

describe('índice compacto para a IA', () => {
  const item = (id: string, name: string, useCount: number, extra: Partial<ArsenalIndexable> = {}): ArsenalIndexable => ({
    id, name, useCount, category: 'capas', kind: 'page', tags: ['a', 'b', 'c', 'd', 'e'], payloadSchemaVersion: 1, ...extra,
  });

  it('mais usados primeiro, depois nome e id; só id, nome, categoria, tipo e até 4 etiquetas', () => {
    const index = buildArsenalCompactIndex([
      item('builtin:z', 'Zebra', 1),
      item('builtin:b', 'Ávila', 5),
      item('builtin:a', 'Capa', 5),
      item('builtin:new', 'Nova versão', 99, { payloadSchemaVersion: 2 }),
    ]);
    expect(index.map((entry) => entry.id)).toEqual(['builtin:b', 'builtin:a', 'builtin:z']);
    expect(Object.keys(index[0]).sort()).toEqual(['category', 'id', 'kind', 'name', 'tags']);
    expect(index[0].tags).toEqual(['a', 'b', 'c', 'd']);
  });

  it('respeita o número de itens e o orçamento de caracteres', () => {
    const many = Array.from({ length: 300 }, (_, i) => item(`builtin:p${String(i).padStart(3, '0')}`, `Preset ${i}`, 0));
    expect(buildArsenalCompactIndex(many)).toHaveLength(ARSENAL_LIMITS.compactIndexMaxEntries);
    const small = buildArsenalCompactIndex(many, { maxChars: 500 });
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(500);
    expect(small.length).toBeGreaterThan(0);
    expect(buildArsenalCompactIndex(many, { maxEntries: 0 })).toEqual([]);
    expect(buildArsenalCompactIndex(many, { maxEntries: 3 })).toEqual(buildArsenalCompactIndex([...many].reverse(), { maxEntries: 3 }));
  });

  it('nunca leva payload nem sinônimos', () => {
    const preset = teamPresetFromDraft(coverPageDraft());
    const text = JSON.stringify(buildArsenalCompactIndex([preset]));
    expect(text).not.toContain('payload');
    expect(text).not.toContain('frente');
    expect(text).toContain(preset.id);
  });
});

describe('validateArsenalPayload direto', () => {
  it('estilo não tem imagens nem tabelas para conferir', () => {
    expect(validateArsenalPayload(titleStyleDraft().payload)).toEqual([]);
  });
});
