import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { quickToolForRequest, quickToolLabel, runQuickTool } from '../../../src/vnext/ai-catalog/assistant-quick-tools';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

const id = () => crypto.randomUUID();
const session = () => createDocumentSession(createCatalogDocument(id, 'Catálogo'), { createId: id });
const everywhere = { onPublication: () => undefined, onEditor: () => undefined };

describe('quick actions of the assistant (no AI)', () => {
  it('runs a short, clear request here and sends anything longer to the AI', () => {
    expect(quickToolForRequest('Desfaça', everywhere)).toBe('undo');
    expect(quickToolForRequest('refazer', everywhere)).toBe('redo');
    expect(quickToolForRequest('Deixe as tabelas mais compactas', everywhere)).toBe('compact');
    expect(quickToolForRequest('Abra a revisão do PDF', everywhere)).toBe('publication');
    expect(quickToolForRequest('Abra a revisão do PDF', {})).toBeNull();
    expect(quickToolForRequest('Crie uma capa', everywhere)).toBeNull();
    expect(quickToolForRequest('Deixe as tabelas mais compactas e depois crie uma página nova de apresentação para o catálogo', everywhere)).toBeNull();
  });

  it('says what happened and never changes the catalog when there is nothing to do', () => {
    const s = session();
    const before = s.getSnapshot().document;
    expect(runQuickTool('compact', { session: s })).toMatch(/^Ainda não há tabelas/);
    expect(runQuickTool('undo', { session: s })).toMatch(/^Não há alteração para desfazer/);
    expect(runQuickTool('redo', { session: s })).toMatch(/^Não há alteração desfeita/);
    expect(s.getSnapshot().document).toBe(before);
  });

  it('undoes and redoes the last change, and waits for an open edit to finish', () => {
    const s = session();
    expect(s.execute({ type: 'page.add' }).ok).toBe(true);
    expect(runQuickTool('undo', { session: s, onBeforeMutation: () => false })).toMatch(/^Conclua ou cancele/);
    expect(s.getSnapshot().document.pages).toHaveLength(2);
    expect(runQuickTool('undo', { session: s })).toMatch(/^Executei Desfazer/);
    expect(s.getSnapshot().document.pages).toHaveLength(1);
    expect(runQuickTool('redo', { session: s })).toMatch(/^Executei Refazer/);
    expect(s.getSnapshot().document.pages).toHaveLength(2);
  });

  it('opens the PDF review only for a saved version', () => {
    const onPublication = vi.fn();
    expect(runQuickTool('publication', { session: session(), canPublish: false, onPublication })).toMatch(/^Primeiro confira e salve/);
    expect(onPublication).not.toHaveBeenCalled();
    expect(runQuickTool('publication', { session: session(), canPublish: true, onPublication })).toMatch(/^Abri a revisão/);
    expect(onPublication).toHaveBeenCalledTimes(1);
    expect(quickToolLabel('compact')).toBe('Deixar as tabelas mais compactas');
  });
});
