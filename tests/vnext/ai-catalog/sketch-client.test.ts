// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { DRAFT_FUNCTION_NAME, DraftRequestError, type DraftClient } from '../../../src/vnext/ai-catalog/draft-client';
import {
  interpretSketchFromFile, requestSketchInterpretation, sketchErrorMessage, sketchFitSize, sketchMimeType,
} from '../../../src/vnext/ai-catalog/sketch-client';

const USER = '0f8fad5b-d9cb-469f-a165-70867728950e';
function png(width = 1131, height = 1600): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const RAW = { archetype: 'especificacoes', questions: ['A tabela continua em outra página?'], regions: [
  { kind: 'title', bbox: [40, 56, 97, 723], text: 'Especificações técnicas', instruction: '' },
  { kind: 'table', bbox: [154, 64, 656, 936], text: 'característica | TA-25N | TA-35N', instruction: 'do PDF' },
] };
const reply = (plan: Record<string, unknown> = RAW, extra: Record<string, unknown> = {}) => ({ code: 'OK', sketch: {
  // What a server would send: computed fields that the client must NOT trust (here a forged confirmation list).
  plan: { version: 1, ...plan, confirmations: [] }, dimensions: { width: 1131, height: 1600 }, attempts: 1, model: 'gemini-3.8-flash',
  modelVersion: 'gemini-3.8-flash', promptVersion: 'sketch-plan-v1', usage: { inputTokens: 1568, outputTokens: 1212, estimatedUsd: 0.0057 },
  ms: 12_200, ...extra,
} });
const httpError = (status: number, body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) });
function client(data: unknown = reply(), error: unknown = null) {
  const invoke = vi.fn(async () => ({ data, error }));
  const upload = vi.fn(async () => ({ data: { path: 'x' }, error: null }));
  const value: DraftClient = { functions: { invoke }, storage: { from: vi.fn(() => ({ upload })) } };
  return { value, invoke, upload };
}

describe('cliente do Modo rascunho', () => {
  it('aceita só fotos e imagens de uma página e calcula o tamanho de envio', () => {
    expect(sketchMimeType('rascunho.JPG')).toBe('image/jpeg');
    expect(sketchMimeType('scan', 'image/png')).toBe('image/png');
    for (const [name, type] of [['rascunho.pdf', ''], ['planilha.xlsx', ''], ['foto.heic', 'image/heic'], ['a.png', 'image/jpeg']]) {
      expect(sketchMimeType(name, type)).toBeNull();
    }
    expect(sketchFitSize(1240, 1754)).toEqual({ width: 1131, height: 1600 });
    expect(sketchFitSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(sketchFitSize(900, 1273)).toEqual({ width: 900, height: 1273 });
    expect(() => sketchFitSize(0, 10)).toThrow(RangeError);
  });

  it('guarda a imagem no bucket privado, pede interpret_sketch sem credencial e devolve o plano revalidado e encaixado', async () => {
    const box = client();
    const bytes = png();
    const result = await interpretSketchFromFile(box.value, { userId: USER, file: { name: 'rascunho.png', type: 'image/png', bytes } });
    const hash = await sha256(bytes);
    expect(box.upload).toHaveBeenCalledWith(`${USER}/${hash}.png`, bytes, { contentType: 'image/png', upsert: false });
    expect(box.invoke).toHaveBeenCalledWith(DRAFT_FUNCTION_NAME, { body: { version: 1, task: 'interpret_sketch', source: {
      path: `${USER}/${hash}.png`, sha256: hash, mimeType: 'image/png', fileName: 'rascunho.png', pageCount: 1, firstPage: 1, lastPage: 1,
    } } });
    expect(JSON.stringify(box.invoke.mock.calls)).not.toMatch(/apiKey|credential/u);
    // The digits of the header are flagged here again, whatever the server sent.
    expect(result.plan.confirmations).toEqual([expect.objectContaining({ regionId: 'region-2', status: 'confirmar',
      matches: [{ value: '25', start: 20, end: 22 }, { value: '35', start: 29, end: 31 }] })]);
    expect(result.snap).toMatchObject({ archetypeId: 'P4', requiresConfirmation: true });
    expect(result.snap.questions.map(item => item.kind)).toEqual(['layout', 'table-source']);
    expect(result).toMatchObject({ attempts: 1, model: 'gemini-3.8-flash', usage: { estimatedUsd: 0.0057 } });
  });

  it('recusa no próprio computador imagem grande, ilegível ou de outro tipo, sem enviar nada', async () => {
    for (const [file, code] of [
      [{ name: 'rascunho.png', bytes: png(1240, 1754) }, 'SOURCE_TOO_LARGE'],
      [{ name: 'rascunho.png', bytes: new Uint8Array([1, 2, 3]) }, 'INVALID_REQUEST'],
      [{ name: 'rascunho.pdf', bytes: png() }, 'SOURCE_KIND_NOT_ALLOWED'],
    ] as const) {
      const box = client();
      await expect(interpretSketchFromFile(box.value, { userId: USER, file })).rejects.toMatchObject({ code });
      expect(box.upload).not.toHaveBeenCalled(); expect(box.invoke).not.toHaveBeenCalled();
    }
  });

  it('não confia na resposta: plano inválido, caixas fora do formato ou campos estranhos viram INVALID_REPLY', async () => {
    const request = { path: `${USER}/${'a'.repeat(64)}.png`, sha256: 'a'.repeat(64), mimeType: 'image/png' as const, fileName: 'r.png' };
    for (const data of [
      reply({ ...RAW, regions: [{ ...RAW.regions[0], bbox: [97, 56, 40, 723] }] }),
      reply({ ...RAW, archetype: 'inventado' }),
      reply(RAW, { attempts: 3 }), reply(RAW, { dimensions: { width: 1700, height: 1000 } }),
      { code: 'OK' }, null,
    ]) {
      await expect(requestSketchInterpretation(client(data).value, request)).rejects.toMatchObject({ code: 'INVALID_REPLY' });
    }
  });

  it('traz só o código permitido de uma falha do servidor e explica em português simples', async () => {
    const request = { path: `${USER}/${'a'.repeat(64)}.png`, sha256: 'a'.repeat(64), mimeType: 'image/png' as const, fileName: 'r.png' };
    const failure = await requestSketchInterpretation(client(null, httpError(413, { code: 'SOURCE_TOO_LARGE', message: 'provider text' })).value, request)
      .catch(error => error);
    expect(failure).toBeInstanceOf(DraftRequestError);
    expect(failure).toMatchObject({ code: 'SOURCE_TOO_LARGE', httpStatus: 413 });
    expect(sketchErrorMessage(failure)).toBe('A imagem do rascunho é grande demais. Use uma foto de até 1600 pixels no lado maior. Nada foi alterado no catálogo.');
    expect(sketchErrorMessage(new DraftRequestError('INVALID_PROVIDER_RESPONSE', 'CONTRACT'))).toContain('foto mais nítida');
    expect(sketchErrorMessage(new DraftRequestError('AGENT_DAILY_BUDGET_EXCEEDED'))).toContain('limite de uso da IA');
    expect(sketchErrorMessage(new Error('x'))).toContain('Nada foi alterado');
  });
});
