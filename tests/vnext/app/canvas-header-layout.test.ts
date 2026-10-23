import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Onda 4 (P, item 1): "Camadas" ficava cortado ("nadas") atrás da coluna de páginas entre 961 e 1180 px e a 1366 px
 * com 125% de escala do Windows. O grupo da direita da linha acima da página ("Camadas" + contador de problemas) tinha
 * largura reservada menor que o seu conteúdo e podia encolher até zero: o conteúdo transbordava para a esquerda.
 *
 * jsdom não mede layout; a medição real (900–1920 px, 125%) é tests/vnext/proof/fixtures/canvas-header-measure.mjs.
 * Os números abaixo vêm dela (modo simples, fonte Noto Sans): "Camadas" 106 px, contador "0 a corrigir · 1 para
 * revisar" 221 px, gap 9 px → 336 px; "Página 1 de 1" 98 px, zoom 335 px; a 1366 px a linha tem 850 px.
 */

const STYLES = readFileSync(resolve(process.cwd(), 'src/vnext/app/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const SIMPLE = '.vnext-shell[data-simple-by-default="true"]';
const GROUP = '.vnext-canvas-meta > .vnext-canvas-statuses';

/** Every declaration block whose selector list is exactly `selector`, in file order. */
function rules(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...STYLES.matchAll(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1]);
}

function declaration(body: string, property: string): string | undefined {
  return body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();
}

/** The last value a property gets for `selector` (the cascade between equal selectors). */
function last(selector: string, property: string): string | undefined {
  return rules(selector).map((body) => declaration(body, property)).filter((value) => value !== undefined).pop();
}

function basisPx(selector: string): number {
  const basis = last(selector, 'flex-basis') ?? last(selector, 'flex')?.split(/\s+/)[2];
  expect(basis, `${selector} has no flex-basis`).toMatch(/^\d+px$/);
  return Number.parseFloat(basis!);
}

const MEASURED = { camadas: 106, counter: 221, gap: 9, pageLabel: 98, zoom: 335, metaGap: 10, lineAt1366: 850 };

describe('Onda 4 (P) — the line above the page never hides "Camadas"', () => {
  it('the right-hand group never gets narrower than its widest button and wraps inside instead of spilling left', () => {
    expect(rules(GROUP)).not.toHaveLength(0);
    // `min-width: 0` let the group shrink below its buttons; with `justify-content: flex-end` they spilled to the left,
    // under the page column, where the canvas area (overflow-x: hidden) cut them.
    expect(last(GROUP, 'min-width')).toBeUndefined();
    expect(last(`${SIMPLE} ${GROUP}`, 'min-width')).toBeUndefined();
    expect(last(GROUP, 'flex-wrap')).toBe('wrap');
    expect(last(GROUP, 'justify-content')).toBe('flex-end');
    // It takes the rest of its line (alone on a line it spans the whole width, buttons on the right).
    expect(last(GROUP, 'flex')?.split(/\s+/)[0]).toBe('1');
  });

  it('reserves room for "Camadas" and the problem counter, so the line only wraps by the window width', () => {
    const need = MEASURED.camadas + MEASURED.gap + MEASURED.counter;
    const simple = basisPx(`${SIMPLE} ${GROUP}`);
    expect(simple).toBeGreaterThanOrEqual(need);
    // Room for two more digits in the counter ("12 a corrigir · 10 para revisar").
    expect(simple - need).toBeGreaterThanOrEqual(20);
    // …and still one line on a 1366 px laptop (the father's screen): page label + zoom + group + gaps.
    expect(MEASURED.pageLabel + MEASURED.zoom + simple + 2 * MEASURED.metaGap).toBeLessThanOrEqual(MEASURED.lineAt1366);
    // The advanced editor keeps its own (smaller) reservation and also one line at 1366 px (max-width 820 px).
    const advanced = basisPx(GROUP);
    expect(183 + 286 + advanced + 2 * 12).toBeLessThanOrEqual(820);
    expect(advanced).toBeGreaterThanOrEqual(284);
  });

  it('keeps only the save text able to shrink with an ellipsis', () => {
    const memory = rules('.vnext-canvas-statuses .vnext-memory-status').join(';');
    expect(declaration(memory, 'min-width')).toBe('0');
    expect(declaration(memory, 'text-overflow')).toBe('ellipsis');
  });
});
