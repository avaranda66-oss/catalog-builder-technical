import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { NativeStyleSection } from '@/vnext/app/editor/NativeStyleSection';
import { PageBackgroundSection } from '@/vnext/app/editor/PageBackgroundSection';
import { ElementInsertButtons } from '@/vnext/app/editor/ElementInsertButtons';
import { TextInspectorSection } from '@/vnext/app/editor/TextInspectorSection';
import { VNextApp } from '@/vnext/app/VNextApp';

afterEach(cleanup);

function ids(prefix = 'ui') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function sessionWith(objects: EditorialObject[]): DocumentSession {
  const base = createW2CDemoDocument(ids('doc'));
  const document: CatalogDocument = { ...base, style: { ...base.style, palette: ['#092D4D', '#8A642B', '#FFFFFF'] }, pages: [{ ...base.pages[0], objects }] };
  return createDocumentSession(document, { createId: ids('generated') });
}

function objectOf<T extends EditorialObject['type']>(session: DocumentSession, id: string, type: T): Extract<EditorialObject, { type: T }> {
  for (const object of session.getSnapshot().document.pages[0].objects) {
    const found = (object.type === 'group' ? [object, ...object.objects] : [object]).find((entry) => entry.id === id);
    if (found && found.type === type) return found as Extract<EditorialObject, { type: T }>;
  }
  throw new Error(`Missing ${type} ${id}`);
}

const typeInto = (input: HTMLElement, value: string) => {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

const pickColor = (input: HTMLElement, value: string) => {
  fireEvent.input(input, { target: { value } });
  fireEvent.change(input, { target: { value } });
};

const shape: EditorialObject = { id: 'shape', type: 'shape', shape: 'rectangle', frame: { xMm: 20, yMm: 20, widthMm: 40, heightMm: 20 }, zIndex: 0,
  style: { fill: '#EDF5FF', stroke: { pattern: 'solid', thicknessPt: 1, color: '#003F78' } } };
const line: EditorialObject = { id: 'line', type: 'line', axis: 'horizontal', color: '#003366', frame: { xMm: 20, yMm: 60, widthMm: 100, heightMm: 0.8 }, zIndex: 1 };
const polygon: EditorialObject = { id: 'polygon', type: 'polygon', frame: { xMm: 0, yMm: 0, widthMm: 210, heightMm: 120 }, zIndex: -1,
  points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 1 }], style: { fill: { kind: 'solid', color: '#092D4D' } } };
const text: EditorialObject = { id: 'text', type: 'text', frame: { xMm: 14, yMm: 150, widthMm: 36, heightMm: 8 }, zIndex: 3,
  text: plainRichText('text', 'Saída pneumática'), style: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, fontWeight: 400, color: '#172033', textAlign: 'left' } };

const sectionProps = (session: DocumentSession, messages: string[] = []) => ({
  session, disabled: false, prepare: () => true, onMessage: (message: string) => { messages.push(message); },
});

describe('Onda 3.5 "Forma" / "Linha" / "Polígono" panel', () => {
  it('changes the fill of a shape with a brand swatch, then opacity and rounded corners in Avançado; Desfazer undoes one step', () => {
    const session = sessionWith([shape]);
    render(<NativeStyleSection object={objectOf(session, 'shape', 'shape')} {...sectionProps(session)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cor de preenchimento #8A642B' }));
    expect(objectOf(session, 'shape', 'shape').style.fill).toBe('#8A642B');
    fireEvent.click(screen.getByRole('button', { name: /Mais opções \(Avançado\)/ }));
    typeInto(document.querySelector<HTMLInputElement>('[data-native-opacity]')!, '50');
    typeInto(document.querySelector<HTMLInputElement>('[data-native-corner-radius]')!, '2,5');
    expect(objectOf(session, 'shape', 'shape').style).toMatchObject({ fill: '#8A642B', opacity: 0.5, cornerRadiusMm: 2.5 });
    fireEvent.click(screen.getByRole('button', { name: 'Tracejado' }));
    expect(objectOf(session, 'shape', 'shape').style.strokeDash).toBe('dashed');
    session.undo();
    expect(objectOf(session, 'shape', 'shape').style.strokeDash).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Sem preenchimento' }));
    expect(objectOf(session, 'shape', 'shape').style.fill).toBeUndefined();
  });

  it('accepts any colour from the colour picker (not only the palette)', () => {
    const session = sessionWith([shape]);
    render(<NativeStyleSection object={objectOf(session, 'shape', 'shape')} {...sectionProps(session)} />);
    pickColor(document.querySelector<HTMLInputElement>('[data-native-fill-picker]')!, '#f3ddb8');
    expect(objectOf(session, 'shape', 'shape').style.fill).toBe('#F3DDB8');
  });

  it('sets a line colour, a thickness typed with a comma and a dotted stroke', () => {
    const session = sessionWith([line]);
    render(<NativeStyleSection object={objectOf(session, 'line', 'line')} {...sectionProps(session)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cor da linha #8A642B' }));
    typeInto(document.querySelector<HTMLInputElement>('[data-native-line-width]')!, '1,5');
    fireEvent.click(screen.getByRole('button', { name: 'Pontilhado' }));
    expect(objectOf(session, 'line', 'line')).toMatchObject({ color: '#8A642B', thicknessPt: 1.5, dash: 'dotted' });
  });

  it('switches a polygon to gradient and pattern, and edits a vertex in millimetres', () => {
    const session = sessionWith([polygon]);
    render(<NativeStyleSection object={objectOf(session, 'polygon', 'polygon')} {...sectionProps(session)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Degradê' }));
    expect(objectOf(session, 'polygon', 'polygon').style.fill).toMatchObject({ kind: 'linear', from: '#092D4D', to: '#8A642B' });
    fireEvent.click(screen.getByRole('button', { name: 'Padrão' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ondas' }));
    expect(objectOf(session, 'polygon', 'polygon').style.fill).toMatchObject({ kind: 'pattern', pattern: 'waves' });
    fireEvent.click(screen.getByRole('button', { name: /Mais opções \(Avançado\)/ }));
    typeInto(screen.getByRole('textbox', { name: 'Ponto 3, Y' }), '84');
    expect(objectOf(session, 'polygon', 'polygon').points[2]).toEqual({ x: 1, y: 0.7 });
    fireEvent.click(screen.getByRole('button', { name: 'Triângulo' }));
    expect(objectOf(session, 'polygon', 'polygon').points).toHaveLength(3);
  });
});

describe('Onda 3.5 "Fundo da página"', () => {
  it('sets the page colour and a catalog picture as background, and takes the colour back', () => {
    const session = sessionWith([]);
    const pageId = session.getSnapshot().document.pages[0].id;
    const messages: string[] = [];
    render(<PageBackgroundSection pageId={pageId} session={session} prepare={() => true} onMessage={(message) => messages.push(message)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cor de fundo da página #092D4D' }));
    expect(session.getSnapshot().document.pages[0].background).toEqual({ color: '#092D4D' });
    const assetId = session.getSnapshot().document.assets[0].id;
    fireEvent.change(document.querySelector('[data-page-background-image]')!, { target: { value: assetId } });
    expect(session.getSnapshot().document.pages[0].background).toEqual({ color: '#092D4D', image: { assetId, fit: 'cover' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sem cor (branco)' }));
    expect(session.getSnapshot().document.pages[0].background).toEqual({ image: { assetId, fit: 'cover' } });
    expect(messages.at(-1)).toMatch(/Fundo da página alterado/);
  });
});

describe('Onda 3.5 text: free size and colour, Avançado, selo and chamada', () => {
  const renderText = (session: DocumentSession) => render(<TextInspectorSection object={objectOf(session, 'text', 'text')} simple
    session={session} measurement={null} disabled={false} prepare={() => true} onMessage={() => undefined} />);

  it('takes a size with a comma, any colour, letter spacing and line height', () => {
    const session = sessionWith([text]);
    renderText(session);
    typeInto(document.querySelector<HTMLInputElement>('[data-text-size]')!, '7,2');
    pickColor(document.querySelector<HTMLInputElement>('[data-text-color-picker]')!, '#f3ddb8');
    fireEvent.click(screen.getAllByRole('button', { name: /Mais opções \(Avançado\)/ })[0]);
    typeInto(document.querySelector<HTMLInputElement>('[data-text-letter-spacing]')!, '10');
    typeInto(document.querySelector<HTMLInputElement>('[data-text-line-height]')!, '1,1');
    expect(objectOf(session, 'text', 'text').style).toMatchObject({ fontSizePt: 7.2, color: '#F3DDB8', letterSpacingEm: 0.1, lineHeight: 1.1 });
  });

  it('adds a selo and a pointer to a text box, then moves the pointer tip with page millimetres', () => {
    const session = sessionWith([text]);
    renderText(session);
    fireEvent.click(screen.getAllByRole('button', { name: /Mais opções \(Avançado\)/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar fundo (selo)' }));
    expect(objectOf(session, 'text', 'text').box).toMatchObject({ fill: '#092D4D', fitText: true });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar seta (chamada)' }));
    expect(objectOf(session, 'text', 'text').leader).toMatchObject({ head: 'dot' });
    typeInto(document.querySelector<HTMLInputElement>('[data-text-leader-x]')!, '120');
    typeInto(document.querySelector<HTMLInputElement>('[data-text-leader-y]')!, '140,5');
    expect(objectOf(session, 'text', 'text').leader).toMatchObject({ anchorXMm: 106, anchorYMm: -9.5 });
    fireEvent.click(screen.getByRole('button', { name: 'Seta' }));
    expect(objectOf(session, 'text', 'text').leader?.head).toBe('arrow');
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-text-decoration]')!).getByRole('button', { name: 'Cor do selo #8A642B' }));
    expect(objectOf(session, 'text', 'text').box?.fill).toBe('#8A642B');
  });
});

describe('Onda 3.5 "Mais opções > Elementos"', () => {
  it('inserts each native element as one Desfazer step and selects it', () => {
    const session = sessionWith([]);
    const pageId = session.getSnapshot().document.pages[0].id;
    const inserted: string[] = [];
    render(<ElementInsertButtons session={session} pageId={pageId} prepare={() => true} onMessage={() => undefined}
      onInserted={(objectId) => inserted.push(objectId)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Faixa diagonal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chamada' }));
    const objects = session.getSnapshot().document.pages[0].objects;
    expect(objects.map((object) => object.type)).toEqual(['polygon', 'text', 'text']);
    expect(objects[1].type === 'text' && objects[1].box).toBeTruthy();
    expect(objects[2].type === 'text' && objects[2].leader).toBeTruthy();
    expect(inserted).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Barra da família' }));
    const bar = session.getSnapshot().document.pages[0].objects.at(-1)!;
    expect(bar.type).toBe('group');
    expect(bar.type === 'group' && bar.objects.every((child) => child.type === 'text' && child.box)).toBe(true);
    expect(bar.type === 'group' && bar.objects).toHaveLength(6);
    session.undo();
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(3);
  });

  it('is offered under "Mais opções" of the editor in simple mode, and the side panel styles the selected polygon', () => {
    const session = sessionWith([]);
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="toggle-advanced-tools"]')!);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="add-polygon-triangle"]')!);
    const created = session.getSnapshot().document.pages[0].objects[0];
    expect(created.type).toBe('polygon');
    expect(screen.getByRole('heading', { name: 'Polígono', level: 2 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cor de preenchimento #092D4D' }));
    expect(objectOf(session, created.id, 'polygon').style.fill).toEqual({ kind: 'solid', color: '#092D4D' });
  });
});
