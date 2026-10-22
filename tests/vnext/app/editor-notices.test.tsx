import type React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorNotices } from '@/vnext/app/editor/EditorNotices';
import { SaveConflictDialog } from '@/vnext/app/editor/ConflictDialog';
import {
  classifyEditorNotice, editorNoticeAutoHides, editorNoticeText, editorNoticeTimeoutMs, editorNoticeTone, LONG_NOTICE_MIN_TIMEOUT_MS,
  SUCCESS_NOTICE_TIMEOUT_MS, successNotice,
} from '@/vnext/editor/editor-notices';
import type { ConflictResolutionResult, ConflictResolutionState, SaveProjection } from '@/vnext/persistence';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const idle: SaveProjection = { phase: 'idle', label: 'Saved', dirty: false, canSave: true };
const conflict: SaveProjection = { phase: 'conflict', label: 'Conflict', dirty: true, canSave: false };

describe('FR-12 status message tone', () => {
  it.each([
    ['Enviando imagem…', 'progress'],
    ['Objeto excluído.', 'success'],
    ['Conteúdo da célula atualizado.', 'success'],
    ['3 linhas inseridas. Use Desfazer para remover o lote.', 'success'],
    ['Não foi possível excluir o objeto.', 'error'],
    ['Selecione uma única célula para editar o conteúdo.', 'error'],
    ['Altura ajustada. Parte da tabela ficou fora da página; revise a composição.', 'error'],
    ['Toque na célula, linha ou coluna final.', 'error'],
    ['Nenhuma tabela foi criada.', 'error'],
    // Refusals and instructions that also contain a success word must stay on screen.
    ['O texto foi bloqueado antes da conclusão; o rascunho não foi aplicado.', 'error'],
    ['O conteúdo interno copiado não é válido para esta tabela.', 'error'],
    ['Esta alteração faria uma célula mesclada cruzar cabeçalho e corpo.', 'error'],
    ['Legenda/caption só pode ser aplicada à tabela.', 'error'],
    ['Tabela de 4 linhas × 3 colunas adicionada. Confira a altura e os limites A4 antes de publicar.', 'error'],
    ['Rascunho local recuperado. Confirme ou cancele antes de salvar.', 'error'],
    ['Largura e altura devem ser maiores que zero.', 'error'],
    // Words that start or end with an accented letter are matched as whole words.
    ['Não há alterações para desfazer.', 'error'],
    ['Página adicionada.', 'success'],
    ['Objeto desbloqueado.', 'success'],
    ['Modo de grade da tabela.', 'info'],
    ['Você saiu da edição da tabela.', 'info'],
    // FR-31 table paste results (verified in the browser: they used to show as red errors that never left).
    ['Tabela criada com 12 linhas e 4 colunas. A primeira linha virou o cabeçalho, em destaque. Para voltar, use Desfazer.', 'success'],
    ['Tabela aumentada em 3 linhas e 12 células coladas. Para voltar, use Desfazer.', 'success'],
    ['Texto sem alterações.', 'info'],
  ] as const)('%s → %s', (message, tone) => {
    expect(classifyEditorNotice(message)).toBe(tone);
  });

  it('uses the tone the caller passes instead of reading the sentence', () => {
    const tip = 'Tabela de 6 linhas × 3 colunas adicionada. Para escrever nela, clique em Editar tabela.';
    expect(classifyEditorNotice(tip)).toBe('error');
    expect(editorNoticeTone(successNotice(tip))).toBe('success');
    expect(editorNoticeText(successNotice(tip))).toBe(tip);
    expect(editorNoticeTone(tip)).toBe('error');
    expect(editorNoticeText(tip)).toBe(tip);
  });

  it('lets only errors and work in progress stay on screen', () => {
    expect(['progress', 'error', 'success', 'info'].filter((tone) => editorNoticeAutoHides(tone as never))).toEqual(['success', 'info']);
  });
});

describe('C-03 how long each message stays', () => {
  const pasteResult = 'Tabela criada com 12 linhas e 4 colunas. A primeira linha virou o cabeçalho, em destaque. Para voltar, use Desfazer.';

  it('lets a short success leave after 4 s and keeps errors, instructions and progress until closed', () => {
    expect(editorNoticeTimeoutMs('Objeto excluído.')).toBe(SUCCESS_NOTICE_TIMEOUT_MS);
    expect(editorNoticeTimeoutMs('Texto sem alterações.')).toBe(SUCCESS_NOTICE_TIMEOUT_MS);
    expect(editorNoticeTimeoutMs('Conteúdo da célula atualizado.')).toBe(SUCCESS_NOTICE_TIMEOUT_MS);
    // A success that also says how to go back is an instruction: it stays long enough to be read.
    expect(editorNoticeTimeoutMs('3 linhas inseridas. Use Desfazer para remover o lote.')).toBe(LONG_NOTICE_MIN_TIMEOUT_MS);
    expect(editorNoticeTimeoutMs('Não foi possível excluir o objeto.')).toBeNull();
    expect(editorNoticeTimeoutMs('Selecione uma única célula para editar o conteúdo.')).toBeNull();
    expect(editorNoticeTimeoutMs('Enviando imagem…')).toBeNull();
  });

  it('lets a success that only adds a tip leave by itself after 6 to 8 s, the time to read it (J5)', () => {
    // 20 words: at 150 words per minute a 60-year-old reader needs 8 s, plus a moment to notice it (J4 measured it
    // leaving at ~4.1 s).
    expect(editorNoticeTimeoutMs(successNotice(pasteResult))).toBe(8400);
    expect(editorNoticeTimeoutMs(successNotice(pasteResult.replace('12 linhas e 4 colunas', '41 linhas e 4 colunas')))).toBe(8400);
    expect(editorNoticeTimeoutMs(successNotice('Tabela aumentada em 3 linhas e 12 células coladas. Para voltar, use Desfazer.')))
      .toBe(LONG_NOTICE_MIN_TIMEOUT_MS);
    for (const text of [pasteResult, 'Tabela aumentada em 3 linhas e 12 células coladas. Para voltar, use Desfazer.']) {
      const timeout = editorNoticeTimeoutMs(successNotice(text))!;
      expect(timeout).toBeGreaterThanOrEqual(6000);
      expect(timeout).toBeLessThanOrEqual(8500);
    }
    // Longer text still gets its reading time.
    const thirtyWords = Array.from({ length: 30 }, (_, index) => `palavra${index}`).join(' ') + ' atualizado.';
    expect(editorNoticeTimeoutMs(successNotice(thirtyWords))).toBeGreaterThan(8500);
  });

  it('keeps errors and real instructions until closed, however long they are', () => {
    const heic = 'Esta foto está no formato HEIC, do iPhone, que ainda não é aceito. Envie a foto em JPEG ou peça a quem a tirou.';
    expect(editorNoticeTimeoutMs(heic)).toBeNull();
    expect(editorNoticeTimeoutMs('Selecione uma única célula para editar o conteúdo.')).toBeNull();
    expect(editorNoticeTimeoutMs({ text: heic, tone: 'error' })).toBeNull();
  });
});

function renderNotices(props: Partial<React.ComponentProps<typeof EditorNotices>> = {}) {
  const onDismissMessage = vi.fn();
  const view = render(<EditorNotices message={null} onDismissMessage={onDismissMessage} save={idle} {...props} />);
  return { view, onDismissMessage };
}

describe('FR-12 editor notices', () => {
  it('hides a success message after 4 seconds, even when the editor re-renders', () => {
    vi.useFakeTimers();
    const { view, onDismissMessage } = renderNotices({ message: 'Objeto excluído.' });
    expect(screen.getByRole('status')).toHaveTextContent('Objeto excluído.');
    act(() => { vi.advanceTimersByTime(SUCCESS_NOTICE_TIMEOUT_MS - 100); });
    view.rerender(<EditorNotices message="Objeto excluído." onDismissMessage={() => onDismissMessage()} save={idle} />);
    act(() => { vi.advanceTimersByTime(100); });
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('keeps a success that carries a tip for 6 seconds, green, and then lets it leave', () => {
    vi.useFakeTimers();
    const tip = 'Tabela de 6 linhas × 3 colunas adicionada. Para escrever nela, clique em Editar tabela.';
    const { onDismissMessage } = renderNotices({ message: successNotice(tip) });
    expect(screen.getByRole('status')).toHaveTextContent(tip);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'success');
    expect(screen.getByRole('status')).toHaveAttribute('data-notice-stays', 'long');
    act(() => { vi.advanceTimersByTime(SUCCESS_NOTICE_TIMEOUT_MS); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    const stays = editorNoticeTimeoutMs(successNotice(tip))!;
    expect(stays).toBeGreaterThanOrEqual(LONG_NOTICE_MIN_TIMEOUT_MS);
    expect(stays).toBeLessThanOrEqual(8500);
    act(() => { vi.advanceTimersByTime(stays - SUCCESS_NOTICE_TIMEOUT_MS - 100); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('hides "Tabela criada com 41 linhas" by itself in about 8 seconds, so it cannot keep covering the table (J5)', () => {
    vi.useFakeTimers();
    const created = 'Tabela criada com 41 linhas e 4 colunas. A primeira linha virou o cabeçalho, em destaque. Para voltar, use Desfazer.';
    const { onDismissMessage } = renderNotices({ message: successNotice(created) });
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'success');
    act(() => { vi.advanceTimersByTime(8300); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('pauses a long message while the pointer is over it and gives the full time again after it leaves', () => {
    vi.useFakeTimers();
    const tip = 'Tabela criada com 12 linhas e 4 colunas. A primeira linha virou o cabeçalho, em destaque. Para voltar, use Desfazer.';
    const stays = editorNoticeTimeoutMs(successNotice(tip))!;
    const { onDismissMessage } = renderNotices({ message: successNotice(tip) });
    act(() => { vi.advanceTimersByTime(stays - 1000); });
    fireEvent.mouseEnter(screen.getByRole('status'));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByRole('status'));
    act(() => { vi.advanceTimersByTime(stays - 100); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(100); });
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('keeps the HEIC photo explanation until the person closes it', () => {
    vi.useFakeTimers();
    const heic = 'Esta foto está no formato HEIC, do iPhone, que ainda não é aceito. Envie a foto em JPEG ou peça a quem a tirou.';
    const { onDismissMessage } = renderNotices({ message: heic });
    expect(screen.getByRole('status')).toHaveAttribute('data-notice-stays', 'until-closed');
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('also hides a neutral message such as "Texto sem alterações." after 4 seconds', () => {
    vi.useFakeTimers();
    const { onDismissMessage } = renderNotices({ message: 'Texto sem alterações.' });
    act(() => { vi.advanceTimersByTime(SUCCESS_NOTICE_TIMEOUT_MS); });
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('does not keep a hover pause from a message that was replaced while the pointer was over it', () => {
    vi.useFakeTimers();
    const { view, onDismissMessage } = renderNotices({ message: 'Objeto movido.' });
    fireEvent.mouseEnter(screen.getByRole('status'));
    act(() => { vi.advanceTimersByTime(SUCCESS_NOTICE_TIMEOUT_MS * 2); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    view.rerender(<EditorNotices message="Objeto excluído." onDismissMessage={onDismissMessage} save={idle} />);
    act(() => { vi.advanceTimersByTime(SUCCESS_NOTICE_TIMEOUT_MS); });
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('keeps an error until the person closes it', () => {
    vi.useFakeTimers();
    const { onDismissMessage } = renderNotices({ message: 'Não foi possível excluir o objeto.' });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(onDismissMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'error');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(onDismissMessage).toHaveBeenCalledOnce();
  });

  it('shows progress without a close button and nothing at all without a message', () => {
    const { view } = renderNotices({ message: 'Enviando imagem…' });
    expect(screen.getByRole('status')).toHaveTextContent('Enviando imagem…');
    expect(screen.queryByRole('button', { name: 'Fechar aviso' })).toBeNull();
    view.rerender(<EditorNotices message={null} onDismissMessage={vi.fn()} save={idle} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[data-editor-notices]')).toBeEmptyDOMElement();
  });

  it('floats the message over the workspace, so the page does not move when it appears or leaves', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/EditorNotices.css'), 'utf8');
    document.head.append(style);
    try {
      const { view } = renderNotices({ message: 'Texto atualizado.' });
      const area = document.querySelector<HTMLElement>('[data-editor-notices]')!;
      // Nothing else takes room in the layout: no band wrapper, and the notice itself is out of the flow.
      expect(area.children).toHaveLength(1);
      expect(document.querySelector('[data-editor-notice-bands]')).toBeNull();
      expect(getComputedStyle(screen.getByRole('status')).position).toBe('absolute');
      expect(getComputedStyle(area).position).toBe('relative');
      // A save problem is a band in the flow; the message still floats below it.
      view.rerender(<EditorNotices message="Texto atualizado." onDismissMessage={vi.fn()}
        save={{ phase: 'unavailable', label: 'Offline / unavailable', dirty: true, canSave: true }} />);
      const bands = document.querySelector<HTMLElement>('[data-editor-notice-bands]')!;
      expect(bands).toContainElement(screen.getByRole('alert'));
      expect(getComputedStyle(bands).position).not.toBe('absolute');
      expect(getComputedStyle(screen.getByRole('status')).position).toBe('absolute');
    } finally {
      style.remove();
    }
  });

  it('never takes a click away from the page: the area lets clicks through, only the cards and bands take them (J5)', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/EditorNotices.css'), 'utf8');
    document.head.append(style);
    try {
      renderNotices({
        message: 'Não foi possível excluir o objeto.',
        save: { phase: 'unavailable', label: 'Offline / unavailable', dirty: true, canSave: true },
      });
      const area = document.querySelector<HTMLElement>('[data-editor-notices]')!;
      expect(getComputedStyle(area).pointerEvents).toBe('none');
      expect(getComputedStyle(screen.getByRole('status')).pointerEvents).toBe('auto');
      expect(getComputedStyle(screen.getByRole('alert')).pointerEvents).toBe('auto');
      // A message that joined the layout (no floating place free of the selected object) takes room instead of floating.
      area.setAttribute('data-notice-placement', 'inline');
      expect(getComputedStyle(screen.getByRole('status')).position).toBe('relative');
      area.setAttribute('data-notice-placement', 'bottom');
      expect(getComputedStyle(screen.getByRole('status')).position).toBe('absolute');
    } finally {
      style.remove();
    }
  });

  it('turns a save failure and missing local protection into bands', () => {
    renderNotices({ save: { phase: 'unavailable', label: 'Offline / unavailable', dirty: true, canSave: true }, localProtectionUnavailable: true });
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0].textContent).toBe('Não foi possível proteger as alterações neste computador. Mantenha esta aba aberta e use Salvar antes de sair.');
    expect(alerts[1]).toHaveTextContent('Não foi possível salvar agora. Confira a conexão e tente Salvar novamente.');
  });
});

describe('FR-43 conflict (blocking dialog next to the editor, never a band)', () => {
  function conflictSetup(state: ConflictResolutionState = 'idle') {
    const resolution = {
      openLatest: vi.fn(async (): Promise<ConflictResolutionResult> => ({ ok: true, catalogId: 'a', kind: 'latest' })),
      saveAsCopy: vi.fn(async (): Promise<ConflictResolutionResult> => ({ ok: false, error: { code: 'OFFLINE' } })),
      keepsLocalBackup: true,
    };
    const view = render(<>
      <EditorNotices message={null} onDismissMessage={vi.fn()} save={conflict} />
      <SaveConflictDialog save={conflict} documentTitle="TA-25N — Ficha técnica" state={state} resolution={resolution} />
    </>);
    return { view, resolution };
  }

  it('opens a dialog instead of a band, offers the copy first and says exactly what each choice keeps', () => {
    conflictSetup();
    expect(document.querySelector('[data-editor-notice-bands]')).toBeNull();
    const dialog = screen.getByRole('alertdialog', { name: 'Este catálogo foi salvo em outro lugar enquanto você editava' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('cria um catálogo novo, “Cópia de TA-25N — Ficha técnica”, com tudo o que está nesta tela');
    expect(dialog).toHaveTextContent('O catálogo “TA-25N — Ficha técnica” fica com a versão salva no outro lugar; nada dele é apagado.');
    expect(dialog).toHaveTextContent('Uma cópia de segurança delas fica guardada neste computador');
    const buttons = dialog.querySelectorAll('[data-persistence-conflict-actions] button');
    expect([...buttons].map((button) => button.textContent)).toEqual(['Salvar meu trabalho como cópia', 'Abrir versão mais recente']);
  });

  it('shows nothing when the save is not in conflict or the editor has no saving service', () => {
    const resolution = { openLatest: vi.fn(), saveAsCopy: vi.fn() };
    const view = render(<SaveConflictDialog save={idle} documentTitle="x" resolution={resolution} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    view.rerender(<SaveConflictDialog save={conflict} documentTitle="x" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before discarding and only opens the latest version after confirmation', async () => {
    const { resolution } = conflictSetup();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir versão mais recente' }));
    expect(resolution.openLatest).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Tem certeza?');
    fireEvent.click(screen.getByRole('button', { name: 'Não, voltar' }));
    expect(screen.getByRole('button', { name: 'Abrir versão mais recente' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir versão mais recente' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sim, descartar minhas alterações' })); });
    expect(resolution.openLatest).toHaveBeenCalledOnce();
  });

  it('reports a failed copy inside the dialog in plain language and disables both choices while one runs', async () => {
    const { resolution } = conflictSetup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar meu trabalho como cópia' })); });
    expect(resolution.saveAsCopy).toHaveBeenCalledOnce();
    expect(within(screen.getByRole('alertdialog')).getByRole('alert'))
      .toHaveTextContent('Não foi possível salvar seu trabalho como cópia. Confira a conexão e tente de novo. Seu trabalho continua nesta tela.');
    expect(document.querySelector('[data-editor-notice]')).toBeNull();
    cleanup();
    conflictSetup('resolving-save-as-copy');
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-persistence-conflict-actions] button')];
    expect(buttons.map((button) => [button.textContent, button.disabled])).toEqual([
      ['Salvando cópia…', true], ['Abrir versão mais recente', true],
    ]);
  });
});

describe('FR-44 save explanations in the notices', () => {
  it('says that the automatic save will try again, and what to do once it gave up', () => {
    const waiting: SaveProjection = { phase: 'unavailable', label: 'Offline / unavailable', dirty: true, canSave: true,
      retry: { attempt: 1, maxAttempts: 5, nextAttemptAt: 1, exhausted: false } };
    const { view } = renderNotices({ save: waiting });
    const band = screen.getByRole('alert');
    expect(band).toHaveTextContent('Vamos tentar salvar de novo sozinhos em instantes. Você também pode clicar em Salvar.');
    expect(band).toHaveAttribute('data-tone', 'warning');
    view.rerender(<EditorNotices message={null} onDismissMessage={vi.fn()}
      save={{ ...waiting, retry: { attempt: 5, maxAttempts: 5, exhausted: true } }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tentamos salvar várias vezes sem conseguir. Quando a conexão voltar, clique em Salvar.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'error');
  });

  it('explains an expired session apart from a connection problem', () => {
    renderNotices({ save: { phase: 'unauthorized', label: 'Session expired', dirty: true, canSave: true } });
    expect(screen.getByRole('alert')).toHaveTextContent('Sua sessão expirou');
    expect(screen.getByRole('alert')).toHaveTextContent('Entre novamente com a mesma conta e clique em Salvar.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('conexão');
  });
});
