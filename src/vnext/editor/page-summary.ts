import type { EditorialObject, Page, RichText } from '../domain';

/** Plain-language page facts used by the page menu and its delete confirmation. */

const NOUNS: Record<EditorialObject['type'], readonly [singular: string, plural: string]> = {
  text: ['texto', 'textos'],
  image: ['imagem', 'imagens'],
  table: ['tabela', 'tabelas'],
  shape: ['forma', 'formas'],
  line: ['linha', 'linhas'],
  icon: ['ícone', 'ícones'],
  group: ['grupo', 'grupos'],
};
const ORDER: readonly EditorialObject['type'][] = ['text', 'image', 'table', 'shape', 'line', 'icon', 'group'];

export function pageLabel(index: number): string {
  return `Página ${index + 1}`;
}

function joinPtBr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** "Esta página está vazia." / "Ela tem 1 objeto: 1 texto." / "Ela tem 5 objetos: 3 textos, 1 imagem e 1 tabela." */
export function describePageObjects(page: Page): string {
  const total = page.objects.length;
  if (total === 0) return 'Esta página está vazia.';
  const counts = new Map<EditorialObject['type'], number>();
  for (const object of page.objects) counts.set(object.type, (counts.get(object.type) ?? 0) + 1);
  const parts = ORDER.filter((type) => counts.has(type)).map((type) => {
    const count = counts.get(type)!;
    return `${count} ${count === 1 ? NOUNS[type][0] : NOUNS[type][1]}`;
  });
  return `Ela tem ${total} ${total === 1 ? 'objeto' : 'objetos'}: ${joinPtBr(parts)}.`;
}

function richTextFirstLine(text: RichText): string {
  for (const paragraph of text.paragraphs) {
    const line = paragraph.inlines.map((inline) => ('text' in inline && typeof inline.text === 'string' ? inline.text : '')).join('').trim();
    if (line) return line;
  }
  return '';
}

/** The first visible text on the page (top-most, then left-most), shortened, to help recognise it. */
export function pageHeadline(page: Page, maxLength = 40): string {
  const texts = page.objects
    .filter((object): object is Extract<EditorialObject, { type: 'text' }> => object.type === 'text')
    .slice()
    .sort((left, right) => left.frame.yMm - right.frame.yMm || left.frame.xMm - right.frame.xMm);
  for (const text of texts) {
    const line = richTextFirstLine(text.text).replace(/\s+/g, ' ');
    if (line) return line.length > maxLength ? `${line.slice(0, maxLength - 1).trimEnd()}…` : line;
  }
  return '';
}
