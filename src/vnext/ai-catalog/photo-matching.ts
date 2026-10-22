import type { SourceTableBlock } from './intake/intake-model';

/**
 * FR-71: which product a dropped photo belongs to. Pure module (no DOM, no React).
 *
 * The file name is the only clue the father gives ("PCON-Y17_frente.jpg", "pcony17.jpg"), so it is compared with the
 * model codes that came out of the files he dropped (table headers, the "Modelo" column, extracted facts). Exactly one
 * code in the name links the photo by itself; none or several (a photo of two products, "IMG_2034.jpg") becomes a
 * question the person answers with one click. A code is never guessed and never invented: every candidate is a code
 * read from a source file.
 *
 * The photo itself is validated where it is read (`readPhoto` in source-intake.ts: `sniffImageMime` /
 * `sniffImageDimensions`, HEIC and fake-extension messages, warning under `MIN_PRINT_PHOTO_PX` on the long side); this
 * module only decides the link.
 */

/** A model code as printed in the sources: 2-5 letters, an optional dash and letter, 2-3 digits, an optional letter. */
const MODEL_CODE = /(?<![A-Z0-9])[A-Z]{2,5}-?[A-Z]?\d{2,3}[A-Z]?(?![A-Z0-9])/gu;
/** Standards and sizes that look like model codes ("IP65", "DN15", "PN16", "NPT") and never name a product. */
const NOT_A_PRODUCT = /^(?:IP|DN|PN|NPT|BSP|ISO|DIN|EN|ASME|ANSI|API|UL|CE|NR|SIL|ATEX|IEC|NEMA|PT|PTC|RTD|SS|AISI)-?\d/u;
/** Headers of the column that names the product in a table ("Modelo", "Code", "Referência"). */
const MODEL_HEADER = /\b(?:model|modelo|code|codigo|ref|referencia|produto|product|part\s*(?:no|number)|item|artigo)\b/u;
const PHOTO_EXTENSION = /\.(?:png|jpe?g|jfif|jpe|webp|heic|heif)$/iu;
/** Longest run of name pieces that can spell one code ("PCON-Y17-HT" is three). */
const MAX_PIECES = 5;
const MIN_COMPACT_LENGTH = 3;

const upperWithoutAccents = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/gu, '').toUpperCase();
/** "Pcon Y17" and "PCON-Y17" and "pcony17" all become the same dash-less text. */
export const compactCode = (code: string): string => upperWithoutAccents(code).replace(/[^A-Z0-9]/gu, '');

/** "PCON-Y17_frente.jpg" → "PCON-Y17-FRENTE": no extension, upper case, every run of separators one dash. */
export function normalizePhotoName(fileName: string): string {
  return upperWithoutAccents(fileName.replace(PHOTO_EXTENSION, '')).replace(/[^A-Z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

/** Model-looking tokens in a text, as printed (upper case). "Modelo TA-25N / TA-35N" gives both. */
export function extractModelCodes(text: string): string[] {
  const found = upperWithoutAccents(text).match(MODEL_CODE) ?? [];
  return found.filter((code) => !NOT_A_PRODUCT.test(code));
}

/** A whole cell or fact model that is just one code ("0D100", "Y17-HP"): a column or field that names products. */
function singleCode(text: string): string | undefined {
  const value = upperWithoutAccents(text).trim();
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,23}$/u.test(value) || !/\d/u.test(value) || !/[A-Z]/u.test(value) || NOT_A_PRODUCT.test(value)) return undefined;
  return value;
}

const headerCells = (block: SourceTableBlock): readonly string[] => {
  const header = block.headerRow !== undefined ? block.rows[block.headerRow] : block.rows[0];
  return header ?? [];
};

/**
 * Codes a table offers: every code in its header cells (models side by side) and every cell under a header that names
 * the product ("Modelo", "Code"). The rest of the table (specifications, descriptions) is not searched.
 */
export function modelCodesFromTable(block: SourceTableBlock): string[] {
  const headerIndex = block.headerRow ?? 0;
  const header = headerCells(block);
  const codes = header.flatMap(extractModelCodes);
  header.forEach((title, column) => {
    if (!MODEL_HEADER.test(upperWithoutAccents(title).toLowerCase())) return;
    block.rows.forEach((row, index) => {
      if (index === headerIndex) return;
      const cell = row[column] ?? '';
      const whole = singleCode(cell);
      codes.push(...(whole ? [whole] : extractModelCodes(cell)));
    });
  });
  return codes;
}

/** Codes from the models the fact extraction found (`SourceFactValue.model`, product sheet models). */
export function modelCodesFromFacts(models: readonly string[]): string[] {
  return models.flatMap((model) => {
    const whole = singleCode(model);
    return whole ? [whole] : extractModelCodes(model);
  });
}

/** One entry per code, whatever the dashes ("PCON-Y17" and "PCONY17" are one); the first spelling seen wins. */
export function uniqueModelCodes(codes: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const code of codes) {
    const key = compactCode(code);
    if (key.length >= MIN_COMPACT_LENGTH && !seen.has(key)) seen.set(key, upperWithoutAccents(code).trim());
  }
  return [...seen.values()];
}

export type PhotoMatch =
  | { readonly status: 'matched'; readonly code: string }
  /** `several`: the name holds more than one code; `none`: it holds none. `candidates` are the codes to offer. */
  | { readonly status: 'ask'; readonly reason: 'several' | 'none'; readonly candidates: readonly string[] };

interface Span { readonly code: string; readonly from: number; readonly to: number }

/**
 * The codes a photo name spells. The name is cut at its separators and a code matches when some run of consecutive
 * pieces, glued without dashes, is exactly that code: "PCON-Y17-frente" and "pcony17" both spell PCON-Y17, while
 * "TA-25N" never spells "TA-25" (a code is not found inside a longer one). When a code sits inside another matching
 * code ("PCON-Y17" in "PCON-Y17-HT") the longer one wins.
 */
function codesSpelledBy(fileName: string, codes: readonly string[]): string[] {
  const pieces = normalizePhotoName(fileName).split('-').filter(Boolean);
  const spans: Span[] = [];
  for (const code of codes) {
    const target = compactCode(code);
    for (let from = 0; from < pieces.length; from++) {
      let glued = '';
      for (let to = from; to < Math.min(pieces.length, from + MAX_PIECES); to++) {
        glued += pieces[to];
        if (glued.length > target.length) break;
        if (glued === target) spans.push({ code, from, to });
      }
    }
  }
  const inside = (a: Span, b: Span) => b.from <= a.from && b.to >= a.to && (b.from < a.from || b.to > a.to);
  const kept = spans.filter((span) => !spans.some((other) => other.code !== span.code && inside(span, other)));
  return [...new Set(kept.sort((a, b) => a.from - b.from).map((span) => span.code))];
}

/** Codes that start like the name (or the other way round), offered first when the name holds no code. */
function relatedFirst(fileName: string, codes: readonly string[]): string[] {
  const name = normalizePhotoName(fileName).replace(/-/gu, '');
  const related = (code: string) => {
    const key = compactCode(code);
    for (let length = Math.min(key.length, 6); length >= 4; length--) {
      if (name.includes(key.slice(0, length))) return true;
    }
    return false;
  };
  return [...codes.filter(related), ...codes.filter((code) => !related(code))];
}

/** Matches one photo name against the known model codes. */
export function matchPhotoToProducts(fileName: string, knownCodes: readonly string[]): PhotoMatch {
  const codes = uniqueModelCodes(knownCodes);
  const spelled = codesSpelledBy(fileName, codes);
  if (spelled.length === 1) return { status: 'matched', code: spelled[0] };
  if (spelled.length > 1) return { status: 'ask', reason: 'several', candidates: spelled };
  return { status: 'ask', reason: 'none', candidates: relatedFirst(fileName, codes) };
}

/** What the screen shows for one photo. `by`: the name decided ("name") or the person did ("person"). */
export type PhotoLink =
  | { readonly state: 'linked'; readonly code: string; readonly by: 'name' | 'person'; readonly candidates: readonly string[] }
  | { readonly state: 'ask'; readonly reason: 'several' | 'none' | 'no-products'; readonly candidates: readonly string[] };

export interface PhotoToLink {
  readonly id: string;
  readonly fileName: string;
  /** The code the person picked for this photo, if any (it wins over the name). */
  readonly chosen?: string;
}

/** The link of each photo, by id. With no known codes yet, every photo waits ("no-products"). */
export function resolvePhotoLinks(photos: readonly PhotoToLink[], knownCodes: readonly string[]): Map<string, PhotoLink> {
  const codes = uniqueModelCodes(knownCodes);
  const links = new Map<string, PhotoLink>();
  for (const photo of photos) {
    if (photo.chosen) {
      links.set(photo.id, { state: 'linked', code: photo.chosen, by: 'person', candidates: codes });
      continue;
    }
    if (!codes.length) {
      links.set(photo.id, { state: 'ask', reason: 'no-products', candidates: [] });
      continue;
    }
    const match = matchPhotoToProducts(photo.fileName, codes);
    links.set(photo.id, match.status === 'matched'
      ? { state: 'linked', code: match.code, by: 'name', candidates: codes }
      : { state: 'ask', reason: match.reason, candidates: match.candidates });
  }
  return links;
}

/** The text under a photo: "Foto ligada a: TA-25N" or the question. */
export function photoLinkText(link: PhotoLink | undefined): string {
  if (!link) return '';
  if (link.state === 'linked') return `Foto ligada a: ${link.code}`;
  if (link.reason === 'several') return 'O nome do arquivo cita mais de um produto. A qual deles esta foto pertence?';
  if (link.reason === 'none') return 'Não achei o produto pelo nome do arquivo. A qual produto esta foto pertence?';
  return 'Ainda não sei a qual produto esta foto pertence. Envie também a planilha ou o PDF com os modelos.';
}
