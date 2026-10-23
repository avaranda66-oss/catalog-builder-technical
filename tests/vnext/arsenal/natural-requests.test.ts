import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createPresysArsenalBuiltinSource } from '../../../src/vnext/arsenal/builtin-source';
import { findArsenalTableValueViolations } from '../../../src/vnext/arsenal/contracts';
import { corpusArsenal, corpusDocument, NATURAL_REQUESTS, type NaturalRequest } from './natural-requests.corpus';
import { decideNaturalRequest, type LocalCaseResult } from './natural-requests.harness';

/**
 * Onda 4.5 — the father's own words, through the assistant's decision WITHOUT the AI (zero tokens). Goals:
 * ≥ 90 % of the everyday requests on the right route, no request taken for a technical value by mistake, no value
 * invented by a local answer, every technical request sent to the conversation that edits (which refuses it), every
 * complex request sent to the AI. NATURAL_REQUESTS_OUT=<file.json> writes the per-request table for the report.
 */

beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });

const document = corpusDocument();
const presets = corpusArsenal();
const results: LocalCaseResult[] = NATURAL_REQUESTS.map(entry => decideNaturalRequest(entry, document, presets).result);
const of = (kind: NaturalRequest['kind']) => results.filter(result => result.kind === kind);
const right = (result: LocalCaseResult) => result.routeOk && result.actionOk !== false;

if (process.env.NATURAL_REQUESTS_OUT) {
  writeFileSync(process.env.NATURAL_REQUESTS_OUT, JSON.stringify({
    simple: { right: of('simples').filter(right).length, total: of('simples').length },
    results,
  }, null, 1));
}

describe('the corpus', () => {
  it('has 60 requests: 44 everyday ones, 10 complex and 6 asking for technical values nobody gave', () => {
    expect(NATURAL_REQUESTS).toHaveLength(60);
    expect(of('simples')).toHaveLength(44);
    expect(of('complexo')).toHaveLength(10);
    expect(of('tecnico')).toHaveLength(6);
    expect(new Set(NATURAL_REQUESTS.map(entry => entry.id)).size).toBe(60);
    for (const topic of ['capa', 'tabela', 'cabecalho', 'rodape', 'pagina', 'estilo', 'traducao'] as const) {
      expect(NATURAL_REQUESTS.some(entry => entry.topic === topic)).toBe(true);
    }
  });

  it('every selection and every expected object exists in the catalog of the corpus', () => {
    const ids = new Set(document.pages.flatMap(page => page.objects.map(object => object.id)));
    for (const entry of NATURAL_REQUESTS) {
      for (const id of entry.selection ?? []) expect(ids.has(id), `${entry.id}: ${id}`).toBe(true);
      if (entry.expected.action.type === 'style') expect(ids.has(entry.expected.action.objectId), entry.id).toBe(true);
    }
  });

  it('every preset named by the corpus is in the arsenal', () => {
    const names = new Set(presets.map(preset => preset.name));
    for (const entry of NATURAL_REQUESTS) {
      const action = entry.expected.action;
      const listed = action.type === 'preset' || action.type === 'use_preset' ? action.names
        : action.type === 'page.template' ? action.presetNames : [];
      for (const name of listed) expect(names.has(name), `${entry.id}: ${name}`).toBe(true);
    }
  });
});

describe('router without AI over the corpus', () => {
  it('≥ 90 % of the everyday requests take the right route with the right action', () => {
    const simple = of('simples');
    const wrong = simple.filter(result => !right(result)).map(result => `${result.id} "${result.message}" → ${result.route}: ${result.got}`);
    expect(simple.filter(right).length / simple.length, wrong.join('\n')).toBeGreaterThanOrEqual(0.9);
  });

  it('no everyday request is taken for a technical value', () => {
    expect(results.filter(result => result.undueRefusal).map(result => result.id)).toEqual([]);
  });

  it('no local answer writes a value nobody typed; a new table always comes with empty cells', () => {
    expect(results.filter(result => result.inventedValue).map(result => result.id)).toEqual([]);
  });

  it('every request for a technical value nobody gave goes to the conversation that edits, which refuses it', () => {
    for (const result of of('tecnico')) expect(result.route, `${result.id}: ${result.got}`).toBe('edit_intent');
  });

  it('every complex request goes to the AI', () => {
    for (const result of of('complexo')) {
      expect(['edit_intent', 'composer'], `${result.id}: ${result.got}`).toContain(result.route);
      expect(result.routeOk, `${result.id} → ${result.route}`).toBe(true);
    }
  });

  it('a built-in table offered locally brings labels and "A COMPLETAR", never a technical value', () => {
    const builtins = new Map(createPresysArsenalBuiltinSource().list().map(preset => [preset.name, preset]));
    let checked = 0;
    for (const result of results.filter(entry => entry.route === 'local' && entry.got.startsWith('arsenal: '))) {
      const preset = builtins.get(result.got.slice('arsenal: '.length));
      if (preset?.payload.kind !== 'table') continue;
      checked += 1;
      const texts = preset.payload.table.cells.map(cell => cell.content.type === 'richText'
        ? cell.content.value.paragraphs.flatMap(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '')).join('')
        : '');
      // A body cell with a digit is only allowed as a field label waiting to be filled ("Campo 1 do código (A COMPLETAR)").
      expect(texts.filter(text => /\d/.test(text) && !text.includes('A COMPLETAR')), result.id).toEqual([]);
      expect(findArsenalTableValueViolations(preset.payload.table).every(violation => violation.code !== 'TABLE_TITLE'), result.id).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
