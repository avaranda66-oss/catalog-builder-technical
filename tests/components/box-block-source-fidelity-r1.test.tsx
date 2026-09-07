import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxBlock } from '@/components/editor/blocks/BoxBlock';
import { CleanA4Document } from '@/components/export/CleanA4Document';
import type { Catalog, ContentBlock } from '@/domain/catalog.schema';
import { useCatalogStore } from '@/stores/useCatalogStore';

const PLACEHOLDER = 'Digite notas técnicas ou advertências metrológicas...';
const RAW_IMAGE = '<img src=x onerror="void 0">';
const RAW_SPAN = '<span data-r1-source="literal" onclick="void 0">AUDIT</span>';

const originalActions = {
  updateBlock: useCatalogStore.getState().updateBlock,
  setSelectedBlockId: useCatalogStore.getState().setSelectedBlockId
};

const updateBlock = vi.fn();
const setSelectedBlockId = vi.fn();

const makeBlock = (textContent: string): ContentBlock => ({
  id: 'box-r1-source-fidelity',
  type: 'box',
  textContent
});

const makeCatalog = (textContent: string): Catalog => ({
  id: 'catalog-r1-source-fidelity',
  title: 'BoxBlock source fidelity',
  description: 'Deterministic local fixture',
  status: 'draft',
  version: 1,
  themeId: 'default',
  locale: 'pt-BR',
  pages: [
    {
      id: 'page-r1-source-fidelity',
      pageNumber: 1,
      blocks: [makeBlock(textContent)]
    }
  ],
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z'
});

const enterEditing = (container: HTMLElement): HTMLElement | HTMLTextAreaElement => {
  const display = container.querySelector<HTMLElement>('[data-printable-field="textContent"]');
  expect(display).not.toBeNull();
  fireEvent.focus(display!);

  const textarea = container.querySelector<HTMLTextAreaElement>(
    'textarea[data-printable-field="textContent"]'
  );
  if (textarea) {
    return textarea;
  }

  Object.defineProperty(display!, 'innerText', {
    configurable: true,
    get: () => display!.textContent ?? ''
  });
  return display!;
};

const changeSource = (editor: HTMLElement | HTMLTextAreaElement, value: string) => {
  if (editor instanceof HTMLTextAreaElement) {
    fireEvent.change(editor, { target: { value } });
    return;
  }

  editor.textContent = value;
  fireEvent.input(editor);
};

const leaveEditing = (editor: HTMLElement | HTMLTextAreaElement) => {
  fireEvent.blur(editor);
};

describe('RECON.R1.1 — BoxBlock authoritative source fidelity', () => {
  beforeEach(() => {
    updateBlock.mockReset();
    setSelectedBlockId.mockReset();
    useCatalogStore.setState({ updateBlock, setSelectedBlockId });
  });

  afterEach(() => {
    cleanup();
    useCatalogStore.setState(originalActions);
    vi.restoreAllMocks();
  });

  it('R1-T1: does not persist rendered bold text after a no-op edit boundary', () => {
    const { container } = render(
      <BoxBlock block={makeBlock('**forte**')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe('**forte**');
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
    expect(container.querySelector('strong')?.textContent).toBe('forte');
  });

  it('R1-T2: exposes and preserves exact italic source across a no-op edit boundary', () => {
    const { container } = render(
      <BoxBlock block={makeBlock('*ênfase*')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe('*ênfase*');
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
    expect(container.querySelector('em')?.textContent).toBe('ênfase');
  });

  it('R1-T3: keeps placeholder presentation separate from an empty authoritative source', () => {
    const { container } = render(
      <BoxBlock block={makeBlock('')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    expect(container.textContent).toContain(PLACEHOLDER);
    const editor = enterEditing(container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe('');
    expect((editor as HTMLTextAreaElement).placeholder).toBe(PLACEHOLDER);
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
  });

  it('R1-T4: preserves leading and trailing whitespace exactly', () => {
    const source = '  texto técnico  ';
    const { container } = render(
      <BoxBlock block={makeBlock(source)} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe(source);
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
  });

  it('R1-T4: persists intentionally edited edge whitespace without trimming', () => {
    const exactDraft = '  texto técnico revisado  ';
    const { container } = render(
      <BoxBlock
        block={makeBlock('texto técnico')}
        pageId="page-r1-source-fidelity"
        isSelected={false}
      />
    );

    const editor = enterEditing(container);
    changeSource(editor, exactDraft);
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledWith(
      'page-r1-source-fidelity',
      'box-r1-source-fidelity',
      { textContent: exactDraft }
    );
  });

  it('R1-T5: preserves multiline source and its trailing newline exactly', () => {
    const source = 'linha 1\nlinha 2\n';
    const { container } = render(
      <BoxBlock block={makeBlock(source)} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe(source);
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
  });

  it('R1-T5: persists an intentional multiline edit including its trailing newline', () => {
    const exactDraft = 'linha 1\nlinha 2\n';
    const { container } = render(
      <BoxBlock block={makeBlock('linha 1')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    changeSource(editor, exactDraft);
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledWith(
      'page-r1-source-fidelity',
      'box-r1-source-fidelity',
      { textContent: exactDraft }
    );
  });

  it('R1-T6: keeps literal HTML inert before, during, and after an exact raw-source edit', () => {
    const initialBlock = makeBlock(RAW_IMAGE);
    const view = render(
      <BoxBlock block={initialBlock} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.textContent).toContain(RAW_IMAGE);

    const editor = enterEditing(view.container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe(RAW_IMAGE);
    changeSource(editor, RAW_SPAN);
    expect(view.container.querySelector('span[data-r1-source="literal"]')).toBeNull();
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledWith(
      'page-r1-source-fidelity',
      'box-r1-source-fidelity',
      { textContent: RAW_SPAN }
    );

    view.rerender(
      <BoxBlock block={makeBlock(RAW_SPAN)} pageId="page-r1-source-fidelity" isSelected={false} />
    );
    expect(view.container.querySelector('span[data-r1-source="literal"]')).toBeNull();
    expect(view.container.querySelector('[onclick]')).toBeNull();
    expect(view.container.textContent).toContain(RAW_SPAN);
  });

  it('R1-T7: persists an intentional raw-source edit exactly', () => {
    const { container } = render(
      <BoxBlock block={makeBlock('**forte**')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    changeSource(editor, '**fortíssimo**');
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledTimes(1);
    expect(updateBlock).toHaveBeenCalledWith(
      'page-r1-source-fidelity',
      'box-r1-source-fidelity',
      { textContent: '**fortíssimo**' }
    );
  });

  it('R1-T8: persists intentional markup removal as plain source', () => {
    const { container } = render(
      <BoxBlock block={makeBlock('**forte**')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(container);
    changeSource(editor, 'forte');
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledTimes(1);
    expect(updateBlock).toHaveBeenCalledWith(
      'page-r1-source-fidelity',
      'box-r1-source-fidelity',
      { textContent: 'forte' }
    );
  });

  it('R1-T9: renders supported formatting through safe React nodes in display mode', () => {
    const { container } = render(
      <BoxBlock
        block={makeBlock('Normal **forte** e *ênfase*')}
        pageId="page-r1-source-fidelity"
        isSelected={false}
      />
    );

    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelector('em')?.textContent).toBe('ênfase');
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('R1-T10: keeps CleanA4Document formatted, inert, and free of editing UI', () => {
    const formatted = render(<CleanA4Document document={makeCatalog('**forte** e *ênfase*')} />);
    expect(formatted.container.querySelector('strong')?.textContent).toBe('forte');
    expect(formatted.container.querySelector('em')?.textContent).toBe('ênfase');
    expect(formatted.container.querySelector('textarea')).toBeNull();
    formatted.unmount();

    const literal = render(<CleanA4Document document={makeCatalog(RAW_IMAGE)} />);
    expect(literal.container.querySelector('img')).toBeNull();
    expect(literal.container.textContent).toContain(RAW_IMAGE);
    expect(literal.container.querySelector('textarea')).toBeNull();
  });

  it('does not manufacture a stale write when source rerenders before any local edit', () => {
    const view = render(
      <BoxBlock block={makeBlock('source A')} pageId="page-r1-source-fidelity" isSelected={false} />
    );

    const editor = enterEditing(view.container);
    expect(editor).toBeInstanceOf(HTMLTextAreaElement);
    expect((editor as HTMLTextAreaElement).value).toBe('source A');

    view.rerender(
      <BoxBlock block={makeBlock('source B')} pageId="page-r1-source-fidelity" isSelected={false} />
    );
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain('source B');
  });
});
