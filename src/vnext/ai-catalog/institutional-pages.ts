import type { PageTemplateDefinition } from '../application/template-registry';
import type { RichText } from '../domain';
import type { TechnicalInput } from './contracts';

const safeArea = { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 };
function paragraphs(id: string, text: string): RichText {
  return { paragraphs: text.split('\n').map((part, index) => ({
    id: id + ':p' + index,
    inlines: part ? [{ kind: 'text', id: id + ':t' + index, text: part, marks: [] }] : [],
  })) };
}
function paragraph(id: string, text: string, xMm: number, yMm: number,
  widthMm: number, heightMm: number, fontSizePt = 10, weight: 400 | 700 = 400, textAlign: 'left' | 'right' = 'left') {
  return {
    type: 'text' as const,
    frame: { xMm, yMm, widthMm, heightMm },
    zIndex: 2, text: paragraphs(id, text),
    style: { fontFamily: 'Noto Sans', fontSizePt, fontWeight: weight,
      lineHeight: 1.25, color: weight === 700 ? '#003366' : '#172033', textAlign },
  };
}
function bar(xMm: number, yMm: number, widthMm: number, heightMm: number) {
  return {
    type: 'shape' as const, shape: 'rectangle' as const,
    frame: { xMm, yMm, widthMm, heightMm },
    zIndex: 0, style: { fill: '#003366' },
  };
}

/**
 * Institutionally styled document shells. Facts and tables still come ONLY
 * from the existing verified deterministic compiler, never model-produced HTML.
 *
 * FR-81: nothing printed here is a review or demonstration note. Provenance
 * (source names, revisions, fixture hashes) and the "check before publishing"
 * reminders live in the review screens, not on the customer's pages.
 *
 * `sectionStartPages[i]` is the printed page number where section i starts.
 */
export function institutionalOpening(input: TechnicalInput, sectionStartPages: readonly number[]): PageTemplateDefinition[] {
  const intro: PageTemplateDefinition = {
    id: 'institutional-cover', label: 'Capa técnica',
    safeArea, objects: [
      bar(18, 24, 3, 241),
      paragraph('brand', 'PRESYS  /  DOCUMENTAÇÃO TÉCNICA', 30, 32, 160, 14, 16, 700),
      paragraph('kind', 'CADERNO INSTITUCIONAL\nCOMPARAÇÃO TÉCNICA DE INSTRUMENTOS',
        30, 74, 160, 55, 23, 700),
      paragraph('document-title', input.title, 30, 144, 160, 37, 15),
      paragraph('models-heading', 'MODELOS', 30, 207, 160, 11, 11, 700),
      paragraph('models', input.models.join('   /   '), 30, 222, 160, 19, 12),
      bar(30, 247, 160, 2.5),
    ],
  };
  const index: PageTemplateDefinition = {
    id: 'institutional-index', label: 'Sumário',
    safeArea, objects: [
      paragraph('toc-heading', 'SUMÁRIO', 22, 29, 170, 20, 21, 700),
      bar(29, 58, 161, 2.5),
      ...input.sections.flatMap((section, index) => [
        paragraph('toc-' + index, `${String(index + 1).padStart(2, '0')}    ${section.title}`,
          29, 70 + 11.4 * index, 140, 9.6, 10),
        paragraph('toc-page-' + index, sectionStartPages[index] === undefined ? '' : String(sectionStartPages[index]),
          172, 70 + 11.4 * index, 18, 9.6, 10, 400, 'right'),
      ]),
    ],
  };
  return [intro, index];
}

/** Back cover: who made the document and for which models. No sources, hashes or review notes. */
export function institutionalClosing(input: TechnicalInput): PageTemplateDefinition[] {
  return [{
    id: 'institutional-back-cover', label: 'Contracapa',
    safeArea, objects: [
      paragraph('closing-brand', 'PRESYS', 22, 29, 171, 21, 19, 700),
      bar(29, 58, 161, 2.5),
      paragraph('closing-identity', `${input.title}\nModelos: ${input.models.join(' / ')}`,
        29, 70, 162, 38, 11),
      paragraph('closing-site', 'www.presys.com.br', 29, 262, 162, 10, 12, 700, 'right'),
    ],
  }];
}
