import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { createDocumentSession } from '../../../src/vnext/application';
import type { CatalogDocument } from '../../../src/vnext/domain';
import {
  ARSENAL_AI_CATEGORIES, ARSENAL_AI_KINDS, ARSENAL_AI_LIMITS, ARSENAL_AI_RULE, parseArsenalAiIndex, verifyArsenalChoice,
  type ArsenalAiIndexEntry,
} from '../../../src/vnext/ai-catalog/arsenal-ai-contract';
import {
  buildComposerPrompt, buildGeneration, COMPOSE_RESPONSE_SCHEMA, COMPOSER_FEATURES, COMPOSER_LIMITS, interpretProviderReply,
  parseComposerRequest, type ComposerGenerationRequest,
} from '../../../src/vnext/ai-catalog/composer-contract';
import { EDIT_INTENT_RESPONSE_SCHEMA, EDIT_INTENT_SYSTEM_PROMPT, LAYOUT_DEFAULTS_POLICY } from '../../../src/vnext/ai-catalog/edit-intent-contract';
import { buildDocumentOutline } from '../../../src/vnext/ai-catalog/document-outline';
import { planEditIntents, prepareEditIntentRequest, requestEditIntents } from '../../../src/vnext/ai-catalog/edit-intents';
import { prepareNativeComposeRequest, requestNativeCompose } from '../../../src/vnext/ai-catalog/native-compose';
import { readComposerReadiness, type NativeComposeFunctionsClient } from '../../../src/vnext/ai-catalog/native-compose-client';
import { ARSENAL_CATEGORIES, ARSENAL_PRESET_KINDS } from '../../../src/vnext/arsenal/contracts';
import { buildAssistantArsenalAiIndex } from '../../../src/vnext/arsenal/assistant-arsenal';
import { presetSummary, routerPresets } from '../arsenal/arsenal-ia-fixtures';

/**
 * Onda 4.5 — the AI reads only the short index of the arsenal and may answer "use preset <ref>"; the browser checks the
 * ref again. The prompts assume sensible layout/style defaults; technical values stay blocked (INVENTED_NUMBER).
 */
beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });

const PCON = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/examples/presys-capa-pcon-hibrido.catalog.json'), 'utf8')) as CatalogDocument;
const index = (): ArsenalAiIndexEntry[] => [...buildAssistantArsenalAiIndex(routerPresets()).entries];
const envelope = (output: unknown) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] });
function editRequest(arsenal?: ArsenalAiIndexEntry[], message = 'insere o cabeçalho padrão'): ComposerGenerationRequest {
  const doc = structuredClone(PCON);
  const { request } = prepareEditIntentRequest(doc, message, [], { activePageId: doc.pages[0].id }, arsenal ?? []);
  const parsed = parseComposerRequest(request);
  if (!parsed || parsed.task === 'status') throw new Error('REQUEST_REFUSED');
  return parsed;
}
function composeRequest(arsenal?: ArsenalAiIndexEntry[]): ComposerGenerationRequest {
  const parsed = parseComposerRequest(prepareNativeComposeRequest(structuredClone(PCON), 'Crie uma capa nova para o catálogo', [], arsenal ?? []));
  if (!parsed || parsed.task === 'status') throw new Error('REQUEST_REFUSED');
  return parsed;
}
function walkBounded(schema: Record<string, unknown>, path = '$'): void {
  if (schema.type === 'STRING' && !schema.enum) expect(schema.maxLength, path).toBeGreaterThan(0);
  if (schema.type === 'ARRAY') {
    expect(schema.maxItems, path).toBeGreaterThan(0);
    walkBounded(schema.items as Record<string, unknown>, path + '[]');
  }
  if (schema.type === 'OBJECT') {
    for (const [key, child] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) walkBounded(child, path + '.' + key);
  }
}

describe('the short index of the arsenal (what the AI reads)', () => {
  it('uses the same categories and kinds as the arsenal contract', () => {
    expect([...ARSENAL_AI_CATEGORIES]).toEqual([...ARSENAL_CATEGORIES]);
    expect([...ARSENAL_AI_KINDS]).toEqual([...ARSENAL_PRESET_KINDS]);
  });

  it('local refs a1…, most used first, no ids and no payloads, inside the limits', () => {
    const presets = routerPresets();
    const built = buildAssistantArsenalAiIndex(presets);
    expect(built.entries.map(entry => entry.ref)).toEqual(presets.map((_, position) => `a${position + 1}`));
    expect(built.entries[0].name).toBe('Cabeçalho padrão');
    const json = JSON.stringify(built.entries);
    for (const preset of presets) expect(json).not.toContain(preset.id);
    expect(json).not.toContain('payload');
    expect(built.presetIdOf('a1')).toBe(presets[0].id);
    expect(built.presetIdOf('a99')).toBeUndefined();
    expect(parseArsenalAiIndex(built.entries)).toEqual(built.entries);
  });

  it('is cut to 30 entries and 2 400 characters; newer versions are left out', () => {
    const many = Array.from({ length: 80 }, (_, position) => presetSummary({
      name: `Página de modelo número ${position} com um nome longo para encher o índice`, category: 'paginas', kind: 'page',
      tags: ['primeira etiqueta', 'segunda etiqueta', 'terceira etiqueta', 'quarta etiqueta'], useCount: position }));
    const built = buildAssistantArsenalAiIndex([...many, { ...presetSummary({ name: 'Nova versão', category: 'capas', kind: 'page' }), payloadSchemaVersion: 2, useCount: 999 }]);
    expect(built.entries.length).toBeLessThanOrEqual(ARSENAL_AI_LIMITS.entries);
    expect(JSON.stringify(built.entries).length).toBeLessThanOrEqual(ARSENAL_AI_LIMITS.indexChars);
    expect(built.entries.every(entry => entry.tags.length <= ARSENAL_AI_LIMITS.tags)).toBe(true);
    expect(built.entries.some(entry => entry.name === 'Nova versão')).toBe(false);
    expect(parseArsenalAiIndex(built.entries)).not.toBeNull();
  });

  it('the server parser refuses anything else', () => {
    const good = index();
    expect(parseArsenalAiIndex([{ ...good[0], id: 'x' }])).toBeNull();
    expect(parseArsenalAiIndex([{ ...good[0], ref: 'o1' }])).toBeNull();
    expect(parseArsenalAiIndex([good[0], { ...good[1], ref: good[0].ref }])).toBeNull();
    expect(parseArsenalAiIndex([{ ...good[0], category: 'outros' }])).toBeNull();
    expect(parseArsenalAiIndex([{ ...good[0], tags: ['a', 'b', 'c', 'd'] }])).toBeNull();
    expect(parseArsenalAiIndex([{ ...good[0], name: ' espaço ' }])).toBeNull();
    expect(parseArsenalAiIndex(Array.from({ length: 31 }, (_, position) => ({ ...good[0], ref: `a${position + 1}` })))).toBeNull();
    expect(parseArsenalAiIndex('a1')).toBeNull();
  });
});

describe('requests with the index (server parser, prompt, bounded schema)', () => {
  it('edit_intent and compose_scaffold accept it; the rewrite of a text does not', () => {
    const edit = editRequest(index());
    const compose = composeRequest(index());
    expect(edit.task === 'edit_intent' && edit.arsenal).toHaveLength(8);
    expect(compose.task === 'compose_scaffold' && compose.arsenal).toHaveLength(8);
    expect(parseComposerRequest({ version: 1, task: 'revise_selected_text', message: 'Melhore', history: [],
      target: { objectId: '8d6f3c1e-2b4a-4c7d-9e0f-1a2b3c4d5e6f', text: 'Texto editorial' }, arsenal: index() })).toBeNull();
    // Without the index the request is exactly as before.
    expect('arsenal' in editRequest()).toBe(false);
    expect(COMPOSER_FEATURES).toContain('arsenal_index');
  });

  it('the whole request with the index still fits the body limit', () => {
    const doc = structuredClone(PCON);
    const history = Array.from({ length: 6 }, (_, turn) => ({ role: turn % 2 ? 'assistant' as const : 'user' as const, message: 'x'.repeat(790) }));
    const { request } = prepareEditIntentRequest(doc, 'y'.repeat(1_100), history, { activePageId: doc.pages[0].id },
      buildAssistantArsenalAiIndex(Array.from({ length: 60 }, (_, position) => presetSummary({ name: 'Modelo '.repeat(10) + position,
        category: 'paginas', kind: 'page', tags: ['etiqueta comprida um', 'etiqueta comprida dois', 'etiqueta comprida três'] }))).entries);
    expect(JSON.stringify(request).length).toBeLessThan(COMPOSER_LIMITS.maxBodyChars);
    expect(parseComposerRequest(request)).not.toBeNull();
  });

  it('the prompt carries the arsenal rule and index only when sent; both prompts carry the layout defaults', () => {
    const withIndex = JSON.parse(buildComposerPrompt(editRequest(index())));
    expect(withIndex.arsenalRule).toBe(ARSENAL_AI_RULE);
    expect(withIndex.arsenal).toHaveLength(8);
    const without = JSON.parse(buildComposerPrompt(editRequest()));
    expect(without.arsenal).toBeUndefined();
    expect(Object.keys(without)).toEqual(['system', 'colours', 'documentOutline', 'priorConversation', 'userRequest']);
    expect(JSON.parse(buildComposerPrompt(composeRequest(index()))).arsenal).toHaveLength(8);
    expect(EDIT_INTENT_SYSTEM_PROMPT).toContain(LAYOUT_DEFAULTS_POLICY);
    expect(JSON.parse(buildComposerPrompt(composeRequest())).system).toContain(LAYOUT_DEFAULTS_POLICY);
    // Flexible on layout, strict on values: both sentences are there.
    expect(LAYOUT_DEFAULTS_POLICY).toMatch(/assume sensible defaults instead of asking/);
    expect(LAYOUT_DEFAULTS_POLICY).toMatch(/Technical values stay blocked/);
  });

  it('the schema gains only the bounded use_preset branch; without the index it is the proven one', () => {
    const edit = buildGeneration(editRequest(index()), 1000).generationConfig.responseSchema as Record<string, unknown>;
    const properties = edit.properties as Record<string, Record<string, unknown>>;
    expect(properties.status.enum).toContain('use_preset');
    expect(properties.preset).toEqual({ type: 'STRING', maxLength: 5 });
    walkBounded(edit);
    walkBounded(buildGeneration(composeRequest(index()), 1000).generationConfig.responseSchema as Record<string, unknown>);
    expect(buildGeneration(editRequest(), 1000).generationConfig.responseSchema).toBe(EDIT_INTENT_RESPONSE_SCHEMA);
    expect(buildGeneration(composeRequest(), 1000).generationConfig.responseSchema).toBe(COMPOSE_RESPONSE_SCHEMA);
  });
});

describe('"usar preset <ref>": checked on the server and again in the browser', () => {
  it('a ref of the index sent is accepted, with or without a summary', () => {
    const request = editRequest(index());
    expect(interpretProviderReply(request, envelope({ status: 'use_preset', preset: 'a1', summary: 'Vou usar o Cabeçalho padrão.' })))
      .toEqual({ ok: true, reply: { status: 'use_preset', preset: 'a1', summary: 'Vou usar o Cabeçalho padrão.' } });
    // Leftovers of the other branches (empty) are tolerated; upper case and spaces in the ref are tidied.
    expect(interpretProviderReply(composeRequest(index()), envelope({ status: 'use_preset', preset: ' A3 ', question: '', pages: [] })))
      .toEqual({ ok: true, reply: { status: 'use_preset', preset: 'a3' } });
  });

  it('an unknown ref, a request without index, extra content or a page id is refused', () => {
    const refused = { ok: false, reason: 'CONTRACT', retryable: false };
    expect(interpretProviderReply(editRequest(index()), envelope({ status: 'use_preset', preset: 'a77' }))).toEqual(refused);
    expect(interpretProviderReply(editRequest(), envelope({ status: 'use_preset', preset: 'a1' }))).toEqual(refused);
    expect(interpretProviderReply(editRequest(index()), envelope({ status: 'use_preset', preset: 'a1',
      intents: [{ kind: 'delete_page', ref: 'p1' }] }))).toEqual(refused);
    expect(interpretProviderReply(editRequest(index()), envelope({ status: 'use_preset', preset: 'p1' }))).toEqual(refused);
    expect(interpretProviderReply(editRequest(index()), envelope({ status: 'use_preset', preset: 'a1', presetId: 'builtin:x' }))).toEqual(refused);
    expect(verifyArsenalChoice({ status: 'use_preset', preset: 'a1' }, [])).toBeNull();
  });

  it('the browser refuses a ref it did not send (edit_intent and composer)', async () => {
    const session = createDocumentSession(structuredClone(PCON), { createId: () => crypto.randomUUID() });
    const sent = index();
    const ok = await requestEditIntents(session, 'insere o cabeçalho padrão', async () => ({ status: 'use_preset', preset: 'a2' }), [], {}, sent);
    expect(ok).toEqual({ status: 'use_preset', preset: 'a2' });
    await expect(requestEditIntents(session, 'insere o cabeçalho padrão', async () => ({ status: 'use_preset', preset: 'a40' }), [], {}, sent))
      .rejects.toThrow('EDIT_INTENT_PRESET_UNKNOWN');
    await expect(requestEditIntents(session, 'insere o cabeçalho padrão', async () => ({ status: 'use_preset', preset: 'a1' })))
      .rejects.toThrow('EDIT_INTENT_PRESET_UNKNOWN');
    const doc = structuredClone(PCON);
    await expect(requestNativeCompose(doc, 'Crie uma capa nova', async () => ({ status: 'use_preset', preset: 'a1' }), [], sent))
      .resolves.toEqual({ status: 'use_preset', preset: 'a1' });
    await expect(requestNativeCompose(doc, 'Crie uma capa nova', async () => ({ status: 'use_preset', preset: 'a9' }), [], sent))
      .rejects.toThrow('AI_PRESET_UNKNOWN');
  });

  it('readiness tells the screen whether the server takes the index', async () => {
    const client = (features?: string[]) => ({ functions: { invoke: async () => ({ data: { code: 'OK', status: {
      enabled: true, serverKey: true, byok: false, remainingMicrousd: null, callReserveMicrousd: 1, tasks: ['edit_intent'],
      ...(features ? { features } : {}) } }, error: null }) } }) as unknown as NativeComposeFunctionsClient;
    expect(await readComposerReadiness(client(['arsenal_index']))).toMatchObject({ kind: 'ready', arsenalIndex: true });
    expect(await readComposerReadiness(client())).not.toHaveProperty('arsenalIndex');
  });
});

describe('technical values stay blocked with the arsenal in the request (INVENTED_NUMBER)', () => {
  it('a number the person did not type is refused on the server and in the browser', () => {
    const request = editRequest(index(), 'Coloque a exatidão do PCON no rodapé');
    if (request.task !== 'edit_intent') throw new Error('EDIT');
    const target = request.outline.pages[0].detail!.find(object => object.kind === 'text' && object.text && !object.cut)!.ref;
    const result = interpretProviderReply(request, envelope({ status: 'proposal', summary: 'Vou escrever a exatidão.',
      intents: [{ kind: 'set_text', ref: target, text: 'Exatidão 0,0137%' }] }));
    expect(result.ok && result.reply).toMatchObject({ status: 'proposal', intents: [],
      blocked: [{ kind: 'set_text', target, code: 'INVENTED_NUMBER' }] });
    // The browser repeats the check with its own outline, whatever the server says.
    const doc = structuredClone(PCON);
    const outline = buildDocumentOutline(doc, { activePageId: doc.pages[0].id });
    const planned = planEditIntents(doc, 0, outline, { status: 'proposal', summary: 'Vou escrever a exatidão.',
      intents: [{ kind: 'set_text', target, text: 'Exatidão 0,0137%' }], blocked: [] }, ['Coloque a exatidão do PCON no rodapé']);
    expect(planned.status === 'plan' && planned.plan.items).toEqual([]);
    expect(planned.status === 'plan' && planned.plan.blocked[0].reason).toMatch(/número que não está no catálogo/);
  });

  it('a number typed by the person is kept (and shown to confirm)', () => {
    const request = editRequest(index(), 'Troque o título da capa para PCON-Y18');
    if (request.task !== 'edit_intent') throw new Error('EDIT');
    const title = request.outline.pages[0].detail!.find(object => object.hint === 'titulo')!.ref;
    const result = interpretProviderReply(request, envelope({ status: 'proposal', summary: 'Vou trocar o título.',
      intents: [{ kind: 'set_text', ref: title, text: 'PCON-Y18' }] }));
    expect(result.ok && result.reply).toMatchObject({ status: 'proposal', intents: [{ kind: 'set_text', target: title, text: 'PCON-Y18' }], blocked: [] });
  });
});
