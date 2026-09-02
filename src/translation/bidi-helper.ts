// src/translation/bidi-helper.ts
// Helper de Isolamento Bidirecional (Bidi) para Grandezas Técnicas, Códigos de Modelo e Tokens Metrológicos em Documentos RTL

export const TECHNICAL_TOKEN_REGEX =
  /([A-Z0-9]+-[A-Z0-9]+|[+-]?[0-9]+(\.[0-9]+)?\s*(bar|°C|°F|K|mA|Vdc|VAC|mV|FE|FS|mm|%|ppm|psi|kPa|MPa|kgf\/cm²)|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/**
 * Normaliza e aplica isolamento LTR em tokens técnicos presentes no DOM de um documento RTL.
 */
export function applyBidiIsolationToElement(root: HTMLElement): void {
  if (!root) return;

  const targetElements = root.querySelectorAll(
    '[data-printable-field], [data-printable-node-id], td, th, .technical-token, span, p'
  );

  targetElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.closest('bdi') || htmlEl.getAttribute('dir') === 'ltr') {
      return;
    }

    const text = (htmlEl.textContent || '').trim();
    // Se o elemento contiver apenas ou predominantemente grandezas técnicas / modelos
    if (
      /([0-9]+\s*(bar|°C|mA|Vdc|VAC|FE|mm|%|FS)|[A-Z0-9]+-[A-Z0-9]+|\+55|[0-9]{2}\.[0-9]{2}\.[0-9]{4}-[0-9]{2})/i.test(
        text
      )
    ) {
      htmlEl.setAttribute('dir', 'ltr');
    }
  });
}
