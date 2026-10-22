/**
 * FR-64: "Criar com IA a partir de arquivos" creates a blank catalog and opens it with the assistant already open,
 * so the person drops the files right there. Nothing travels between the pages but this one address parameter:
 * the files are never stored in the browser on the way (creating a catalog reloads the page).
 */

/** `/v2?catalog=<id>&assistente=1` opens the editor with the assistant panel open. */
export const ASSISTANT_REQUEST_PARAM = 'assistente';

/** Address of the editor for one catalog, optionally with the assistant open. */
export function catalogEditorUrl(catalogId: string, options: { assistant?: boolean } = {}): string {
  const url = `/v2?catalog=${encodeURIComponent(catalogId)}`;
  return options.assistant ? `${url}&${ASSISTANT_REQUEST_PARAM}=1` : url;
}

/** Whether an address search string ("?catalog=…&assistente=1") asks for the assistant. */
export function assistantRequested(search: string | undefined = globalThis.location?.search): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get(ASSISTANT_REQUEST_PARAM) === '1';
  } catch {
    return false;
  }
}

/**
 * Takes the request out of the address once the editor has read it, so a later F5 does not open the assistant again.
 * The rest of the address (the catalog) is kept as it is.
 */
export function forgetAssistantRequest(target: Pick<Window, 'location' | 'history'> | undefined = globalThis.window): void {
  if (!target?.location || !target.history?.replaceState) return;
  try {
    const url = new URL(target.location.href);
    if (!url.searchParams.has(ASSISTANT_REQUEST_PARAM)) return;
    url.searchParams.delete(ASSISTANT_REQUEST_PARAM);
    const search = url.searchParams.toString();
    target.history.replaceState(target.history.state, '', `${url.pathname}${search ? `?${search}` : ''}${url.hash}`);
  } catch {
    // An address the browser cannot rewrite only means the assistant may open again after F5.
  }
}
