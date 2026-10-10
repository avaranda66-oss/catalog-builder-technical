import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeminiPlannerChat } from '../../../src/vnext/ai-catalog/GeminiPlannerChat';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import type { CatalogAgentGateway } from '../../../src/vnext/ai-catalog/gemini-plan';
import type { TechnicalInput } from '../../../src/vnext/ai-catalog/contracts';

const proposal = (input: TechnicalInput) => ({
  status: 'proposal' as const,
  plan: {
    version: 1 as const,
    template: 'comparison-a4-v1' as const,
    style: 'comparison' as const,
    sectionOrder: input.sections.map(section => section.id),
    rowsPerPage: 8,
  },
});

describe('AI agent proposal lifecycle — operator safety', () => {
  it('discards an in-flight response when source material changes', async () => {
    const original = await createSyntheticSpecifications();
    const updated = structuredClone(original);
    let complete!: (value: unknown) => void;
    const gateway: CatalogAgentGateway = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const approve = vi.fn();
    const { rerender } = render(<GeminiPlannerChat input={original} gateway={gateway} onApprove={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    expect(screen.getByRole('button', { name: 'Analisando pedido…' })).toBeDisabled();
    rerender(<GeminiPlannerChat input={updated} gateway={gateway} onApprove={approve} />);
    await act(async () => { complete(proposal(original)); });
    expect(screen.queryByRole('button', { name: 'Confirmar proposta e gerar catálogo' })).toBeNull();
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Propor organização com Gemini' })).toBeEnabled();
  });

  it('revokes a formerly valid proposal after a source swap, before approval', async () => {
    const original = await createSyntheticSpecifications();
    const changed = structuredClone(original);
    const gateway: CatalogAgentGateway = vi.fn(async () => proposal(original));
    const approve = vi.fn();
    const { rerender } = render(<GeminiPlannerChat input={original} gateway={gateway} onApprove={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await screen.findByRole('button', { name: 'Confirmar proposta e gerar catálogo' });
    rerender(<GeminiPlannerChat input={changed} gateway={gateway} onApprove={approve} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirmar proposta e gerar catálogo' })).toBeNull());
    expect(approve).not.toHaveBeenCalled();
  });

  it('does not allow approval when the model invents a section', async () => {
    const input = await createSyntheticSpecifications();
    const gateway: CatalogAgentGateway = vi.fn(async () => ({
      ...proposal(input),
      plan: { ...proposal(input).plan, sectionOrder: ['invented', ...input.sections.slice(1).map(item => item.id)] },
    }));
    const approve = vi.fn();
    render(<GeminiPlannerChat input={input} gateway={gateway} onApprove={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Confirmar proposta e gerar catálogo' })).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  it('discards a pending reply after the person edits their request', async () => {
    const input = await createSyntheticSpecifications();
    let complete!: (result: unknown) => void;
    const gateway: CatalogAgentGateway = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const approve = vi.fn();
    render(<GeminiPlannerChat input={input} gateway={gateway} onApprove={approve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido para o Gemini' }), {
      target: { value: 'Agora quero outra organização das seções.' },
    });
    await act(async () => { complete(proposal(input)); });
    expect(screen.queryByRole('button', { name: 'Confirmar proposta e gerar catálogo' })).toBeNull();
    expect(approve).not.toHaveBeenCalled();
  });

  it('requires an explicit approval for a valid plan and preserves the submitted request', async () => {
    const input = await createSyntheticSpecifications();
    const gateway: CatalogAgentGateway = vi.fn(async () => proposal(input));
    const approve = vi.fn();
    render(<GeminiPlannerChat input={input} gateway={gateway} onApprove={approve} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido para o Gemini' }), {
      target: { value: 'Comece pela descrição técnica.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Propor organização com Gemini' }));
    await screen.findByRole('button', { name: 'Confirmar proposta e gerar catálogo' });
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar proposta e gerar catálogo' }));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith(proposal(input).plan, 'Comece pela descrição técnica.');
  });
});
