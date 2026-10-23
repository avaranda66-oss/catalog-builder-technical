import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { VNextPersistenceRpcClient } from '../../../src/vnext/persistence/supabase-repository';
import { ARSENAL_LIMITS, type ArsenalPresetDraft } from '../../../src/vnext/arsenal/contracts';
import { ARSENAL_RPC, type ArsenalBuiltinSource, type ArsenalResult } from '../../../src/vnext/arsenal/repository';
import {
  SupabaseArsenalRepository,
  arsenalErrorCodeFromRpcError,
} from '../../../src/vnext/arsenal/supabase-repository';
import { runArsenalRepositoryContract } from './contract/arsenal-repository.contract';
import {
  CONTRACT_ACTORS,
  builtinCoverPreset,
  coverPageDraft,
  headerBlockDraft,
  specTableDraft,
  teamPresetFromDraft,
} from './contract/fixtures';
import { createFakeArsenalRpcServer, type FakeArsenalRpcServer } from './support/fake-arsenal-rpc-server';

const builtins: ArsenalBuiltinSource = { list: () => [builtinCoverPreset()] };
const online = () => false;

function setup(): { server: FakeArsenalRpcServer; repo: (actor?: { userId: string } | null) => SupabaseArsenalRepository } {
  const server = createFakeArsenalRpcServer();
  for (const actor of Object.values(CONTRACT_ACTORS)) {
    server.addProfile({ userId: actor.userId, role: actor.role, fullName: actor.name });
  }
  return {
    server,
    repo: (actor = CONTRACT_ACTORS.author) =>
      new SupabaseArsenalRepository(server.clientFor(actor === null ? null : actor.userId), { builtins, isOffline: online }),
  };
}

function code(result: ArsenalResult<unknown>): string {
  return result.ok ? 'OK' : result.error.code;
}

runArsenalRepositoryContract('Supabase (servidor falso da migração 00031, RLS por sessão)', () => {
  const { server } = setup();
  const repositories = new Map<string, SupabaseArsenalRepository>();
  return {
    builtinId: builtinCoverPreset().id,
    as: (actor) => {
      // One repository per person, like one browser session each.
      let repository = repositories.get(actor.userId);
      if (!repository) {
        repository = new SupabaseArsenalRepository(server.clientFor(actor.userId), { builtins, isOffline: online });
        repositories.set(actor.userId, repository);
      }
      return repository;
    },
  };
});

describe('SupabaseArsenalRepository — fio e fronteiras', () => {
  it('chama as RPCs da migração com os argumentos do contrato', async () => {
    const { server, repo } = setup();
    const repository = repo();
    const presetId = randomUUID();
    const mutationId = randomUUID();
    await repository.list({ kind: 'block' });
    await repository.create({ presetId, mutationId, draft: headerBlockDraft() });
    await repository.getMany([presetId]);
    const update = randomUUID();
    await repository.updateCAS({ presetId, expectedRevision: 1, mutationId: update, patch: { description: null, name: 'Topo' } });
    await repository.recordUse(presetId);
    const remove = randomUUID();
    await repository.deleteCAS({ presetId, expectedRevision: 2, mutationId: remove });
    expect(server.calls.map((call) => call.fn)).toEqual([
      ARSENAL_RPC.list, ARSENAL_RPC.create, ARSENAL_RPC.getMany, ARSENAL_RPC.updateCAS, ARSENAL_RPC.recordUse, ARSENAL_RPC.deleteCAS,
    ]);
    expect(server.calls[0].args).toEqual({ p_kind: 'block', p_category: null });
    expect(server.calls[1].args).toMatchObject({ p_preset_id: presetId, p_mutation_id: mutationId, p_preset: { kind: 'block', origin: 'person' } });
    expect(server.calls[2].args).toEqual({ p_preset_ids: [presetId] });
    expect(server.calls[3].args).toEqual({
      p_preset_id: presetId, p_expected_revision: 1, p_mutation_id: update, p_patch: { description: null, name: 'Topo' },
    });
    expect(server.calls[4].args).toEqual({ p_preset_key: presetId });
    expect(server.calls[5].args).toEqual({ p_preset_id: presetId, p_expected_revision: 2, p_mutation_id: remove });
    // Apagar é lógico: a linha fica no banco com deleted_at.
    expect(server.row(presetId)).toMatchObject({ revision: 3, deleted_by: CONTRACT_ACTORS.author.userId });
    expect(server.row(presetId)?.deleted_at).not.toBeNull();
  });

  it('nada vai à rede quando o pedido já é recusado aqui', async () => {
    const { server, repo } = setup();
    const repository = repo();
    const builtinId = builtinCoverPreset().id;
    const draft = headerBlockDraft();
    const results = [
      await repository.list({ kind: 'nada' as never }),
      await repository.list({ category: 'outras' as never }),
      await repository.getMany(['x']),
      await repository.getMany(Array.from({ length: ARSENAL_LIMITS.getManyMax + 1 }, () => randomUUID())),
      await repository.getMany([builtinId]),
      await repository.getMany([]),
      await repository.create({ presetId: builtinId, mutationId: randomUUID(), draft }),
      await repository.create({ presetId: randomUUID(), mutationId: randomUUID(), draft: { ...draft, category: 'tabelas' } }),
      await repository.create({ presetId: randomUUID(), mutationId: randomUUID(), draft: specTableDraft('generic-values') }),
      await repository.updateCAS({ presetId: builtinId, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'X' } }),
      await repository.updateCAS({ presetId: randomUUID(), expectedRevision: 0, mutationId: randomUUID(), patch: { name: 'X' } }),
      await repository.updateCAS({ presetId: randomUUID(), expectedRevision: 1, mutationId: randomUUID(), patch: {} }),
      await repository.updateCAS({ presetId: randomUUID(), expectedRevision: 1, mutationId: randomUUID(), patch: { kind: 'page' } as never }),
      await repository.updateCAS({ presetId: randomUUID(), expectedRevision: 1, mutationId: randomUUID(), patch: { name: ' espaço ' } }),
      await repository.updateCAS({ presetId: randomUUID(), expectedRevision: 1, mutationId: randomUUID(), patch: { tags: ['a', 'A'] } }),
      await repository.deleteCAS({ presetId: builtinId, expectedRevision: 1, mutationId: randomUUID() }),
      await repository.deleteCAS({ presetId: randomUUID(), expectedRevision: 1.5, mutationId: randomUUID() }),
      await repository.recordUse('builtin:nao-existe-no-app'),
      await repository.recordUse('nao-e-id'),
    ].map((result) => code(result as ArsenalResult<unknown>));
    expect(results).toEqual([
      'INVALID_REQUEST', 'INVALID_REQUEST', 'INVALID_REQUEST', 'INVALID_REQUEST', 'OK', 'OK',
      'INVALID_REQUEST', 'INVALID_PRESET', 'OK',
      'READ_ONLY', 'INVALID_REQUEST', 'INVALID_REQUEST', 'INVALID_REQUEST', 'INVALID_PRESET', 'INVALID_PRESET',
      'READ_ONLY', 'INVALID_REQUEST', 'NOT_FOUND', 'INVALID_REQUEST',
    ]);
    // Só a tabela genérica válida foi enviada.
    expect(server.calls.map((call) => call.fn)).toEqual([ARSENAL_RPC.create]);
  });

  it('confere o conteúdo novo de uma alteração antes de enviar (valores técnicos e tamanho)', async () => {
    const { server, repo } = setup();
    const repository = repo();
    const presetId = randomUUID();
    await repository.create({ presetId, mutationId: randomUUID(), draft: specTableDraft() });
    const withValues = specTableDraft('generic-values').payload;
    const leaked = { ...withValues, tableValues: 'structure-only' } as ArsenalPresetDraft['payload'];
    const calls = server.calls.length;
    expect(code(await repository.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { payload: leaked } })))
      .toBe('INVALID_PRESET');
    const header = headerBlockDraft().payload;
    if (header.kind !== 'block' || header.objects[1].type !== 'text') throw new Error('fixture changed');
    const huge = {
      ...header,
      objects: [header.objects[0], { ...header.objects[1], text: { paragraphs: [{ id: 'p', inlines: [{ kind: 'text' as const, id: 't', text: 'x'.repeat(800_000), marks: [] }] }] } }],
    };
    expect(code(await repository.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { payload: huge } })))
      .toBe('TOO_LARGE');
    expect(server.calls.length).toBe(calls);
    // Mudar o tipo pelo conteúdo é recusado pelo servidor.
    expect(code(await repository.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { payload: header } })))
      .toBe('INVALID_PRESET');
  });

  it('mescla os embutidos com a contagem de uso que o servidor guarda', async () => {
    const { server, repo } = setup();
    const author = repo();
    const builtinId = builtinCoverPreset().id;
    expect(code(await author.recordUse(builtinId))).toBe('OK');
    expect(code(await repo(CONTRACT_ACTORS.otherEditor).recordUse(builtinId))).toBe('OK');
    expect(server.usage(builtinId)?.use_count).toBe(2);
    const fresh = repo(CONTRACT_ACTORS.admin);
    const listed = await fresh.list();
    expect(listed.ok && listed.value.find((item) => item.id === builtinId)).toMatchObject({ useCount: 2, scope: 'builtin' });
    const loaded = await fresh.getMany([builtinId]);
    expect(loaded.ok && loaded.value[0]).toMatchObject({ id: builtinId, useCount: 2 });
    expect(listed.ok && listed.value.filter((item) => item.kind === 'page').length).toBe(1);
    const tablesOnly = await fresh.list({ kind: 'table' });
    expect(tablesOnly.ok && tablesOnly.value.some((item) => item.id === builtinId)).toBe(false);
  });

  it('mostra o nome do autor vindo do perfil', async () => {
    const { repo } = setup();
    const created = await repo().create({ presetId: randomUUID(), mutationId: randomUUID(), draft: coverPageDraft() });
    expect(created.ok && created.value).toMatchObject({ createdByName: CONTRACT_ACTORS.author.name, origin: 'ai' });
    const listed = await repo(CONTRACT_ACTORS.otherEditor).list({ category: 'capas' });
    expect(listed.ok && listed.value.find((item) => item.scope === 'team')?.createdByName).toBe(CONTRACT_ACTORS.author.name);
  });

  it('linha malformada não esconde o arsenal; resposta sem forma é falha remota', async () => {
    const good = teamPresetFromDraft(headerBlockDraft());
    const { payload: _payload, ...summary } = good;
    const client: VNextPersistenceRpcClient = {
      rpc: vi.fn(async (fn: string) => {
        if (fn === ARSENAL_RPC.list) {
          return {
            data: {
              presets: [summary, { ...summary, id: randomUUID(), category: 'tabelas' }, { id: 'builtin:fingido', scope: 'builtin' }, { ...summary }],
              builtinUsage: [{ presetId: builtinCoverPreset().id, useCount: 3, lastUsedAt: '2026-10-23T12:00:00+00:00' }, { lixo: true }],
            },
            error: null,
          };
        }
        if (fn === ARSENAL_RPC.getMany) return { data: { nao: 'lista' }, error: null };
        return { data: null, error: null };
      }),
    };
    const repository = new SupabaseArsenalRepository(client, { builtins, isOffline: online });
    const listed = await repository.list();
    expect(listed.ok && listed.value.map((item) => item.id)).toEqual([builtinCoverPreset().id, good.id]);
    expect(listed.ok && listed.value[0].useCount).toBe(3);
    expect(code(await repository.getMany([good.id]))).toBe('REMOTE_FAILURE');
    expect(code(await repository.create({ presetId: randomUUID(), mutationId: randomUUID(), draft: headerBlockDraft() }))).toBe('REMOTE_FAILURE');
  });

  it('resposta de outro preset ou com versão nova não é aceita', async () => {
    const other = teamPresetFromDraft(headerBlockDraft(), { id: randomUUID() });
    const newer = { ...teamPresetFromDraft(headerBlockDraft()), payloadSchemaVersion: 2 };
    const client: VNextPersistenceRpcClient = {
      rpc: vi.fn(async (fn: string) => (fn === ARSENAL_RPC.getMany ? { data: [newer], error: null } : { data: other, error: null })),
    };
    const repository = new SupabaseArsenalRepository(client, { isOffline: online });
    expect(code(await repository.create({ presetId: randomUUID(), mutationId: randomUUID(), draft: headerBlockDraft() }))).toBe('REMOTE_FAILURE');
    const loaded = await repository.getMany([newer.id]);
    expect(loaded.ok && loaded.value).toEqual([]);
  });

  it('sem internet: OFFLINE antes de chamar o servidor', async () => {
    const { server } = setup();
    const repository = new SupabaseArsenalRepository(server.clientFor(CONTRACT_ACTORS.author.userId), { builtins, isOffline: () => true });
    expect(code(await repository.list())).toBe('OFFLINE');
    expect(code(await repository.create({ presetId: randomUUID(), mutationId: randomUUID(), draft: headerBlockDraft() }))).toBe('OFFLINE');
    expect(server.calls).toHaveLength(0);
  });

  it('resposta perdida numa escrita é AMBÍGUA, e repetir com a mesma mutação devolve o mesmo preset', async () => {
    const { server, repo } = setup();
    const repository = repo();
    const presetId = randomUUID();
    const mutationId = randomUUID();
    server.injectFault({ fn: ARSENAL_RPC.create, kind: 'lost-answer' });
    expect(code(await repository.create({ presetId, mutationId, draft: headerBlockDraft() }))).toBe('AMBIGUOUS_COMMIT_OUTCOME');
    expect(server.row(presetId)).toBeDefined();
    const replay = await repository.create({ presetId, mutationId, draft: headerBlockDraft() });
    expect(replay.ok && replay.value).toMatchObject({ id: presetId, revision: 1 });

    server.injectFault({ fn: ARSENAL_RPC.updateCAS, kind: 'throw' });
    expect(code(await repository.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Novo' } })))
      .toBe('AMBIGUOUS_COMMIT_OUTCOME');
    server.injectFault({ fn: ARSENAL_RPC.list, kind: 'lost-request' });
    expect(code(await repository.list())).toBe('REMOTE_FAILURE');
    // Contar uso não tem mutação: resposta perdida é falha simples (ninguém repete e conta duas vezes).
    server.injectFault({ fn: ARSENAL_RPC.recordUse, kind: 'lost-answer' });
    expect(code(await repository.recordUse(presetId))).toBe('REMOTE_FAILURE');
  });

  it('traduz os erros do servidor (prefixos da migração e permissões do PostgREST)', () => {
    expect(arsenalErrorCodeFromRpcError({ code: '40001', message: 'VNEXT_CONFLICT: expected revision 1, current revision 2' }, 'mutation')).toBe('CONFLICT');
    expect(arsenalErrorCodeFromRpcError({ code: '42501', message: 'AUTH_ROLE_FORBIDDEN: Perfil (viewer) não autorizado' })).toBe('UNAUTHORIZED');
    expect(arsenalErrorCodeFromRpcError({ code: '42501', message: 'permission denied for function list_vnext_presets_v1' })).toBe('UNAUTHORIZED');
    expect(arsenalErrorCodeFromRpcError({ code: 'PGRST301', message: 'JWT expired' })).toBe('UNAUTHORIZED');
    expect(arsenalErrorCodeFromRpcError({ code: '', message: 'TypeError: Failed to fetch' }, 'mutation')).toBe('AMBIGUOUS_COMMIT_OUTCOME');
    expect(arsenalErrorCodeFromRpcError({ code: '', message: 'TypeError: Failed to fetch' }, 'read')).toBe('REMOTE_FAILURE');
    expect(arsenalErrorCodeFromRpcError({ code: 'XX000', message: 'algo inesperado' }, 'mutation')).toBe('REMOTE_FAILURE');
  });

  it('RLS simulada: sem sessão, leitor e perfil inativo não usam; editor só mexe no que é dele; admin em tudo', async () => {
    const { server, repo } = setup();
    server.addProfile({ userId: '66666666-6666-4666-8666-666666666666', role: 'editor', active: false });
    expect(code(await repo(null).list())).toBe('UNAUTHORIZED');
    expect(code(await repo(CONTRACT_ACTORS.viewer).list())).toBe('UNAUTHORIZED');
    expect(code(await repo({ userId: '66666666-6666-4666-8666-666666666666' }).list())).toBe('UNAUTHORIZED');

    const mine = randomUUID();
    await repo().create({ presetId: mine, mutationId: randomUUID(), draft: headerBlockDraft() });
    const other = repo(CONTRACT_ACTORS.otherEditor);
    expect(code(await other.updateCAS({ presetId: mine, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Meu agora' } }))).toBe('FORBIDDEN');
    expect(code(await other.deleteCAS({ presetId: mine, expectedRevision: 1, mutationId: randomUUID() }))).toBe('FORBIDDEN');
    expect(code(await other.recordUse(mine))).toBe('OK');
    const admin = repo(CONTRACT_ACTORS.admin);
    expect(code(await admin.updateCAS({ presetId: mine, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Revisado' } }))).toBe('OK');
    expect(server.row(mine)).toMatchObject({ name: 'Revisado', created_by: CONTRACT_ACTORS.author.userId, updated_by: CONTRACT_ACTORS.admin.userId });
    expect(code(await admin.deleteCAS({ presetId: mine, expectedRevision: 2, mutationId: randomUUID() }))).toBe('OK');
  });
});
