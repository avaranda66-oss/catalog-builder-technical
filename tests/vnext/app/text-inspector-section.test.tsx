import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { frameToCanonicalU, mmToU, plainRichText, uToQ, type CatalogDocument, type TextObject } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { TextInspectorSection } from '@/vnext/app/editor/TextInspectorSection';
import { ISSUE_FIXES, issueFixFor } from '@/vnext/app/editor/issue-fixes';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { FitHeightMeasurement } from '@/vnext/editor/table-fit-height-authoring';

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function ids(prefix = 'ui') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function textDocument(options: { locked?: boolean; style?: TextObject['style']; frame?: TextObject['frame'] } = {}): CatalogDocument {
  const base = createW2CDemoDocument(ids('doc'));
  const text: TextObject = {
    id: 'text-target', type: 'text', frame: options.frame ?? { xMm: 20, yMm: 30, widthMm: 72, heightMm: 10 }, zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    text: plainRichText('text-local', 'Faixa de medição de 0 a 100 °C'),
    style: options.style ?? { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, fontWeight: 400, color: '#172033', textAlign: 'left' },
  };
  return { ...base, pages: [{ ...base.pages[0], objects: [text] }] };
}

function textOf(session: DocumentSession): TextObject {
  const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === 'text-target');
  if (!object || object.type !== 'text') throw new Error('Missing text');
  return object;
}

/** A measurement of the current catalog in which the text needs `heightMm` (and fits in width). */
function measurement(document: CatalogDocument, heightMm: number, overflow = false): FitHeightMeasurement {
  const object = document.pages[0].objects[0];
  const frame = frameToCanonicalU(object.frame);
  return {
    source: document,
    plans: new Map(),
    diagnostics: overflow
      ? [{ code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR', details: 'Text exceeds authored object frame', pageId: document.pages[0].id, objectId: object.id }]
      : [],
    snapshot: {
      facts: [{
        kind: 'object', pageId: document.pages[0].id, objectId: object.id,
        authoredXU: frame.xU, authoredYU: frame.yU, authoredWidthU: frame.widthU, authoredHeightU: frame.heightU,
        xQ: uToQ(frame.xU), yQ: uToQ(frame.yU), widthQ: uToQ(frame.widthU), heightQ: uToQ(frame.heightU),
        textFlowSignature: 'a'.repeat(64), intrinsicContentWidthQ: uToQ(mmToU(60)), intrinsicContentHeightQ: uToQ(mmToU(heightMm)),
      }],
      geometryDiagnostics: [],
    },
  };
}

function renderSection(options: { session?: DocumentSession; measurement?: FitHeightMeasurement | null; disabled?: boolean; simple?: boolean; prepare?: () => boolean } = {}) {
  const session = options.session ?? createDocumentSession(textDocument(), { createId: ids('generated') });
  const onMessage = vi.fn();
  const props = () => ({
    object: textOf(session), simple: options.simple ?? true, disabled: options.disabled ?? false, session,
    measurement: options.measurement === undefined ? null : options.measurement, prepare: options.prepare ?? (() => true), onMessage,
  });
  const view = render(<TextInspectorSection {...props()} />);
  const rerender = () => view.rerender(<TextInspectorSection {...props()} />);
  return { session, onMessage, view, rerender };
}

describe('FR-14 "Básico" block for a text box', () => {
  it('shows kind, bold, colours and alignment, with the current choice pressed', () => {
    renderSection();
    const block = screen.getByRole('region', { name: 'Básico' });
    const kind = within(block).getByRole('group', { name: 'Tipo' });
    expect(within(kind).getAllByRole('button').map((button) => button.textContent)).toEqual(['Título 16 pt', 'Subtítulo 12 pt', 'Corpo 10 pt', 'Nota 8 pt']);
    expect(within(kind).getByRole('button', { name: /Corpo/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(kind).getByRole('button', { name: /Título/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(block).getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'false');
    const colours = within(block).getByRole('group', { name: 'Cor' });
    expect(within(colours).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Azul-marinho', 'Azul', 'Preto', 'Branco']);
    expect(within(colours).getByRole('button', { name: 'Preto' })).toHaveAttribute('aria-pressed', 'true');
    const alignment = within(block).getByRole('group', { name: 'Alinhamento' });
    expect(within(alignment).getAllByRole('button').map((button) => button.textContent)).toEqual(['Esquerda', 'Centro', 'Direita']);
    expect(within(alignment).getByRole('button', { name: 'Esquerda' })).toHaveAttribute('aria-pressed', 'true');
    expect(block).not.toHaveTextContent(/#[0-9A-F]{6}|fontSize|setStyle/i);
  });

  it('each click changes the text box once, and Desfazer goes back one click', () => {
    const { session, rerender } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /Título/ }));
    expect(textOf(session).style).toMatchObject({ fontSizePt: 16, fontWeight: 700 });
    rerender();
    expect(screen.getByRole('button', { name: /Título/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Negrito' }));
    expect(textOf(session).style.fontWeight).toBe(400);
    rerender();
    fireEvent.click(screen.getByRole('button', { name: 'Azul-marinho' }));
    expect(textOf(session).style.color).toBe('#003366');
    rerender();
    fireEvent.click(screen.getByRole('button', { name: 'Centro' }));
    expect(textOf(session).style.textAlign).toBe('center');

    act(() => { session.undo(); });
    expect(textOf(session).style).toMatchObject({ color: '#003366', textAlign: 'left' });
    act(() => { session.undo(); session.undo(); session.undo(); });
    expect(textOf(session).style).toMatchObject({ fontSizePt: 10, fontWeight: 400, color: '#172033', textAlign: 'left' });
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('finishes the open edit first and changes nothing when that is not possible', () => {
    const prepare = vi.fn(() => false);
    const { session } = renderSection({ prepare });
    const before = session.getSnapshot().document;
    fireEvent.click(screen.getByRole('button', { name: /Título/ }));
    expect(prepare).toHaveBeenCalledOnce();
    expect(session.getSnapshot().document).toBe(before);
  });

  it('shows a custom size plainly when it is none of the four kinds', () => {
    const session = createDocumentSession(textDocument({ style: { fontSizePt: 14 } }), { createId: ids() });
    renderSection({ session });
    expect(screen.getByText('Tamanho atual: 14 pt')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tipo' }).querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('is read-only with the reason when the box is locked', () => {
    const session = createDocumentSession(textDocument({ locked: true }), { createId: ids() });
    renderSection({ session, disabled: true });
    const reason = screen.getByText('A caixa de texto está bloqueada. Desbloqueie para mudar o texto.');
    for (const button of within(screen.getByRole('region', { name: 'Básico' })).getAllByRole('button')) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-describedby', reason.id);
    }
  });

  it('is called "Estilo do texto" in the full mode', () => {
    renderSection({ simple: false });
    expect(screen.getByRole('region', { name: 'Estilo do texto' })).toBeInTheDocument();
  });
});

describe('FR-15 "Ajustar altura ao texto"', () => {
  it('waits for the measurement with a plain reason', () => {
    renderSection({ measurement: null });
    const button = screen.getByRole('button', { name: 'Ajustar altura ao texto' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Medindo o texto…');
  });

  it('grows an overflowing box to its text in one click, which Desfazer reverts', () => {
    const session = createDocumentSession(textDocument(), { createId: ids() });
    const document = session.getSnapshot().document;
    const { onMessage } = renderSection({ session, measurement: measurement(document, 24, true) });
    expect(screen.getByText(/O texto não cabe na caixa/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar altura ao texto' }));
    expect(textOf(session).frame.heightMm).toBeGreaterThan(23.9);
    expect(textOf(session).frame.heightMm).toBeLessThanOrEqual(24);
    expect(textOf(session).frame).toMatchObject({ xMm: 20, yMm: 30, widthMm: 72 });
    expect(onMessage).toHaveBeenCalledWith('Altura da caixa ajustada: agora o texto cabe inteiro. Use Desfazer se precisar.');
    act(() => { session.undo(); });
    expect(textOf(session).frame.heightMm).toBe(10);
  });

  it('does not grow past the bottom margin and says what to do instead', () => {
    const session = createDocumentSession(textDocument({ frame: { xMm: 20, yMm: 270, widthMm: 72, heightMm: 10 } }), { createId: ids() });
    const document = session.getSnapshot().document;
    renderSection({ session, measurement: measurement(document, 30, true) });
    const button = screen.getByRole('button', { name: 'Ajustar altura ao texto' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/não cabe até a margem de baixo da página/);
  });
});

describe('FR-15 one-click fix for TEXT_OBJECT_OVERFLOW', () => {
  it('is registered next to the table fixes', () => {
    expect(ISSUE_FIXES.TEXT_OBJECT_OVERFLOW.label).toBe('Ajustar altura ao texto');
  });

  it('is offered only with a current measurement in which the text fits the page, and fixes the box', () => {
    const session = createDocumentSession(textDocument(), { createId: ids() });
    const document = session.getSnapshot().document;
    const diagnostic = { code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR' as const, details: '', pageId: document.pages[0].id, objectId: 'text-target' };
    expect(issueFixFor({ document, session, diagnostic })).toBeUndefined();
    const fix = issueFixFor({ document, session, diagnostic, measurement: measurement(document, 30) });
    expect(fix?.label).toBe('Ajustar altura ao texto');
    expect(fix!.run({ document, session, diagnostic, measurement: measurement(document, 30) }).ok).toBe(true);
    expect(textOf(session).frame.heightMm).toBeGreaterThan(29.9);

    const lowSession = createDocumentSession(textDocument({ frame: { xMm: 20, yMm: 270, widthMm: 72, heightMm: 10 } }), { createId: ids() });
    const low = lowSession.getSnapshot().document;
    expect(issueFixFor({ document: low, session: lowSession, diagnostic: { ...diagnostic, pageId: low.pages[0].id }, measurement: measurement(low, 30) })).toBeUndefined();
  });
});

describe('FR-14 in the editor the father uses', () => {
  function selectText(container: HTMLElement) {
    const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
    page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 70, button: 0, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(hit, { pointerId: 70, button: 0, clientX: 80, clientY: 70 });
  }

  it('makes a title from the side panel in the simple mode, and Desfazer brings the body text back', () => {
    const session = createDocumentSession(textDocument(), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    selectText(container);
    const block = screen.getByRole('region', { name: 'Básico' });
    fireEvent.click(within(block).getByRole('button', { name: /Título/ }));
    expect(textOf(session).style).toMatchObject({ fontSizePt: 16, fontWeight: 700 });
    expect(within(block).getByRole('button', { name: /Título/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer última alteração' }));
    expect(textOf(session).style).toMatchObject({ fontSizePt: 10, fontWeight: 400 });
  });

  it('creates new text as body text (10 pt, normal), not as a 16 pt bold title', () => {
    const session = createDocumentSession(createW2CDemoDocument(ids('doc')), { createId: ids('generated') });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="add-text"]')!);
    const created = session.getSnapshot().document.pages[0].objects.find((object) => object.type === 'text');
    expect(created?.type === 'text' && created.style).toMatchObject({ fontSizePt: 10, fontWeight: 400 });
    expect(screen.getByRole('button', { name: /Corpo/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
