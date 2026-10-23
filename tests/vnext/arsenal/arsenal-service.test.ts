import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ARSENAL_REPOSITORY_ERROR_CODES,
  type ArsenalRepository,
  type ArsenalResult,
} from '../../../src/vnext/arsenal/repository';
import { createInMemoryArsenalStore } from '../../../src/vnext/arsenal/memory-repository';
import { createPresysArsenalBuiltinSource } from '../../../src/vnext/arsenal/builtin-source';
import { ARSENAL_ERROR_MESSAGES, ArsenalService, arsenalErrorMessage } from '../../../src/vnext/arsenal/service';
import {
  CONTRACT_ACTORS,
  builtinCoverPreset,
  coverPageDraft,
  headerBlockDraft,
  specTableDraft,
  titleStyleDraft,
  type ContractActor,
} from './contract/fixtures';

type Method = keyof ArsenalRepository;

/** The repository with a call counter per method, and a way to make the next call of a method fail. */
function spied(repository: ArsenalRepository) {
  const counts: Record<Method, number> = { list: 0, getMany: 0, create: 0, updateCAS: 0, deleteCAS: 0, recordUse: 0 };
  const failures: Array<{ method: Method; code: 'AMBIGUOUS_COMMIT_OUTCOME' | 'REMOTE_FAILURE'; apply: boolean }> = [];
  const wrap = <M extends Method>(method: M) => (async (...args: unknown[]) => {
    counts[method] += 1;
    const index = failures.findIndex((failure) => failure.method === method);
    if (index >= 0) {
      const [failure] = failures.splice(index, 1);
      // `apply`: the call reached the store but the answer was lost.
      if (failure.apply) await (repository[method] as (...a: unknown[]) => Promise<unknown>)(...args);
      return { ok: false, error: { code: failure.code } } as ArsenalResult<never>;
    }
    return (repository[method] as (...a: unknown[]) => Promise<unknown>)(...args);
  }) as ArsenalRepository[M];
  const wrapped: ArsenalRepository = {
    list: wrap('list'), getMany: wrap('getMany'), create: wrap('create'),
    updateCAS: wrap('updateCAS'), deleteCAS: wrap('deleteCAS'), recordUse: wrap('recordUse'),
  };
  return { repository: wrapped, counts, failNext: (method: Method, code: 'AMBIGUOUS_COMMIT_OUTCOME' | 'REMOTE_FAILURE', apply = false) => failures.push({ method, code, apply }) };
}

function arsenal(actor: ContractActor = CONTRACT_ACTORS.author, store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()] })) {
  const spy = spied(store.as(actor));
  const service = new ArsenalService({ repository: spy.repository, createId: randomUUID, viewer: actor });
  return { store, service, ...spy };
}

function value<T>(result: ArsenalResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
}

describe('serviço do arsenal — listar e buscar', () => {
  it('lista uma vez e busca localmente a cada tecla, sem chamar o servidor', async () => {
    const { service, counts } = arsenal();
    await service.save(headerBlockDraft());
    await service.save(specTableDraft());
    await service.save(titleStyleDraft());
    expect(service.getSnapshot().status).toBe('idle');
    await Promise.all([service.refresh(), service.refresh()]);
    expect(counts.list).toBe(1);
    for (const typed of ['c', 'ca', 'cab', 'cabe', 'cabeç', 'cabeça', 'cabeçalhos']) service.search(typed);
    expect(counts.list).toBe(1);
    expect(counts.getMany).toBe(0);
    expect(service.search('cabeçalhos').map((preset) => preset.name)).toEqual(['Cabeçalho azul']);
    await service.ensureLoaded();
    expect(counts.list).toBe(1);
  });

  it('tolera acentos, maiúsculas, plurais e acha por etiqueta e sinônimo', async () => {
    const { service } = arsenal();
    await service.save(headerBlockDraft());
    await service.save(specTableDraft());
    await service.save(coverPageDraft());
    await service.refresh();
    const names = (query: string) => service.search(query).map((preset) => preset.name);
    expect(names('CABECALHO')).toContain('Cabeçalho azul');
    expect(names('tabelas')).toContain('Tabela de especificações');
    expect(names('especificacao')).toContain('Tabela de especificações');
    expect(names('fichas técnicas')).toEqual(['Tabela de especificações']);
    expect(names('barra superior')).toEqual(['Cabeçalho azul']);
    expect(names('faixas')).toEqual(['Cabeçalho azul']);
    expect(names('capas azuis')[0]).toBe('Capa azul simples');
    expect(names('primeiras páginas')).toContain('Capa azul simples');
    expect(names('rodapé')).toEqual([]);
  });

  it('ordena pelo nome antes da etiqueta e do sinônimo, e filtra por categoria, tipo e origem', async () => {
    const { service } = arsenal();
    await service.save({ ...headerBlockDraft(), name: 'Faixa de topo', tags: ['cabeçalho'], synonyms: [] });
    await service.save({ ...headerBlockDraft(), name: 'Barra simples', tags: [], synonyms: ['faixa'] });
    await service.save({ ...headerBlockDraft(), name: 'Outro', tags: ['faixa'], synonyms: [] });
    await service.refresh();
    expect(service.search('faixa').map((preset) => preset.name)).toEqual(['Faixa de topo', 'Outro', 'Barra simples']);
    expect(service.search('', { category: 'capas' }).map((preset) => preset.id)).toEqual([builtinCoverPreset().id]);
    expect(service.search('', { scope: 'team' })).toHaveLength(3);
    expect(service.search('', { kind: 'table' })).toEqual([]);
  });
});

describe('serviço do arsenal — guardar, renomear, apagar e contar uso', () => {
  it('guarda com ids novos; resposta perdida é repetida com os mesmos ids sem duplicar', async () => {
    const { service, counts, failNext } = arsenal();
    failNext('create', 'AMBIGUOUS_COMMIT_OUTCOME', true);
    const saved = value(await service.save(coverPageDraft()));
    expect(counts.create).toBe(2);
    expect(saved).toMatchObject({ origin: 'ai', revision: 1, createdBy: CONTRACT_ACTORS.author.userId });
    await service.refresh();
    expect(service.search('capa azul simples').filter((preset) => preset.scope === 'team')).toHaveLength(1);
  });

  it('o que foi guardado durante uma listagem não some quando ela chega', async () => {
    const { service } = arsenal();
    const refreshing = service.refresh();
    const saved = value(await service.save(headerBlockDraft()));
    await refreshing;
    expect(service.summary(saved.id)?.name).toBe('Cabeçalho azul');
  });

  it('renomeia com a revisão da lista, limpando espaços; avisa quem acompanha a lista', async () => {
    const { service } = arsenal();
    const saved = value(await service.save(headerBlockDraft()));
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    const renamed = value(await service.rename(saved.id, '  Topo   azul '));
    expect(renamed).toMatchObject({ name: 'Topo azul', revision: 2 });
    expect(service.summary(saved.id)?.name).toBe('Topo azul');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('conflito: outra pessoa mudou antes; a lista é atualizada e a segunda tentativa passa', async () => {
    const store = createInMemoryArsenalStore();
    const ana = arsenal(CONTRACT_ACTORS.author, store);
    const carla = arsenal(CONTRACT_ACTORS.admin, store);
    const saved = value(await ana.service.save(headerBlockDraft()));
    await carla.service.refresh();
    value(await ana.service.rename(saved.id, 'Nome da Ana'));
    const conflict = await carla.service.rename(saved.id, 'Nome da Carla');
    expect(!conflict.ok && conflict.error.code).toBe('CONFLICT');
    expect(carla.service.summary(saved.id)).toMatchObject({ name: 'Nome da Ana', revision: 2 });
    expect(value(await carla.service.rename(saved.id, 'Nome da Carla'))).toMatchObject({ revision: 3 });
  });

  it('RLS simulada: editor não mexe no preset de outro, nem ninguém nos embutidos — sem ir ao servidor', async () => {
    const store = createInMemoryArsenalStore({ builtins: [builtinCoverPreset()] });
    const ana = arsenal(CONTRACT_ACTORS.author, store);
    const bruno = arsenal(CONTRACT_ACTORS.otherEditor, store);
    const carla = arsenal(CONTRACT_ACTORS.admin, store);
    const saved = value(await ana.service.save(headerBlockDraft()));
    await bruno.service.refresh();
    await carla.service.refresh();
    expect(bruno.service.canManage(bruno.service.summary(saved.id)!)).toBe(false);
    expect(carla.service.canManage(carla.service.summary(saved.id)!)).toBe(true);
    const forbidden = await bruno.service.rename(saved.id, 'Do Bruno');
    expect(!forbidden.ok && forbidden.error.code).toBe('FORBIDDEN');
    const removal = await bruno.service.remove(saved.id);
    expect(!removal.ok && removal.error.code).toBe('FORBIDDEN');
    expect(bruno.counts.updateCAS + bruno.counts.deleteCAS).toBe(0);
    for (const person of [ana, carla]) {
      const readOnly = await person.service.rename(builtinCoverPreset().id, 'Minha capa');
      expect(!readOnly.ok && readOnly.error.code).toBe('READ_ONLY');
      expect(person.counts.updateCAS).toBe(0);
    }
    // Bruno pode usar (contar uso) o preset da Ana.
    expect(value(await bruno.service.recordUse(saved.id)).useCount).toBe(1);
    expect(value(await carla.service.remove(saved.id))).toMatchObject({ presetId: saved.id });
    expect(carla.service.summary(saved.id)).toBeUndefined();
  });

  it('quem só lê catálogos não usa o arsenal, e nada vai ao servidor', async () => {
    const { service, counts } = arsenal(CONTRACT_ACTORS.viewer);
    expect(!(await service.refresh()).ok && service.getSnapshot()).toMatchObject({ status: 'error', error: 'UNAUTHORIZED' });
    expect((await service.save(headerBlockDraft())).ok).toBe(false);
    expect((await service.load([builtinCoverPreset().id])).ok).toBe(false);
    expect((await service.recordUse(builtinCoverPreset().id)).ok).toBe(false);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(0);
  });

  it('apagar algo que já sumiu tira da lista e avisa NOT_FOUND', async () => {
    const store = createInMemoryArsenalStore();
    const ana = arsenal(CONTRACT_ACTORS.author, store);
    const carla = arsenal(CONTRACT_ACTORS.admin, store);
    const saved = value(await ana.service.save(headerBlockDraft()));
    await carla.service.refresh();
    value(await ana.service.remove(saved.id));
    const gone = await carla.service.remove(saved.id);
    expect(!gone.ok && gone.error.code).toBe('NOT_FOUND');
    expect(carla.service.summary(saved.id)).toBeUndefined();
  });

  it('contar uso atualiza a lista e o preset carregado; falha não lança', async () => {
    const { service, failNext } = arsenal();
    await service.refresh();
    const id = builtinCoverPreset().id;
    value(await service.recordUse(id));
    expect(service.summary(id)?.useCount).toBe(1);
    const [loaded] = value(await service.load([id]));
    expect(loaded.useCount).toBe(1);
    failNext('recordUse', 'REMOTE_FAILURE');
    const failed = await service.recordUse(id);
    expect(!failed.ok && failed.error.code).toBe('REMOTE_FAILURE');
    expect(service.summary(id)?.useCount).toBe(1);
  });
});

describe('serviço do arsenal — carregar presets completos', () => {
  it('carrega em lotes de até 50, guarda em memória e não busca de novo na mesma revisão', async () => {
    const store = createInMemoryArsenalStore({ builtins: createPresysArsenalBuiltinSource().list() });
    const { service, counts } = arsenal(CONTRACT_ACTORS.author, store);
    for (let index = 0; index < 40; index += 1) await service.save({ ...specTableDraft(), name: `Tabela ${index + 1}` });
    await service.refresh();
    const ids = service.search('').map((preset) => preset.id);
    expect(ids.length).toBeGreaterThan(50);
    const before = counts.getMany;
    const loaded = value(await service.load(ids));
    expect(loaded.map((preset) => preset.id)).toEqual(ids);
    // The 40 saved presets were already in memory: one request brought the built-ins.
    expect(counts.getMany - before).toBe(1);
    value(await service.load(ids));
    expect(counts.getMany - before).toBe(1);
    // A new session fetches everything, in batches of at most 50, once.
    const fresh = arsenal(CONTRACT_ACTORS.author, store);
    await fresh.service.refresh();
    value(await fresh.service.load(ids));
    expect(fresh.counts.getMany).toBe(Math.ceil(ids.length / 50));
    value(await fresh.service.load(ids));
    expect(fresh.counts.getMany).toBe(Math.ceil(ids.length / 50));
    expect(Object.isFrozen(loaded[0].payload)).toBe(true);
  });

  it('memória pequena não perde presets de um pedido grande', async () => {
    const store = createInMemoryArsenalStore({ builtins: createPresysArsenalBuiltinSource().list() });
    const service = new ArsenalService({ repository: store.as(CONTRACT_ACTORS.author), createId: randomUUID, presetCacheSize: 5 });
    await service.refresh();
    const ids = service.search('').map((preset) => preset.id);
    expect(value(await service.load(ids)).map((preset) => preset.id)).toEqual(ids);
  });

  it('preset apagado por outra pessoa sai da lista ao carregar', async () => {
    const store = createInMemoryArsenalStore();
    const ana = arsenal(CONTRACT_ACTORS.author, store);
    const bruno = arsenal(CONTRACT_ACTORS.otherEditor, store);
    const saved = value(await ana.service.save(headerBlockDraft()));
    await bruno.service.refresh();
    value(await ana.service.remove(saved.id));
    expect(value(await bruno.service.load([saved.id]))).toEqual([]);
    expect(bruno.service.summary(saved.id)).toBeUndefined();
  });
});

describe('mensagens do arsenal', () => {
  it('há uma frase curta em português para cada código do repositório', () => {
    for (const code of ARSENAL_REPOSITORY_ERROR_CODES) {
      expect(ARSENAL_ERROR_MESSAGES[code], code).toMatch(/^[A-ZÀ-Ú].{10,120}\.$/);
    }
    expect(arsenalErrorMessage('CONFLICT')).toContain('Outra pessoa');
  });
});
