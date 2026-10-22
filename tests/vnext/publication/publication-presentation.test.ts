import { describe, expect, it } from 'vitest';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { bleedPhrase, publicationDiagnosticDetails, publicationDiagnosticLocation, publicationDiagnosticMessage, publicationDiagnosticText, publicationWaitingMessage } from '@/vnext/app/publication-diagnostic-presentation';
import type { Diagnostic } from '@/vnext/domain';

describe('P1.C publication diagnostic presentation', () => {
  it.each([
    ['TABLE_WIDTH_INFEASIBLE', 'larguras das colunas', 'Aumente a largura'],
    ['SPAN_OUT_OF_BOUNDS', 'mesclagem', 'desfaça a mesclagem'],
    ['ROW_CONTENT_OVERFLOW', 'altura das linhas', 'Aumente a altura'],
    ['RENDER_GEOMETRY_MISMATCH', 'medidas da página', 'abra a revisão novamente'],
    ['ASSET_HASH_MISMATCH', 'imagem', 'envie a imagem novamente'],
    ['FONT_READINESS_TIMEOUT', 'fonte', 'Confira a conexão'],
    ['UNRESOLVED_PLACEHOLDER', 'texto provisório', 'Troque pela informação correta'],
    ['EMPTY_TABLE_ROW', 'linhas vazias', 'remova as que sobraram'],
    ['IMAGE_LOW_RESOLUTION', 'borrada', 'Use uma foto maior'],
  ])('explains %s with a concrete next action', (code, problem, action) => {
    const message = publicationDiagnosticMessage(code);
    expect(message).toContain(problem);
    expect(message).toContain(action);
    expect(message).not.toContain(code);
  });

  it('locates a table cell in readable page/row/column order without showing IDs', () => {
    let id = 0;
    const document = createW2CDemoDocument(() => `diagnostic-${++id}`);
    const page = document.pages[0];
    const table = { id: 'table-object-a', type: 'table' as const, frame: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 20 },
      zIndex: 0, table: createMinimalW2CTable() };
    page.objects = [{ id: 'shape-before-table', type: 'shape', frame: { xMm: 20, yMm: 10, widthMm: 20, heightMm: 5 },
      zIndex: 0, shape: 'rectangle', style: { fill: '#ffffff' } }, table];
    const cell = table.table.cells[0];
    const issue: Diagnostic = { code: 'CELL_CONTENT_OVERFLOW', severity: 'ERROR', details: 'intrinsicWidthQ=245, contentWidthQ=200',
      pageId: page.id, tableId: table.table.id, cellId: cell.id };
    const before = JSON.stringify(document);
    expect(publicationDiagnosticLocation(document, issue)).toBe('Página 1 · tabela 1 · linha 1, coluna 1');
    expect(publicationDiagnosticLocation(document, issue)).not.toContain('diagnostic-');
    expect(JSON.stringify(document)).toBe(before);
  });

  it('keeps unknown diagnostic evidence exact while giving safe general guidance', () => {
    const issue: Diagnostic = { code: 'FUTURE_LAYOUT_FAILURE', severity: 'WARNING', details: 'original=17\nexpected=21',
      pageId: 'page-a', objectId: 'object-a', tableId: 'table-a', rowId: 'row-a', cellId: 'cell-a', annotationId: 'note-a' };
    const before = JSON.stringify(issue);
    expect(publicationDiagnosticMessage(issue.code)).toContain('encaminhe os detalhes técnicos ao suporte');
    expect(publicationDiagnosticMessage(issue.code)).not.toContain(issue.details);
    expect(publicationDiagnosticDetails(issue).map(([, value]) => value)).toEqual([
      issue.code, issue.severity, issue.details, issue.pageId, issue.objectId, issue.tableId, issue.rowId, issue.cellId, issue.annotationId,
    ]);
    expect(JSON.stringify(issue)).toBe(before);
  });

  it('FR-51 quotes the provisional text and counts empty rows without exposing engine details', () => {
    const placeholder: Diagnostic = { code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR', details: 'surface=note; token=revisar com engenharia', pageId: 'p' };
    expect(publicationDiagnosticText(placeholder)).toBe('Ainda está escrito “revisar com engenharia” na nota da tabela. Troque pela informação correta antes de publicar.');
    expect(publicationDiagnosticText({ ...placeholder, details: 'unknown' })).toBe(publicationDiagnosticMessage('UNRESOLVED_PLACEHOLDER'));
    expect(publicationDiagnosticText({ code: 'EMPTY_TABLE_ROW', severity: 'WARNING', details: 'emptyRows=1' }))
      .toBe('Esta tabela tem 1 linha vazia, que sairá em branco no PDF. Preencha a linha ou remova-a.');
    expect(publicationDiagnosticText({ code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR', details: 'x' })).toBe(publicationDiagnosticMessage('TEXT_OBJECT_OVERFLOW'));
  });

  it('FR-50 explains only the save problems that keep the review waiting', () => {
    expect(publicationWaitingMessage({ phase: 'saving', label: 'Saving…', dirty: true, canSave: false })).toBeUndefined();
    expect(publicationWaitingMessage({ phase: 'idle', label: 'Unsaved changes', dirty: true, canSave: true })).toBeUndefined();
    expect(publicationWaitingMessage({ phase: 'unavailable', label: 'Offline / unavailable', dirty: true, canSave: true }))
      .toBe('Não foi possível salvar agora. Confira a conexão e tente Salvar novamente. A verificação começa sozinha assim que o catálogo for salvo.');
    expect(publicationWaitingMessage({ phase: 'conflict', label: 'Conflict', dirty: true, canSave: false })).toBe(
      'Este catálogo foi salvo em outro lugar. Clique em Voltar ao editor e escolha “Salvar meu trabalho como cópia” no aviso acima da página.');
  });
});

describe('FR-54 sangria arredondada na frase do pai', () => {
  const bleed = (details: string): Diagnostic => ({ code: 'OBJECT_OUTSIDE_PAGE', severity: 'WARNING', details, pageId: 'page', objectId: 'cover' });

  it.each([
    ['bleedMm=1.2347; toleranceMm=3', 'sai 1,2 mm da página'],
    ['bleedMm=2; toleranceMm=3', 'sai 2 mm da página'],
    ['bleedMm=0.5; toleranceMm=3', 'sai 0,5 mm da página'],
    ['bleedMm=2.96; toleranceMm=3', 'sai 3 mm da página'],
    ['bleedMm=0.05; toleranceMm=3', 'sai 0,1 mm da página'],
    ['bleedMm=0.0001; toleranceMm=3', 'sai menos de 0,1 mm da página'],
  ])('%s → "%s"', (details, phrase) => {
    const text = publicationDiagnosticText(bleed(details));
    expect(text).toContain(phrase);
    expect(text).toContain('até 3 mm');
    expect(text).not.toMatch(/\d\.\d|bleedMm|OBJECT_OUTSIDE_PAGE|WARNING/);
  });

  it('keeps the exact engine detail in the technical fields and never edits the diagnostic', () => {
    const issue = bleed('bleedMm=1.2347; toleranceMm=3');
    const before = JSON.stringify(issue);
    expect(publicationDiagnosticText(issue)).toContain('1,2 mm');
    expect(publicationDiagnosticDetails(issue)).toContainEqual(['Detalhe original', 'bleedMm=1.2347; toleranceMm=3']);
    expect(JSON.stringify(issue)).toBe(before);
  });

  it('bleedPhrase rounds to one decimal in pt-BR and names anything under 0,05 mm as "menos de 0,1 mm"', () => {
    expect(bleedPhrase(1.2347)).toBe('1,2 mm');
    expect(bleedPhrase(0.04)).toBe('menos de 0,1 mm');
    expect(bleedPhrase(0.05)).toBe('0,1 mm');
    expect(bleedPhrase(3)).toBe('3 mm');
  });

  it('falls back to the generic bleed sentence when the detail has no usable number', () => {
    for (const details of ['sem detalhe', 'bleedMm=; toleranceMm=3', 'bleedMm=abc; toleranceMm=3']) {
      expect(publicationDiagnosticText(bleed(details))).toBe('Faixa ou foto sai até 3 mm da página. Isso é normal para sangria; confira se é intencional.');
    }
  });
});
