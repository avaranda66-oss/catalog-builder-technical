// src/domain/physical-units.ts
// Unidades Físicas e Conversões Canônicas Bidirecionais (Fase 3A.5A)
// Módulo de nível 0: funções puras sem dependências externas.
// mm é a autoridade física de documento; px representa a simulação de preview em tela.

/**
 * Converte milímetros para pixels de tela dado um valor de DPI (padrão 96 DPI).
 * Retorna float puro sem truncamento.
 */
export function mmToPx(mm: number, dpi: number = 96): number {
  return (mm * dpi) / 25.4;
}

/**
 * Converte pixels de tela para milímetros dado um valor de DPI (padrão 96 DPI).
 * Retorna float puro sem truncamento.
 */
export function pxToMm(px: number, dpi: number = 96): number {
  return (px * 25.4) / dpi;
}
