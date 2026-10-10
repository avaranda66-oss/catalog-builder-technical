import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GeminiPlannerChat } from '../../../src/vnext/ai-catalog/GeminiPlannerChat';
import { prepareCatalogAgentRequest, type CatalogAgentRequest } from '../../../src/vnext/ai-catalog/gemini-plan';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(cleanup);
afterAll(() => vi.unstubAllGlobals());

describe('Bounded Gemini planning context; no PDF/source fact disclosure', () => {
  it('sends previous user+assistant dialogue on the second message, not just the current prompt', async () => {
    const input = await createSyntheticSpecifications();
    const gateway = vi.fn(async (_request: CatalogAgentRequest) => ({ status: 'clarification', question: 'Qual seção deve aparecer primeiro?' }));
    const approve = vi.fn();
    render(<GeminiPlannerChat input={input} gateway={gateway} onApprove={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await screen.findByText(/Qual seção deve aparecer primeiro/);
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido para o Gemini' }),
      { target: { value: 'Comece por elétrica e preserve as seções anteriores.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await waitFor(() => expect(gateway).toHaveBeenCalledTimes(2));
    const first = gateway.mock.calls[0][0];
    const second = gateway.mock.calls[1][0];
    expect(first.history).toBeUndefined();
    expect(second.history).toEqual([
      { role: 'user', message: 'Crie um catálogo profissional comparando estes modelos.' },
      { role: 'assistant', message: 'Qual seção deve aparecer primeiro?' },
    ]);
    expect(second.message).toBe('Comece por elétrica e preserve as seções anteriores.');
    expect(JSON.stringify(second)).not.toContain('original-synthetic-specifications');
  });
  it('limits context to eight prior messages and sanitizes key-like strings', async () => {
    const input = await createSyntheticSpecifications();
    const gateway = vi.fn(async (_request: CatalogAgentRequest) => ({ status: 'clarification', question: 'Deseja confirmar a ordem atual?' }));
    render(<GeminiPlannerChat input={input} gateway={gateway} onApprove={vi.fn()} />);
    for (let i = 0; i < 8; i++) {
      fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido para o Gemini' }), {
        target: { value: 'Planeje rodada ' + i + '. AQ.FAKE_DONT_SEND_THIS_000000000000000' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
      await waitFor(() => expect(gateway).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(screen.getAllByText(/Deseja confirmar a ordem atual/)).toHaveLength(i + 1));
    }
    const last = gateway.mock.calls.at(-1)![0];
    expect(last.history).toHaveLength(8);
    expect(JSON.stringify(last.history)).not.toContain('FAKE_DONT_SEND_THIS');
    expect(JSON.stringify(last.history)).toContain('[CREDENCIAL_OCULTA]');
    expect(last.message).toContain('rodada 7');
  });
  it('fails closed when strict client contract exceeds allowed roles or turn sizes', async () => {
    const input = await createSyntheticSpecifications();
    expect(() => prepareCatalogAgentRequest(input, 'Comparar modelos.', [{
      role: 'assistant', message: 'x'.repeat(801),
    }])).toThrow();
    expect(() => prepareCatalogAgentRequest(input, 'Comparar modelos.',
      Array.from({ length: 9 }, () => ({ role: 'user', message: 'Contexto.' })))).not.toThrow();
  });
});
