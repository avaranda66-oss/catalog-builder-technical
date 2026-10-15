/**
 * FR-51: provisional text ("A COMPLETAR", "A CONFIRMAR", "TBD", "XXX", "revisar com engenharia") blocks
 * publication. Proofs that need a printable catalog first see it blocked, then fill the provisional fields the way
 * the father would: through the live editor session's typed actions (one per field), never by editing JSON.
 *
 * Runs inside the proof page, which is served by Vite, so it reuses the production preflight detector.
 */
export async function fillProvisionalContent(page, { runtimeGlobal = '__C1_RUNTIME__', replacement = 'Valor confirmado' } = {}) {
  return page.evaluate(async ({ runtimeGlobal, replacement }) => {
    const { placeholderDiagnostics, findPlaceholder, richTextPlainText } = await import('/src/vnext/publication/preflight.ts');
    const session = window[runtimeGlobal].workspace.getSnapshot().session;
    const resolve = (value) => {
      let next = value;
      for (let token = findPlaceholder(next); token; token = findPlaceholder(next)) {
        const replaced = next.includes(token) ? next.split(token).join(replacement) : replacement;
        if (replaced === next) break;
        next = replaced;
      }
      return next;
    };
    const filled = [];
    for (let guard = 0; guard < 200; guard++) {
      const document = session.getSnapshot().document;
      const [issue] = placeholderDiagnostics(document);
      if (!issue) return filled;
      const page = document.pages.find((candidate) => candidate.id === issue.pageId);
      const object = page?.objects.find((candidate) => candidate.id === issue.objectId);
      let result;
      if (object?.type === 'text' && !issue.tableId) {
        result = session.execute({ type: 'text.setContent', objectId: object.id, expectedText: object.text, plainText: resolve(richTextPlainText(object.text)) });
      } else if (object?.type === 'table' && issue.cellId) {
        const cell = object.table.cells.find((candidate) => candidate.id === issue.cellId);
        const content = cell.content.type === 'technicalCode'
          ? { type: 'technicalCode', value: resolve(cell.content.value) }
          : { type: 'richText', plainText: resolve(richTextPlainText(cell.content.value)) };
        result = session.execute({ type: 'table.cell.setContent', pageId: page.id, objectId: object.id, tableId: object.table.id,
          cellId: cell.id, expectedContent: cell.content, content });
      } else {
        throw new Error('Unsupported provisional surface in proof fixture: ' + issue.details);
      }
      if (!result.ok) throw new Error('Could not fill provisional content: ' + result.error.code);
      filled.push({ pageId: issue.pageId, objectId: issue.objectId, cellId: issue.cellId ?? null, details: issue.details });
    }
    throw new Error('Provisional content did not converge');
  }, { runtimeGlobal, replacement });
}
