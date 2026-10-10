import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import { GeminiPlannerChat } from '../../../src/vnext/ai-catalog/GeminiPlannerChat';

afterEach(cleanup);
describe('Gemini catalog chat - bounded planning with simulated provider', () => {
  it('accepts a safe natural-language proposal only after explicit human click', async () => {
    const input = await createSyntheticSpecifications();
    const approve = vi.fn();
    const gateway = vi.fn(async () => ({
      status: 'proposal',
      plan: {
        version: 1, template: 'comparison-a4-v1',
        style: 'comparison',
        sectionOrder: input.sections.map(x => x.id),
        rowsPerPage: 8,
      },
    }));
    render(<GeminiPlannerChat input={input} gateway={gateway} onApprove={approve} />);
    fireEvent.change(screen.getByLabelText('Seu pedido para o Gemini'), {
      target: { value: 'Crie um catálogo profissional com uma comparação clara.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await screen.findByText(/Preparei uma proposta de organização/);
    expect(approve).not.toHaveBeenCalled();
    expect(gateway).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(gateway.mock.calls[0])).not.toContain('sha256');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar proposta e gerar catálogo' }));
    expect(approve).toHaveBeenCalledTimes(1);
  });
  it('rejects a provider plan containing invented section IDs without touching the document', async () => {
    const input = await createSyntheticSpecifications();
    const approve = vi.fn();
    render(<GeminiPlannerChat input={input} onApprove={approve}
      gateway={async () => ({
        status: 'proposal',
        plan: { version: 1, template: 'comparison-a4-v1',
          style: 'comparison', sectionOrder: ['invented', 'electric'], rowsPerPage: 8 },
      })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Nenhum catálogo foi modificado/));
    expect(approve).not.toHaveBeenCalled();
  });
});
