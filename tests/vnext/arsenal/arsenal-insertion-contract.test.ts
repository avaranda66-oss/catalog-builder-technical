import { describe, expect, it } from 'vitest';
import type { ApplicationAction } from '../../../src/vnext/application/contracts';
import { frameToCanonicalU } from '../../../src/vnext/domain';
import {
  isArsenalInsertTargetAllowed,
  ARSENAL_INSERT_TARGETS,
  ARSENAL_STYLE_OBJECT_TYPES,
  type ArsenalInsertionService,
  type ArsenalInsertResult,
} from '../../../src/vnext/arsenal/insertion';
import { ARSENAL_PRESET_KINDS, ARSENAL_STYLE_TARGETS, parseArsenalPreset } from '../../../src/vnext/arsenal/contracts';
import { runArsenalInsertionContract } from './contract/arsenal-insertion.contract';

/**
 * A deliberately small insertion (header-like blocks of loose text and shapes only) that proves the contract suite
 * itself: one transaction, all-or-nothing, nothing runs on a bad preset or target. The real service of the
 * capture/insertion slice runs the same suite with every feature.
 */
const blockOnlyInsertion: ArsenalInsertionService = {
  async insert({ preset, target }, port): Promise<ArsenalInsertResult> {
    const refuse = (code: Extract<ArsenalInsertResult, { ok: false }>['error']['code'], details: string): ArsenalInsertResult =>
      ({ ok: false, error: { code, details }, rolledBack: false });
    const parsed = parseArsenalPreset(preset);
    if (!parsed.ok) return refuse(parsed.code === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_VERSION' : 'INVALID_PRESET', parsed.issues[0]?.code ?? '');
    const { payload } = parsed.value;
    if (!isArsenalInsertTargetAllowed(parsed.value.kind, target) || target.kind !== 'page' || payload.kind !== 'block') {
      return refuse('TARGET_INVALID', target.kind);
    }
    if (!port.getDocument().pages.some((page) => page.id === target.pageId)) return refuse('TARGET_NOT_FOUND', target.pageId);
    const origin = target.placement === undefined || target.placement === 'original'
      ? { xMm: payload.frame.xMm, yMm: payload.frame.yMm }
      : target.placement;
    const transactionId = port.createTransactionId();
    const created: string[] = [];
    for (const object of payload.objects) {
      if (object.type !== 'text' && object.type !== 'shape') return refuse('TARGET_INVALID', object.type);
      const { id: _id, frame, hidden: _hidden, ...rest } = object;
      const action = {
        type: 'object.insert',
        pageId: target.pageId,
        object: { ...rest, frameU: frameToCanonicalU({ ...frame, xMm: origin.xMm + frame.xMm, yMm: origin.yMm + frame.yMm }) },
      } as ApplicationAction;
      const result = port.execute(action, { transactionId });
      if (!result.ok) {
        if (created.length > 0) port.undo();
        return { ok: false, error: { code: 'ACTION_FAILED', details: result.error.code }, rolledBack: created.length > 0 };
      }
      created.push(result.metadata.createdIds[0]);
    }
    return { ok: true, transactionId, pageId: target.pageId, objectIds: created, placeholders: [] };
  },
};

runArsenalInsertionContract('inserção mínima de bloco (prova da suíte)', {
  createService: () => blockOnlyInsertion,
  features: ['block'],
});

describe('alvos da inserção do arsenal', () => {
  it('cada tipo aceita exatamente um tipo de alvo', () => {
    for (const kind of ARSENAL_PRESET_KINDS) expect(ARSENAL_INSERT_TARGETS[kind]).toHaveLength(1);
    expect(isArsenalInsertTargetAllowed('page', { kind: 'new-page' })).toBe(true);
    expect(isArsenalInsertTargetAllowed('page', { kind: 'page', pageId: 'p' })).toBe(false);
    expect(isArsenalInsertTargetAllowed('block', { kind: 'page', pageId: 'p', placement: 'original' })).toBe(true);
    expect(isArsenalInsertTargetAllowed('table', { kind: 'page', pageId: 'p', placement: { xMm: 18, yMm: 40 } })).toBe(true);
    expect(isArsenalInsertTargetAllowed('style', { kind: 'object', objectId: 'o' })).toBe(true);
    expect(isArsenalInsertTargetAllowed('style', { kind: 'new-page' })).toBe(false);
  });

  it('cada alvo de estilo aponta para um tipo de objeto do editor', () => {
    expect(Object.keys(ARSENAL_STYLE_OBJECT_TYPES).sort()).toEqual([...ARSENAL_STYLE_TARGETS].sort());
    for (const target of ARSENAL_STYLE_TARGETS) expect(ARSENAL_STYLE_OBJECT_TYPES[target]).toBe(target);
  });
});
