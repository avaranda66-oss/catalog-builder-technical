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
  widthMm: number, heightMm: number, fontSizePt = 10, weight: 400 | 700 = 400) {
  return {
    type: 'text' as const,
    frame: { xMm, yMm, widthMm, heightMm },
    zIndex: 2, text: paragraphs(id, text),
    style: { fontFamily: 'Noto Sans', fontSizePt, fontWeight: weight,
      lineHeight: 1.25, color: weight === 700 ? '#003366' : '#172033' },
  };
}
function bar(xMm: number, yMm: number, widthMm: number, heightMm: number) {
  return {
    type: 'shape' as const, shape: 'rectangle' as const,
    frame: { xMm, yMm, widthMm, heightMm },
    zIndex: 0, style: { fill: '#003366' },
  };
}

/** Institutionally styled document shells. Facts and tables still come ONLY
 * from the existing verified deterministic compiler, never model-produced HTML.
 */
export function institutionalOpening(input: TechnicalInput, technicalPageCount: number): PageTemplateDefinition[] {
  const intro: PageTemplateDefinition = {
    id: 'institutional-cover', label: 'Capa técnica',
    safeArea, objects: [
      bar(18, 24, 3, 241),
      paragraph('brand', 'PRESYS  /  DOCUMENTAÇÃO TÉCNICA', 30, 32, 160, 14, 16, 700),
      paragraph('kind', 'CADERNO INSTITUCIONAL\nCOMPARAÇÃO TÉCNICA DE INSTRUMENTOS',
        30, 74, 160, 55, 23, 700),
      paragraph('document-title', input.title, 30, 144, 160, 37, 15),
      paragraph('models-heading', 'MODELOS ANALISADOS', 30, 207, 160, 11, 11, 700),
      paragraph('models', input.models.join('   /   '), 30, 222, 160, 19, 12),
      bar(30, 247, 160, 2.5),
      paragraph('scope', 'MATERIAL SINTÉTICO DE TESTE · Revisão humana obrigatória',
        30, 263, 160, 18, 9),
    ],
  };
  const index: PageTemplateDefinition = {
    id: 'institutional-index', label: 'Sumário',
    safeArea, objects: [
      paragraph('toc-heading', 'SUMÁRIO TÉCNICO', 22, 29, 170, 20, 21, 700),
      bar(29, 58, 161, 2.5),
      paragraph('toc-metadata', `${input.models.length} modelos · ${input.sections.length} seções · ${technicalPageCount} páginas de especificações`,
        29, 69, 162, 13, 11),
      ...input.sections.map((section, index) => paragraph(
        'toc-' + index,
        `${String(index + 1).padStart(2, '0')}    ${section.title}    (${section.rows.length} parâmetros)`,
        29, 88 + 11.4 * index, 162, 9.6, 10)),
      paragraph('toc-note', 'A apresentação não substitui a conferência técnica das fontes. Ausências e conflitos precisam de revisão explícita.',
        29, 269, 162, 13, 9),
    ],
  };
  return [intro, index];
}

export function institutionalClosing(input: TechnicalInput): PageTemplateDefinition[] {
  return [{
    id: 'institutional-sources', label: 'Fontes e revisão',
    safeArea, objects: [
      paragraph('source-heading', 'FONTES E CONTROLE DOCUMENTAL', 22, 29, 171, 21, 19, 700),
      bar(29, 58, 161, 2.5),
      paragraph('source-identity', `Documento: ${input.title}\nModelos: ${input.models.join(' / ')}\nSeções técnicas: ${input.sections.length}`,
        29, 70, 162, 38, 10),
      ...input.sources.map((source, index) => paragraph(
        'source-entry-' + index,
        `${index + 1}. ${source.name} · rev. ${source.revision} · ${source.pages.length} páginas de entrada\nID ${source.id} · hash da fixture: ${source.sha256.slice(0, 16)}…`,
        29, 121 + index * 23, 162, 20, 9)),
      paragraph('source-boundary',
        'CONTROLE DE DEMONSTRAÇÃO\nEstes dados são sintéticos e não representam especificações de instrumentos reais. Os hashes identificam fixtures estruturadas, não autenticam arquivos PDF de fabricantes. Publicação comercial somente após revisão humana e validação das fontes.',
        29, 239, 162, 42, 9),
    ],
  }];
}
