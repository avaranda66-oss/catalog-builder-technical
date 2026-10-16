import { walkPageObjects, type CatalogDocument, type Diagnostic } from '@/vnext/domain';
import type { SaveProjection } from '../persistence';
import { fatherSaveExplanation } from './save-presentation';

/** Read-only wording for publication review; diagnostic severity and print eligibility stay with the engine. */
export function publicationDiagnosticMessage(code: string): string {
  switch (code) {
    case 'PUBLICATION_SOURCE_CHANGED':
      return 'O catálogo ou o acesso mudou. Clique em Verificar novamente. Se continuar, volte ao editor e salve.';
    case 'UNRESOLVED_PLACEHOLDER':
      return 'Ainda há um texto provisório (como “A COMPLETAR”). Troque pela informação correta antes de publicar.';
    case 'EMPTY_TABLE_ROW':
      return 'Esta tabela tem linhas vazias, que sairão em branco no PDF. Preencha as linhas ou remova as que sobraram.';
    case 'IMAGE_LOW_RESOLUTION':
      return 'Esta imagem tem pouca resolução para o tamanho em que aparece e pode sair borrada na impressão. Use uma foto maior ou diminua a imagem na página.';
    case 'SAFE_AREA_VIOLATION':
      return 'O objeto está próximo demais da borda da página. Revise a posição e deixe espaço para a margem de impressão.';
    case 'OBJECT_OUTSIDE_PAGE':
      return 'Parte do objeto está fora da página. Mova o objeto ou reduza seu tamanho no editor.';
    case 'TEXT_OBJECT_OVERFLOW':
      return 'O texto não cabe no espaço reservado. Aumente o quadro de texto ou reduza o conteúdo.';
    case 'PRINTABLE_CONTENT_OVERLAP':
      return 'O conteúdo deste objeto está sobre outro texto ou tabela. Mova os objetos para separar o conteúdo antes de publicar.';
    case 'TABLE_CONTENT_OVERFLOW':
      return 'A tabela ultrapassa a altura reservada. Aumente o quadro da tabela ou reduza seu conteúdo.';
    case 'TABLE_WIDTH_INFEASIBLE':
    case 'COLUMN_LIMIT_INVALID':
    case 'COLUMN_WEIGHT_INVALID':
      return 'As larguras das colunas não cabem no quadro da tabela. Aumente a largura da tabela ou revise as larguras das colunas nas opções avançadas.';
    case 'ROW_CONTENT_OVERFLOW':
      return 'O conteúdo não cabe na altura das linhas. Aumente a altura das linhas envolvidas ou reduza o conteúdo da célula.';
    case 'CELL_CONTENT_OVERFLOW':
      return 'O conteúdo não cabe na largura da célula. Aumente a largura da coluna ou reduza o conteúdo.';
    case 'CELL_CONTENT_BOX_NONPOSITIVE':
      return 'A célula ficou sem espaço para o conteúdo. Aumente a linha ou coluna, ou reduza o espaçamento interno da célula.';
    case 'BORDER_CONTENT_CLEARANCE':
      return 'A borda está muito próxima do conteúdo. Aumente o espaçamento interno da célula ou reduza a espessura da borda.';
    case 'INVALID_SPAN':
    case 'SPAN_OUT_OF_BOUNDS':
    case 'ROWSPAN_CONSTRAINT_INVALID':
    case 'MERGE_OVERLAP':
    case 'MERGE_INTERSECTION':
    case 'MERGE_HEADER_BOUNDARY':
    case 'COVERED_CELL_INVALID':
    case 'COVERED_BY_DANGLING':
    case 'COVERED_BY_INVALID':
      return 'A mesclagem de células não pôde ser validada. Revise as células mescladas nas opções avançadas da tabela, desfaça a mesclagem e refaça a seleção.';
    case 'RENDER_GEOMETRY_MISMATCH':
    case 'LAYOUT_UNSTABLE':
    case 'BORDER_PAINT_GEOMETRY_INVALID':
    case 'TRACK_PROJECTION_INVARIANT':
    case 'TRACK_PROJECTION_NONPOSITIVE':
    case 'ROW_PROJECTION_NONPOSITIVE':
    case 'ROW_MEASUREMENT_INVALID':
    case 'MEASUREMENT_ROOT_TRANSFORMED':
    case 'RENDER_ELEMENT_MISSING':
    case 'TEXT_RUN_DOM_MISMATCH':
      return 'Não foi possível confirmar as medidas da página. Volte ao editor, aguarde o carregamento de fontes e imagens e abra a revisão novamente. Se persistir, encaminhe os detalhes técnicos ao suporte.';
    case 'REQUIRED_FONT_MISSING':
    case 'FONT_READINESS_TIMEOUT':
      return 'Uma fonte do catálogo não carregou. Confira a conexão e abra esta revisão novamente.';
    case 'ASSET_UNAVAILABLE':
    case 'ASSET_READINESS_TIMEOUT':
    case 'ASSET_INTEGRITY_FAILED':
    case 'ASSET_REFERENCE_DANGLING':
    case 'REQUIRED_ASSET_MISSING':
    case 'ASSET_HASH_MISMATCH':
    case 'ASSET_REVISION_CHANGED':
    case 'ASSET_DIMENSIONS_MISMATCH':
    case 'IMAGE_DECODE_TIMEOUT':
    case 'IMAGE_DECODE_FAILED':
      return 'Uma imagem não pôde ser verificada. Confira a conexão e a imagem no editor; se necessário, envie a imagem novamente antes de publicar.';
    default:
      return 'Não foi possível verificar este item para publicação. Volte ao editor e abra a revisão novamente. Se persistir, encaminhe os detalhes técnicos ao suporte.';
  }
}

/** Reads one `key=value` pair from the engine detail of a content diagnostic (see publication/preflight.ts). */
function detailValue(issue: Diagnostic, key: string): string | undefined {
  for (const part of issue.details.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === key) return part.slice(separator + 1).trim();
  }
  return undefined;
}

/** Wording that may quote the exact provisional text or count; everything else falls back to the code message. */
export function publicationDiagnosticText(issue: Diagnostic): string {
  if (issue.code === 'UNRESOLVED_PLACEHOLDER') {
    const token = detailValue(issue, 'token');
    const where = { title: 'no título da tabela', note: 'na nota da tabela', legend: 'na legenda da tabela' }[detailValue(issue, 'surface') ?? ''];
    return token
      ? `Ainda está escrito “${token}”${where ? ` ${where}` : ''}. Troque pela informação correta antes de publicar.`
      : publicationDiagnosticMessage(issue.code);
  }
  if (issue.code === 'EMPTY_TABLE_ROW') {
    const count = Number(detailValue(issue, 'emptyRows'));
    if (count === 1) return 'Esta tabela tem 1 linha vazia, que sairá em branco no PDF. Preencha a linha ou remova-a.';
    if (count > 1) return `Esta tabela tem ${count} linhas vazias, que sairão em branco no PDF. Preencha as linhas ou remova as que sobraram.`;
  }
  return publicationDiagnosticMessage(issue.code);
}

export function publicationDiagnosticLocation(document: CatalogDocument, issue: Diagnostic): string {
  const pageIndex = document.pages.findIndex(page => page.id === issue.pageId);
  if (pageIndex < 0) return 'Catálogo';
  const objects = walkPageObjects(document.pages[pageIndex]);
  const objectIndex = objects.findIndex(entry => entry.object.id === issue.objectId
    || (entry.object.type === 'table' && entry.object.table.id === issue.tableId));
  const parts = [`Página ${pageIndex + 1}`];
  const object = objects[objectIndex]?.object;
  if (object) {
    const type = object.type === 'table' ? 'tabela' : object.type === 'text' ? 'texto' : object.type === 'image' ? 'imagem' : 'objeto';
    const typeIndex = objects.slice(0, objectIndex + 1).filter(entry => entry.object.type === object.type).length;
    parts.push(`${type} ${typeIndex}`);
    if (object.type === 'table') {
      const cell = issue.cellId ? object.table.cells.find(cell => cell.id === issue.cellId) : undefined;
      const rowIndex = object.table.rows.findIndex(row => row.id === (cell?.rowId ?? issue.rowId));
      const columnIndex = cell ? object.table.columns.findIndex(column => column.id === cell.columnId) : -1;
      if (rowIndex >= 0) parts.push(`linha ${rowIndex + 1}${columnIndex >= 0 ? `, coluna ${columnIndex + 1}` : ''}`);
      else if (issue.annotationId) {
        const noteIndex = object.table.annotations.findIndex(note => note.id === issue.annotationId);
        parts.push(noteIndex >= 0 ? `nota ${noteIndex + 1}` : 'nota');
      } else if (detailValue(issue, 'surface') === 'title') parts.push('título');
      else if (detailValue(issue, 'surface') === 'legend') parts.push('legenda');
    }
  }
  return parts.join(' · ');
}

export function publicationDiagnosticDetails(issue: Diagnostic): readonly (readonly [string, string])[] {
  const fields: (readonly [string, string])[] = [
    ['Código', issue.code], ['Severidade', issue.severity], ['Detalhe original', issue.details],
  ];
  for (const [key, label] of [
    ['pageId', 'Página (ID)'], ['objectId', 'Objeto (ID)'], ['tableId', 'Tabela (ID)'],
    ['rowId', 'Linha (ID)'], ['cellId', 'Célula (ID)'], ['annotationId', 'Nota (ID)'],
  ] as const) {
    const value = issue[key];
    if (value !== undefined) fields.push([label, value]);
  }
  return fields;
}

/**
 * Shown by the publication review while the saved version is not available yet. A save that is simply running
 * needs no explanation; a save that cannot finish says why, so the review never looks stuck. A conflict can only be
 * resolved in the editor (the band above the page is not reachable while the review is open), and the safe choice,
 * keeping the work as a copy, comes first (FR-43).
 */
export function publicationWaitingMessage(save: SaveProjection): string | undefined {
  if (save.phase === 'idle' || save.phase === 'saving') return undefined;
  if (save.phase === 'conflict') {
    return 'Este catálogo foi salvo em outro lugar. Clique em Voltar ao editor e escolha “Salvar meu trabalho como cópia” no aviso acima da página.';
  }
  return `${fatherSaveExplanation(save)} A verificação começa sozinha assim que o catálogo for salvo.`;
}
