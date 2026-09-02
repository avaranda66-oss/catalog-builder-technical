// src/translation/layout-qa.auditor.ts
// Auditor de Layout e Qualidade Visual para Documentos Traduzidos (CleanA4Document)
// Detecta overflow de texto, quebra de página indevida, corte de tabelas, clipping vertical interno, fontes ausentes e direção RTL.

import { LayoutIssue, LayoutQaResult } from './types';
import { FontManager, SCRIPT_SAMPLE_TEXT } from './font-manager';
import { LanguageRegistry } from './language.registry';

export class TranslationLayoutAuditor {
  /**
   * Executa a auditoria de layout no DOM real renderizado do CleanA4Document.
   */
  static auditLayout(rootElement: HTMLElement | Document, targetLocale: string): LayoutQaResult {
    const issues: LayoutIssue[] = [];
    const targetRoot = rootElement instanceof Document ? rootElement.body : rootElement;

    const isRtl = FontManager.getDirectionForLocale(targetLocale) === 'rtl';
    const lang = LanguageRegistry.getByCode(targetLocale);
    const script = lang?.script || 'Latin';

    // 0. Verificação Global de Fontes (FontFaceSet / document.fonts.check)
    if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.check === 'function') {
      const family = FontManager.getFontFamilyForLocale(targetLocale);
      const primaryFont = family.split(',')[0].replace(/['"]/g, '').trim();
      const sample = SCRIPT_SAMPLE_TEXT[script] || 'Test';

      // Em browsers reais, document.fonts.check verifica a disponibilidade efetiva dos glifos
      const isFontReady = document.fonts.check(`16px "${primaryFont}"`, sample);
      if (!isFontReady && primaryFont.toLowerCase().includes('noto')) {
        issues.push({
          id: `missing_font_global_${script}`,
          type: 'MISSING_FONT',
          severity: 'error',
          message: `Fonte tipográfica "${primaryFont}" não foi carregada no navegador para o script ${script}. O texto pode sofrer substituição indesejada.`
        });
      }
    }

    // 1. Verificação de Páginas A4 e Containers Internos (Dimensão física e clipping vertical)
    const pageElements = targetRoot.querySelectorAll('.clean-export-page, .export-page-container');
    pageElements.forEach((pageEl, pageIdx) => {
      const p = pageEl as HTMLElement;
      const pageId = p.getAttribute('data-page-id') || `p${pageIdx + 1}`;
      const pageRect = typeof p.getBoundingClientRect === 'function' ? p.getBoundingClientRect() : null;

      // 1.1. Verifica se a folha excedeu a altura de 1 folha A4 (tolerância de 5px)
      if (p.scrollHeight > p.clientHeight + 8 && p.clientHeight > 0) {
        issues.push({
          id: `page_overflow_${pageId}`,
          type: 'PAGE_OVERFLOW',
          pageId,
          severity: 'error',
          message: `Conteúdo da Página ${pageIdx + 1} ultrapassa o limite físico da folha A4 (${p.scrollHeight}px > ${p.clientHeight}px).`
        });
      }

      // 1.2. Detecção de Clipping Vertical em containers internos com overflow-hidden
      const internalContainers = p.querySelectorAll('.export-block-wrapper, [data-block-id], .overflow-hidden, .flex-1');
      internalContainers.forEach((cEl) => {
        const c = cEl as HTMLElement;
        if (c.scrollHeight > c.clientHeight + 6 && c.clientHeight > 0) {
          const blockId = c.getAttribute('data-block-id') || c.closest('[data-block-id]')?.getAttribute('data-block-id') || undefined;
          issues.push({
            id: `vertical_clipping_${blockId || pageId}_${c.scrollHeight}`,
            type: 'TEXT_OVERFLOW',
            pageId,
            blockId,
            severity: 'error',
            message: `Conteúdo do bloco na Página ${pageIdx + 1} excede a área útil do container e está sendo cortado verticalmente (${c.scrollHeight}px > ${c.clientHeight}px).`
          });
        }

        // Verifica se o bounding rect transborda o fundo físico da página A4
        if (pageRect && typeof c.getBoundingClientRect === 'function') {
          const cRect = c.getBoundingClientRect();
          if (cRect.bottom > pageRect.bottom + 4 && pageRect.height > 0) {
            const blockId = c.getAttribute('data-block-id') || undefined;
            issues.push({
              id: `bounding_overflow_${blockId || pageId}`,
              type: 'PAGE_OVERFLOW',
              pageId,
              blockId,
              severity: 'error',
              message: `Bloco visual ultrapassa o limite inferior imprimível da folha A4 (${Math.round(cRect.bottom)}px > ${Math.round(pageRect.bottom)}px).`
            });
          }
        }
      });
    });

    // 2. Verificação de Textos e Glifos
    const textContainers = targetRoot.querySelectorAll(
      '[data-printable-field], [data-printable-node-id], h1, h2, h3, h4, th, td'
    );

    textContainers.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.closest('.no-print')) return;

      const field = htmlEl.getAttribute('data-printable-field');
      const nodeId = htmlEl.getAttribute('data-printable-node-id');
      const blockAncestor = htmlEl.closest('[data-block-id]');
      const blockId = blockAncestor?.getAttribute('data-block-id') || undefined;
      const pageAncestor = htmlEl.closest('[data-page-id]');
      const pageId = pageAncestor?.getAttribute('data-page-id') || undefined;

      const text = (htmlEl.textContent || '').trim();

      // Detecta caracteres corrompidos / glyphs ausentes (ex: U+FFFD)
      if (text.includes('\uFFFD')) {
        issues.push({
          id: `missing_font_${nodeId || field || text.substring(0, 10)}`,
          type: 'MISSING_FONT',
          pageId,
          blockId,
          nodeId: nodeId || undefined,
          severity: 'error',
          message: `Detectado glifo corrompido ou ausente na renderização: "${text.substring(0, 30)}..."`,
          snippet: text
        });
      }

      // Detecta overflow horizontal crítico em elementos de linha única
      if (
        htmlEl.scrollWidth > htmlEl.clientWidth + 4 &&
        htmlEl.clientWidth > 0 &&
        !['p', 'div'].includes(htmlEl.tagName.toLowerCase())
      ) {
        issues.push({
          id: `text_overflow_${nodeId || field || text.substring(0, 10)}`,
          type: 'TEXT_OVERFLOW',
          pageId,
          blockId,
          nodeId: nodeId || undefined,
          severity: 'warning',
          message: `Texto ultrapassa largura disponível: "${text.substring(0, 40)}" (${htmlEl.scrollWidth}px > ${htmlEl.clientWidth}px)`,
          snippet: text
        });
      }

      // Verificação RTL: Presença de grandeza técnica com símbolos que requerem isolamento bidi
      if (isRtl && /([0-9]+\s*(bar|°C|mA|Vdc|VAC|FE|mm|%|FS)|[A-Z0-9]+-[A-Z0-9]+)/i.test(text)) {
        if (!htmlEl.closest('bdi') && htmlEl.getAttribute('dir') !== 'ltr') {
          issues.push({
            id: `rtl_bidi_${nodeId || field || text.substring(0, 10)}`,
            type: 'RTL_WARNING',
            pageId,
            blockId,
            nodeId: nodeId || undefined,
            severity: 'warning',
            message: `Código/grandeza técnica "${text}" em documento RTL sem isolamento bidi (<bdi> ou dir="ltr").`,
            snippet: text
          });
        }
      }
    });

    // 3. Verificação de Tabelas com Overflow
    const tableElements = targetRoot.querySelectorAll('table');
    tableElements.forEach((tbl, tIdx) => {
      const tableEl = tbl as HTMLElement;
      if (tableEl.scrollWidth > tableEl.parentElement?.clientWidth! + 6 && tableEl.parentElement?.clientWidth! > 0) {
        issues.push({
          id: `table_overflow_${tIdx}`,
          type: 'TABLE_OVERFLOW',
          severity: 'warning',
          message: `Tabela ultrapassa a largura máxima da coluna (${tableEl.scrollWidth}px > ${tableEl.parentElement?.clientWidth}px).`
        });
      }
    });

    const hasErrors = issues.some((i) => i.severity === 'error');
    const hasWarnings = issues.some((i) => i.severity === 'warning');

    const status: 'passed' | 'warning' | 'error' = hasErrors
      ? 'error'
      : hasWarnings
      ? 'warning'
      : 'passed';

    return {
      hasIssues: issues.length > 0,
      issues,
      status,
      auditedAt: new Date().toISOString()
    };
  }
}
