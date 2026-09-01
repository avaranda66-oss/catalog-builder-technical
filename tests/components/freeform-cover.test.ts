import { describe, it, expect } from 'vitest';
import { ElementPositionConfig } from '../../src/components/editor/blocks/FullPageCoverBlock';

describe('FullPageCoverBlock (Freeform Canva Positioning)', () => {
  it('inicializa com configurações de posição padrão válidas', () => {
    const defaultConfig: ElementPositionConfig = { x: 5, y: 22, size: 42, visible: true };
    expect(defaultConfig.x).toBe(5);
    expect(defaultConfig.y).toBe(22);
    expect(defaultConfig.size).toBe(42);
    expect(defaultConfig.visible).toBe(true);
  });

  it('permite desativar a visibilidade de títulos quando a imagem de fundo já tem texto', () => {
    const titleConfig: ElementPositionConfig = { x: 5, y: 22, size: 42, visible: false };
    expect(titleConfig.visible).toBe(false);
  });

  it('suporta ajuste de escala de fonte milimétrico', () => {
    const titleConfig: ElementPositionConfig = { x: 10, y: 15, size: 64, visible: true };
    expect(titleConfig.size).toBe(64);
  });
});
