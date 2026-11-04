import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Onda 4.5 (Arsenal): numa janela de 626 x 753 px o painel abria com cabeçalho, busca e categorias, mas a lista de
 * cartões tinha 1 px de altura (os 28 cartões existiam e não apareciam). Até 1100 px o arsenal abre por cima da página
 * (coluna da direita `position: fixed`, da altura da janela); abaixo de 901 px o styles.css empilha a coluna sob a
 * página com `flex: none; min-height: auto` na coluna e em `.vnext-side-panels`. Dentro da sobreposição isso deixava
 * `.vnext-side-panels` da altura do conteúdo, e o arsenal (`flex: 1 1 0`) ficava com 0 px.
 *
 * jsdom não mede layout; a medição real (360–1920 px, alturas 600–1080, 1366 a 125%) é
 * tests/vnext/proof/fixtures/arsenal-panel-measure.mjs. Números de lá: cabeçalho + busca + categorias (3 linhas)
 * ocupam 300 px a 360–1100 px de largura; a 626 x 753 a lista ficou com 454 px, a 800 x 600 com 301 px.
 */

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const ARSENAL = strip(readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/arsenal/Arsenal.css'), 'utf8'));
const STYLES = strip(readFileSync(resolve(process.cwd(), 'src/vnext/app/styles.css'), 'utf8'));
const OPEN = '.vnext-shell[data-arsenal-open="true"]';

/** The body of every `@media (<query>) { … }` block (balanced braces), in file order. */
function mediaBlocks(css: string, query: string): string[] {
  const blocks: string[] = [];
  const head = `@media (${query})`;
  for (let at = css.indexOf(head); at !== -1; at = css.indexOf(head, at + head.length)) {
    const open = css.indexOf('{', at);
    let depth = 1;
    let index = open + 1;
    while (depth > 0 && index < css.length) {
      if (css[index] === '{') depth += 1;
      else if (css[index] === '}') depth -= 1;
      index += 1;
    }
    blocks.push(css.slice(open + 1, index - 1));
  }
  return blocks;
}

/** Every declaration block whose selector list is exactly `selector`. */
function rules(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1]);
}

function last(css: string, selector: string, property: string): string | undefined {
  return rules(css, selector)
    .map((body) => body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim())
    .filter((value) => value !== undefined)
    .pop();
}

describe('Onda 4.5 — the arsenal card list keeps its height in a narrow window', () => {
  const overlay = mediaBlocks(ARSENAL, 'max-width: 1100px').join('\n');

  it('opens over the page as a column as tall as the window', () => {
    const column = `${OPEN} .vnext-side-column`;
    expect(last(overlay, column, 'position')).toBe('fixed');
    expect(last(overlay, column, 'top')).toBe('0');
    expect(last(overlay, column, 'bottom')).toBe('0');
    expect(last(overlay, column, 'display')).toBe('flex');
    expect(last(overlay, column, 'flex-direction')).toBe('column');
    expect(last(overlay, column, 'min-height')).toBe('0');
  });

  it('passes that height on through .vnext-side-panels, which the stacked layout below 901 px sets to its content', () => {
    // The stacked layout (styles.css) is what collapsed the overlay: if it changes, this test still guards the overlay.
    const stacked = mediaBlocks(STYLES, 'max-width: 900px').join('\n');
    expect(last(stacked, '.vnext-side-panels', 'flex')).toBe('none');
    expect(last(stacked, '.vnext-side-panels', 'min-height')).toBe('auto');
    // The overlay rule wins by specificity (0,4,0 against 0,1,0) whatever the order the two files load in.
    const panels = `${OPEN} .vnext-side-column > .vnext-side-panels`;
    expect(last(overlay, panels, 'flex')).toBe('1 1 0');
    expect(last(overlay, panels, 'min-height')).toBe('0');
  });

  it('lets only the card list grow and scroll; the header and the tools keep their size and the chips wrap', () => {
    expect(last(ARSENAL, '.vnext-arsenal', 'flex')).toBe('1 1 0');
    expect(last(ARSENAL, '.vnext-arsenal', 'min-height')).toBe('0');
    expect(last(ARSENAL, '.vnext-arsenal', 'flex-direction')).toBe('column');
    expect(last(ARSENAL, '.vnext-arsenal-header', 'flex')).toBe('none');
    expect(last(ARSENAL, '.vnext-arsenal-tools', 'flex')).toBe('none');
    expect(last(ARSENAL, '.vnext-arsenal-categories', 'flex-wrap')).toBe('wrap');
    expect(last(ARSENAL, '.vnext-arsenal-body', 'flex')).toBe('1 1 0');
    expect(last(ARSENAL, '.vnext-arsenal-body', 'min-height')).toBe('0');
    expect(last(ARSENAL, '.vnext-arsenal-body', 'overflow-y')).toBe('auto');
  });
});
