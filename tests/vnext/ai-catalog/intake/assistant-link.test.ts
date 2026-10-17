import { describe, expect, it, vi } from 'vitest';
import { assistantRequested, catalogEditorUrl, forgetAssistantRequest } from '@/vnext/ai-catalog/intake/assistant-link';

describe('FR-64 the editor address that opens the assistant', () => {
  it('builds /v2?catalog=<id>&assistente=1 and reads it back', () => {
    expect(catalogEditorUrl('cat 1')).toBe('/v2?catalog=cat%201');
    expect(catalogEditorUrl('cat-1', { assistant: true })).toBe('/v2?catalog=cat-1&assistente=1');
    expect(assistantRequested('?catalog=cat-1&assistente=1')).toBe(true);
    expect(assistantRequested('?catalog=cat-1')).toBe(false);
    expect(assistantRequested('?catalog=cat-1&assistente=0')).toBe(false);
    expect(assistantRequested('')).toBe(false);
  });

  it('takes "assistente" out of the address and keeps the catalog, so F5 does not open the panel again', () => {
    const replaceState = vi.fn();
    forgetAssistantRequest({
      location: { href: 'https://catalog.example/v2?catalog=cat-1&assistente=1#p2' } as Location,
      history: { state: { keep: true }, replaceState } as unknown as History,
    });
    expect(replaceState).toHaveBeenCalledWith({ keep: true }, '', '/v2?catalog=cat-1#p2');
    const untouched = vi.fn();
    forgetAssistantRequest({ location: { href: 'https://catalog.example/v2?catalog=cat-1' } as Location,
      history: { state: null, replaceState: untouched } as unknown as History });
    expect(untouched).not.toHaveBeenCalled();
  });
});
