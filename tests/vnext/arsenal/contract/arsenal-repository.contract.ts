import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARSENAL_LIMITS,
  parseArsenalPreset,
  parseArsenalPresetSummary,
  type ArsenalPresetDraft,
} from '../../../../src/vnext/arsenal/contracts';
import type {
  ArsenalRepository,
  ArsenalRepositoryErrorCode,
  ArsenalResult,
} from '../../../../src/vnext/arsenal/repository';
import {
  CONTRACT_ACTORS,
  coverPageDraft,
  headerBlockDraft,
  specTableDraft,
  titleStyleDraft,
  type ContractActor,
} from './fixtures';

/**
 * Contract suite of `ArsenalRepository` (ADR-arsenal §6). Every implementation runs it:
 *
 *   runArsenalRepositoryContract('Supabase (RPC falso)', () => ({ as: (actor) => …, builtinId: 'builtin:…' }));
 *
 * The harness gives one shared store and a repository acting as each contract actor; `builtinId` is a built-in the
 * store lists. The reference in-memory store passes it (tests/vnext/arsenal/arsenal-memory-repository.test.ts).
 */

export interface ArsenalRepositoryContractHarness {
  as(actor: ContractActor): ArsenalRepository;
  readonly builtinId: string;
}

function value<T>(result: ArsenalResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message ?? ''}`);
  return result.value;
}

function errorCode<T>(result: ArsenalResult<T>): ArsenalRepositoryErrorCode | 'OK' {
  return result.ok ? 'OK' : result.error.code;
}

export function runArsenalRepositoryContract(
  label: string,
  createHarness: () => ArsenalRepositoryContractHarness | Promise<ArsenalRepositoryContractHarness>,
): void {
  describe(`contrato do repositório do arsenal — ${label}`, () => {
    let harness: ArsenalRepositoryContractHarness;
    beforeEach(async () => {
      harness = await createHarness();
    });

    const as = (actor: ContractActor) => harness.as(actor);
    const author = () => as(CONTRACT_ACTORS.author);
    const create = async (draft: ArsenalPresetDraft = headerBlockDraft(), repository = author()) => {
      const presetId = randomUUID();
      const mutationId = randomUUID();
      const result = await repository.create({ presetId, mutationId, draft });
      return { presetId, mutationId, result };
    };

    it('cria preset da equipe com revisão 1, autor e uso zero', async () => {
      const { presetId, result } = await create();
      const preset = value(result);
      expect(preset).toMatchObject({
        id: presetId, scope: 'team', origin: 'person', kind: 'block', category: 'cabecalhos', revision: 1,
        createdBy: CONTRACT_ACTORS.author.userId, useCount: 0, lastUsedAt: null, payloadSchemaVersion: 1,
      });
      expect(preset.payload).toEqual(headerBlockDraft().payload);
      expect(parseArsenalPreset(preset).ok).toBe(true);
    });

    it('lista embutidos e presets da equipe sem payload e filtra por tipo e categoria', async () => {
      const block = await create();
      const table = await create(specTableDraft());
      const listed = value(await author().list());
      expect(listed.some((item) => item.id === harness.builtinId && item.scope === 'builtin')).toBe(true);
      expect(listed.map((item) => item.id)).toEqual(expect.arrayContaining([block.presetId, table.presetId]));
      for (const item of listed) {
        expect(item).not.toHaveProperty('payload');
        expect(parseArsenalPresetSummary(item).ok).toBe(true);
      }
      const tables = value(await author().list({ kind: 'table' }));
      expect(tables.map((item) => item.id)).toContain(table.presetId);
      expect(tables.every((item) => item.kind === 'table')).toBe(true);
      const headers = value(await author().list({ category: 'cabecalhos' }));
      expect(headers.map((item) => item.id)).toContain(block.presetId);
      expect(headers.every((item) => item.category === 'cabecalhos')).toBe(true);
      // Arsenal da equipe: outro editor e um admin veem o mesmo preset, com o autor.
      for (const actor of [CONTRACT_ACTORS.otherEditor, CONTRACT_ACTORS.admin]) {
        const seen = value(await as(actor).list()).find((item) => item.id === block.presetId);
        expect(seen?.createdBy).toBe(CONTRACT_ACTORS.author.userId);
      }
    });

    it('getMany devolve presets completos na ordem pedida e deixa de fora ids desconhecidos', async () => {
      const first = await create();
      const second = await create(specTableDraft());
      const loaded = value(await author().getMany([second.presetId, randomUUID(), first.presetId, harness.builtinId]));
      expect(loaded.map((preset) => preset.id)).toEqual([second.presetId, first.presetId, harness.builtinId]);
      for (const preset of loaded) expect(parseArsenalPreset(preset).ok).toBe(true);
      expect(value(await author().getMany([])).length).toBe(0);
    });

    it('recusa ids malformados e pedidos grandes demais com INVALID_REQUEST', async () => {
      expect(errorCode(await author().getMany(['nao-e-id']))).toBe('INVALID_REQUEST');
      const tooMany = Array.from({ length: ARSENAL_LIMITS.getManyMax + 1 }, () => randomUUID());
      expect(errorCode(await author().getMany(tooMany))).toBe('INVALID_REQUEST');
      const draft = headerBlockDraft();
      expect(errorCode(await author().create({ presetId: 'NAO-UUID', mutationId: randomUUID(), draft }))).toBe('INVALID_REQUEST');
      expect(errorCode(await author().create({ presetId: randomUUID(), mutationId: 'x', draft }))).toBe('INVALID_REQUEST');
      expect(errorCode(await author().recordUse('nao-e-id'))).toBe('INVALID_REQUEST');
    });

    it('valida o rascunho antes de gravar: valores técnicos, categoria e versão', async () => {
      const before = value(await author().list()).length;
      const withValues = specTableDraft('generic-values');
      const leaked = { ...withValues, payload: { ...withValues.payload, tableValues: 'structure-only' } } as ArsenalPresetDraft;
      expect(errorCode((await create(leaked)).result)).toBe('INVALID_PRESET');
      expect(errorCode((await create({ ...headerBlockDraft(), category: 'tabelas' })).result)).toBe('INVALID_PRESET');
      const newer = { ...headerBlockDraft(), payloadSchemaVersion: 2 } as unknown as ArsenalPresetDraft;
      expect(errorCode((await create(newer)).result)).toBe('UNSUPPORTED_VERSION');
      expect(value(await author().list()).length).toBe(before);
      // Conteúdo genérico com valores, escolhido explicitamente, é aceito.
      expect(errorCode((await create(specTableDraft('generic-values'))).result)).toBe('OK');
    });

    it('create é idempotente pela mutação; outra mutação no mesmo id é DUPLICATE', async () => {
      const { presetId, mutationId } = await create();
      const replay = await author().create({ presetId, mutationId, draft: headerBlockDraft() });
      expect(value(replay)).toMatchObject({ id: presetId, revision: 1 });
      expect(errorCode(await author().create({ presetId, mutationId: randomUUID(), draft: headerBlockDraft() }))).toBe('DUPLICATE');
      const divergent = { ...headerBlockDraft(), name: 'Outro nome' };
      expect(errorCode(await author().create({ presetId, mutationId, draft: divergent }))).toBe('MUTATION_REUSE');
      expect(value(await author().list()).filter((item) => item.id === presetId)).toHaveLength(1);
    });

    it('update usa CAS: revisão +1, conflito quando velha, replay devolve o mesmo', async () => {
      const { presetId } = await create(coverPageDraft());
      const mutationId = randomUUID();
      const request = { presetId, expectedRevision: 1, mutationId, patch: { name: 'Capa azul nova', tags: ['capa'] } };
      const updated = value(await author().updateCAS(request));
      expect(updated).toMatchObject({ revision: 2, name: 'Capa azul nova', tags: ['capa'], kind: 'page', origin: 'ai' });
      expect(value(await author().updateCAS(request))).toMatchObject({ revision: 2, name: 'Capa azul nova' });
      expect(errorCode(await author().updateCAS({ ...request, patch: { name: 'Outro' } }))).toBe('MUTATION_REUSE');
      expect(errorCode(await author().updateCAS({ ...request, mutationId: randomUUID() }))).toBe('CONFLICT');

      const cleared = value(await author().updateCAS({ presetId, expectedRevision: 2, mutationId: randomUUID(), patch: { description: null } }));
      expect(cleared.revision).toBe(3);
      expect(cleared.description).toBeUndefined();
      expect(errorCode(await author().updateCAS({ presetId, expectedRevision: 3, mutationId: randomUUID(), patch: {} }))).toBe('INVALID_REQUEST');
      const otherKind = { presetId, expectedRevision: 3, mutationId: randomUUID(), patch: { payload: headerBlockDraft().payload } };
      expect(errorCode(await author().updateCAS(otherKind))).toBe('INVALID_PRESET');
      const badCategory = { presetId, expectedRevision: 3, mutationId: randomUUID(), patch: { category: 'estilos' as const } };
      expect(errorCode(await author().updateCAS(badCategory))).toBe('INVALID_PRESET');
      expect(value(await author().getMany([presetId]))[0].revision).toBe(3);
    });

    it('só o autor ou um admin altera e apaga', async () => {
      const { presetId } = await create();
      const other = as(CONTRACT_ACTORS.otherEditor);
      expect(errorCode(await other.updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Meu' } }))).toBe('FORBIDDEN');
      expect(errorCode(await other.deleteCAS({ presetId, expectedRevision: 1, mutationId: randomUUID() }))).toBe('FORBIDDEN');
      const byAdmin = value(await as(CONTRACT_ACTORS.admin).updateCAS({ presetId, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'Revisado' } }));
      expect(byAdmin).toMatchObject({ revision: 2, name: 'Revisado', createdBy: CONTRACT_ACTORS.author.userId });
      expect(value(await as(CONTRACT_ACTORS.admin).deleteCAS({ presetId, expectedRevision: 2, mutationId: randomUUID() }))).toEqual({ presetId, revision: 3 });
    });

    it('modelos embutidos são somente leitura', async () => {
      const id = harness.builtinId;
      for (const actor of [CONTRACT_ACTORS.author, CONTRACT_ACTORS.admin]) {
        expect(errorCode(await as(actor).updateCAS({ presetId: id, expectedRevision: 1, mutationId: randomUUID(), patch: { name: 'X' } }))).toBe('READ_ONLY');
        expect(errorCode(await as(actor).deleteCAS({ presetId: id, expectedRevision: 1, mutationId: randomUUID() }))).toBe('READ_ONLY');
      }
      expect(errorCode(await author().create({ presetId: id, mutationId: randomUUID(), draft: headerBlockDraft() }))).toBe('INVALID_REQUEST');
    });

    it('quem só lê catálogos não usa o arsenal', async () => {
      const { presetId } = await create();
      const viewer = as(CONTRACT_ACTORS.viewer);
      expect(errorCode(await viewer.list())).toBe('UNAUTHORIZED');
      expect(errorCode(await viewer.getMany([presetId]))).toBe('UNAUTHORIZED');
      expect(errorCode((await create(titleStyleDraft(), viewer)).result)).toBe('UNAUTHORIZED');
      expect(errorCode(await viewer.recordUse(presetId))).toBe('UNAUTHORIZED');
    });

    it('apagar tira da galeria; repetir o mesmo apagar é idempotente', async () => {
      const { presetId } = await create();
      const mutationId = randomUUID();
      expect(value(await author().deleteCAS({ presetId, expectedRevision: 1, mutationId }))).toEqual({ presetId, revision: 2 });
      expect(value(await author().deleteCAS({ presetId, expectedRevision: 1, mutationId }))).toEqual({ presetId, revision: 2 });
      expect(value(await author().list()).some((item) => item.id === presetId)).toBe(false);
      expect(value(await author().getMany([presetId]))).toEqual([]);
      expect(errorCode(await author().deleteCAS({ presetId, expectedRevision: 2, mutationId: randomUUID() }))).toBe('NOT_FOUND');
      expect(errorCode(await author().updateCAS({ presetId, expectedRevision: 2, mutationId: randomUUID(), patch: { name: 'Volta' } }))).toBe('NOT_FOUND');
      expect(errorCode(await author().recordUse(presetId))).toBe('NOT_FOUND');
      expect(errorCode(await author().deleteCAS({ presetId: randomUUID(), expectedRevision: 1, mutationId: randomUUID() }))).toBe('NOT_FOUND');
    });

    it('recordUse conta o uso sem mudar a revisão, inclusive dos embutidos', async () => {
      const { presetId } = await create();
      expect(value(await author().recordUse(presetId)).useCount).toBe(1);
      const second = value(await as(CONTRACT_ACTORS.otherEditor).recordUse(presetId));
      expect(second).toMatchObject({ presetId, useCount: 2 });
      expect(typeof second.lastUsedAt).toBe('string');
      const loaded = value(await author().getMany([presetId]))[0];
      expect(loaded).toMatchObject({ revision: 1, useCount: 2 });
      expect(value(await author().recordUse(harness.builtinId)).useCount).toBe(1);
      const builtin = value(await author().list()).find((item) => item.id === harness.builtinId);
      expect(builtin?.useCount).toBe(1);
      expect(errorCode(await author().recordUse(randomUUID()))).toBe('NOT_FOUND');
    });
  });
}
