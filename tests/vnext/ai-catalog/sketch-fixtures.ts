import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import type { DraftClient } from '@/vnext/ai-catalog/draft-client';
import { requestSketchInterpretation, type SketchInterpretation } from '@/vnext/ai-catalog/sketch-client';

/**
 * Answers of the real Gemini recorded by slice R (docs/ai-catalog/rascunho-servidor/rodada-1/raw): the photos of
 * the spike sketches (cover, specifications, accessories), as the Edge function returned them.
 */
export const SKETCH_RAW = `${resolve(process.cwd(), 'docs/ai-catalog/rascunho-servidor/rodada-1/raw')}/`;
export type RecordedSketch = 'capa_foto.jpg' | 'especificacoes_foto.jpg' | 'acessorios_foto.jpg' | 'capa.png' | 'especificacoes.png' | 'acessorios.png';
export function recordedSketchReply(fileName: RecordedSketch): unknown {
  return (JSON.parse(readFileSync(`${SKETCH_RAW}${fileName}.json`, 'utf8')) as { response: { json: unknown } }).response.json;
}
/** The interpretation exactly as the browser client builds it (validated again, fitted to the PRESYS models). */
export async function recordedInterpretation(fileName: RecordedSketch): Promise<SketchInterpretation> {
  const client: DraftClient = {
    functions: { invoke: vi.fn(async () => ({ data: recordedSketchReply(fileName), error: null })) },
    storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ data: { path: 'x' }, error: null })) })) },
  };
  return requestSketchInterpretation(client, { path: 'u/x.jpg', sha256: '0'.repeat(64), mimeType: 'image/jpeg', fileName });
}
/** A PNG header of the given size (enough for the size checks; no pixels). */
export function pngBytes(width = 1131, height = 1600): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
