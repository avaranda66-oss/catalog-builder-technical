import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createDocumentSession, type DocumentSession } from '../../../src/vnext/application';
import { createPresysArchetypeTemplateRegistry } from '../../../src/vnext/library/presys-archetypes';
import { applyLocalAction, planLocalStyle } from '../../../src/vnext/ai-catalog/local-assistant-actions';
import { applyEditPlan } from '../../../src/vnext/ai-catalog/edit-intents';
import { routeLocally, type LocalAction } from '../../../src/vnext/arsenal/local-router';
import { routerDocument } from '../arsenal/arsenal-ia-fixtures';

/**
 * Onda 4.5 — what the router without AI found, done with the editor's existing actions: one Desfazer, nothing changed
 * on failure, values never written.
 */
beforeAll(() => { vi.stubGlobal('crypto', webcrypto); });

function session(withTemplates = true): DocumentSession {
  return createDocumentSession(routerDocument(), {
    createId: () => crypto.randomUUID(), ...(withTemplates ? { templateRegistry: createPresysArchetypeTemplateRegistry() } : {}),
  });
}
function found(target: DocumentSession, message: string, selectedObjectIds: string[] = []): LocalAction {
  const document = target.getSnapshot().document;
  const result = routeLocally(message, { document, activePageId: document.pages[0].id, selectedObjectIds });
  if (result.kind !== 'local' || result.primary.kind !== 'action') throw new Error('NO_ACTION');
  return result.primary.action;
}
const fontSize = (target: DocumentSession, objectId: string) => {
  const object = target.getSnapshot().document.pages[0].objects.find(entry => entry.id === objectId);
  return object?.type === 'text' ? object.style.fontSizePt : undefined;
};

describe('a new table, without the AI', () => {
  it('"bota uma tabela com 5 linhas" adds an empty 5 × 3 table with a header row, as one Desfazer', () => {
    const target = session();
    const before = target.getSnapshot().document;
    const action = found(target, 'bota uma tabela com 5 linhas');
    if (action.type === 'style') throw new Error('STYLE');
    const result = applyLocalAction(target, action, { activePageId: before.pages[1].id });
    expect(result).toMatchObject({ ok: true, pageId: before.pages[1].id, newPage: false });
    expect(result.ok && result.text).toBe('Tabela nova de 5 linhas × 3 colunas, com a primeira linha como cabeçalho, na página 2. '
      + 'Fiz sem usar IA. As células ficam vazias: os valores vêm do PDF ou da planilha. Um Desfazer volta tudo.');
    const table = target.getSnapshot().document.pages[1].objects.find(object => object.type === 'table');
    expect(table?.type === 'table' && table.table.rows.map(row => row.role ?? 'body')).toEqual(['header', 'body', 'body', 'body', 'body']);
    expect(table?.type === 'table' && table.table.columns).toHaveLength(3);
    expect(table?.type === 'table' && table.table.cells.every(cell => cell.content.type === 'empty')).toBe(true);
    target.undo();
    expect(target.getSnapshot().document).toEqual(before);
  });
});

describe('a PRESYS model page, without the AI', () => {
  it('"nova página de acessórios" inserts P7 after the open page, as one Desfazer', () => {
    const target = session();
    const before = target.getSnapshot().document;
    const action = found(target, 'nova página de acessórios');
    if (action.type === 'style') throw new Error('STYLE');
    const result = applyLocalAction(target, action, { activePageId: before.pages[0].id });
    expect(result).toMatchObject({ ok: true, newPage: true });
    const pages = target.getSnapshot().document.pages;
    expect(pages).toHaveLength(3);
    expect(result.ok && pages[1].id).toBe(result.ok && result.pageId);
    expect(result.ok && result.text).toMatch(/^Pus a página-modelo P7: Fornecimento padrão e acessórios depois da página 1, sem usar IA\./);
    target.undo();
    expect(target.getSnapshot().document).toEqual(before);
  });

  it('an empty open page is replaced, not left blank before the model page', () => {
    const target = session();
    const before = target.getSnapshot().document;
    const action = found(target, 'insere uma capa');
    if (action.type === 'style') throw new Error('STYLE');
    const result = applyLocalAction(target, action, { activePageId: before.pages[1].id });
    const pages = target.getSnapshot().document.pages;
    expect(pages).toHaveLength(2);
    expect(pages[0].id).toBe(before.pages[0].id);
    expect(result.ok && pages[1].id).toBe(result.ok && result.pageId);
    expect(result.ok && result.text).toMatch(/^Pus a página-modelo P1: Capa no lugar da página em branco, sem usar IA\./);
    target.undo();
    expect(target.getSnapshot().document).toEqual(before);
  });

  it('an editor without that model says so and changes nothing', () => {
    const target = session(false);
    const before = target.getSnapshot().document;
    const action = found(target, 'nova página de acessórios');
    if (action.type === 'style') throw new Error('STYLE');
    expect(applyLocalAction(target, action, { activePageId: before.pages[0].id })).toEqual({ ok: false,
      text: 'Este editor não tem a página-modelo P7. Use “Usar modelo…” ou peça à IA. Nada foi mudado.' });
    expect(target.getSnapshot().document).toEqual(before);
  });

  it('"no final": the model page goes after the LAST page, even with another page open', () => {
    const target = session();
    const before = target.getSnapshot().document;
    const action = found(target, 'poe a contra capa no final');
    if (action.type === 'style') throw new Error('STYLE');
    expect(action).toMatchObject({ type: 'page.template', archetypeId: 'P9', atEnd: true });
    // The last page is blank: it is replaced, as for any model page.
    const result = applyLocalAction(target, action, { activePageId: before.pages[0].id });
    expect(result.ok && result.text).toMatch(/^Pus a página-modelo P9: Contracapa no lugar da página em branco, sem usar IA\./);
    expect(target.getSnapshot().document.pages.at(-1)?.id).toBe(result.ok && result.pageId);
    target.undo();
    expect(target.getSnapshot().document).toEqual(before);
  });
});

describe('a blank page, without the AI', () => {
  it('"poe uma pagina em branco" adds an empty page after the open page, as one Desfazer', () => {
    const target = session();
    const before = target.getSnapshot().document;
    const action = found(target, 'poe uma pagina em branco');
    if (action.type === 'style') throw new Error('STYLE');
    const result = applyLocalAction(target, action, { activePageId: before.pages[0].id });
    expect(result).toMatchObject({ ok: true, newPage: true, text: 'Pus uma página em branco depois da página 1, sem usar IA. Um Desfazer volta tudo.' });
    const pages = target.getSnapshot().document.pages;
    expect(pages).toHaveLength(3);
    expect(pages[1]).toMatchObject({ id: result.ok && result.pageId, objects: [] });
    target.undo();
    expect(target.getSnapshot().document).toEqual(before);
  });
});

describe('a style change, on the card of the conversation that edits', () => {
  it('"aumenta o título" makes the plan "Vou fazer isto" with before/after; Aplicar is one Desfazer', () => {
    const target = session();
    const before = target.getSnapshot().document;
    const action = found(target, 'aumenta o título');
    if (action.type !== 'style') throw new Error('NOT_STYLE');
    const plan = planLocalStyle(target, action, 'aumenta o título')!;
    expect(plan.summary).toBe('Aumentar a letra, sem usar IA.');
    expect(plan.items).toEqual([expect.objectContaining({ kind: 'text_size', title: 'Aumentar a letra', before: '28 pt', after: '33,5 pt' })]);
    expect(target.getSnapshot().document).toEqual(before);
    applyEditPlan(target, plan);
    expect(fontSize(target, 'title')).toBe(33.5);
    target.undo();
    expect(target.getSnapshot().document).toEqual(before);
  });

  it('"pinta de vermelho" on the selected band, and a plan for an object that is gone is not made', () => {
    const target = session();
    const action = found(target, 'pinta de vermelho', ['band']);
    if (action.type !== 'style') throw new Error('NOT_STYLE');
    expect(planLocalStyle(target, action, 'pinta de vermelho', ['band'])!.items[0].title).toBe('Mudar a cor para vermelho');
    expect(planLocalStyle(target, { ...action, objectId: 'gone' }, 'pinta de vermelho')).toBeUndefined();
  });
});
