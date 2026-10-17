import { cleanup, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationReview } from '@/vnext/app/PublicationReview';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import type { PublicationSource } from '@/vnext/publication/review';

const checks = vi.hoisted(() => ({ review: vi.fn(), verify: vi.fn(), release: vi.fn() }));
vi.mock('@/vnext/publication/review', async original => ({ ...await original<object>(),
  reviewPublication: checks.review, verifyPublicationForPrint: checks.verify, releasePublicationResources: checks.release }));

beforeEach(() => {
  vi.resetAllMocks();
  checks.review.mockImplementation(async (source: PublicationSource) => ({ status: 'BLOCKED', document: source.document,
    plans: new Map(), urls: new Map(), diagnostics: [{ code: 'TABLE_CONTENT_OVERFLOW', severity: 'ERROR',
      details: 'intrinsicQ=9000, authoredHeightQ=4000', pageId: source.document.pages[0].id, objectId: 'table-object-1', tableId: 'table-model-1' }] }));
  checks.verify.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function open(simple?: boolean) {
  let id = 0;
  const catalog = createW2CDemoDocument(() => `simple-${++id}`);
  const source: PublicationSource = { document: catalog, openSessionId: 'open-a', remoteRevision: 1, authLineage: 'a', authorityScopeId: 'a', assetUrls: new Map() };
  return render(<PublicationReview getSource={() => source} subscribe={() => () => {}} onClose={vi.fn()} onLocateDiagnostic={vi.fn()} simple={simple} />);
}

describe('Onda 1 pending item: the publication review in the simple mode', () => {
  it('shows each item in plain words with "Corrigir este item", without "Detalhes técnicos" (codes and IDs)', async () => {
    const view = open(true);
    await waitFor(() => expect(view.getByText(/A tabela ultrapassa a altura reservada/)).toBeInTheDocument());
    const item = view.getByText(/A tabela ultrapassa a altura reservada/).closest('li')!;
    expect(within(item).getByRole('button', { name: 'Corrigir este item' })).toBeInTheDocument();
    expect(within(item).queryByText('Detalhes técnicos')).toBeNull();
    expect(item.querySelector('details')).toBeNull();
    expect(item).not.toHaveTextContent(/TABLE_CONTENT_OVERFLOW|intrinsicQ|table-object-1|simple-/);
    // Support still finds the exact problem on the item itself.
    expect(item).toHaveAttribute('data-publication-diagnostic', 'TABLE_CONTENT_OVERFLOW');
  });

  it('keeps "Detalhes técnicos", closed, outside the simple mode', async () => {
    const view = open();
    await waitFor(() => expect(view.getByText('Detalhes técnicos')).toBeInTheDocument());
    const details = view.getByText('Detalhes técnicos').closest('details')!;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('TABLE_CONTENT_OVERFLOW');
  });
});
