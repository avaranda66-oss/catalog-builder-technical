import { describe, expect, it } from 'vitest';
import { walkPageObjects, type Frame } from '../../../src/vnext/domain';
import { PageSchema } from '../../../src/vnext/domain/editorial-model';
import {
  arsenalContentBoxMm,
  arsenalVisibleObjects,
  boundingFrame,
  findFreePlacement,
  frameInside,
} from '../../../src/vnext/arsenal/arsenal-geometry';
import { arsenalPreviewViewport, buildArsenalPreview, createArsenalPreviewBuilder } from '../../../src/vnext/arsenal/arsenal-preview';
import { ARSENAL_PHOTO_PLACEHOLDER_TEXT } from '../../../src/vnext/arsenal/arsenal-placeholder';
import {
  CONTRACT_ASSET,
  coverPageDraft,
  headerBlockDraft,
  logoBlockDraft,
  specTableDraft,
  teamPresetFromDraft,
  titleStyleDraft,
} from './contract/fixtures';

const box: Frame = { xMm: 10, yMm: 10, widthMm: 190, heightMm: 269 };

describe('área de conteúdo e área livre', () => {
  it('a área de conteúdo respeita a área segura e para acima do rodapé automático (exceto na capa)', () => {
    const safe = { safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 } };
    expect(arsenalContentBoxMm(safe, undefined, 2)).toEqual({ xMm: 10, yMm: 10, widthMm: 190, heightMm: 277 });
    expect(arsenalContentBoxMm(safe, { showOnFirstPage: false }, 2)).toEqual({ xMm: 10, yMm: 10, widthMm: 190, heightMm: 269 });
    expect(arsenalContentBoxMm(safe, { showOnFirstPage: false }, 1)).toEqual({ xMm: 10, yMm: 10, widthMm: 190, heightMm: 277 });
    expect(arsenalContentBoxMm({}, undefined, 2)).toEqual({ xMm: 10, yMm: 10, widthMm: 190, heightMm: 277 });
  });

  it('página vazia: bloco no centro, tabela no topo à esquerda', () => {
    const size = { widthMm: 60, heightMm: 30 };
    expect(findFreePlacement(box, [], size, { mode: 'center' })).toEqual({ xMm: 75, yMm: 129.5 });
    expect(findFreePlacement(box, [], size, { mode: 'top' })).toEqual({ xMm: 10, yMm: 10 });
  });

  it('desvia do que já existe (com folga) e escolhe a maior área livre', () => {
    const header: Frame = { xMm: 10, yMm: 10, widthMm: 190, heightMm: 60 };
    const size = { widthMm: 60, heightMm: 30 };
    const center = findFreePlacement(box, [header], size, { mode: 'center' })!;
    const top = findFreePlacement(box, [header], size, { mode: 'top' })!;
    expect(top).toEqual({ xMm: 10, yMm: 72 });
    for (const point of [center, top]) {
      const frame = { ...size, ...point };
      expect(frameInside(frame, box)).toBe(true);
      expect(frame.yMm).toBeGreaterThanOrEqual(header.yMm + header.heightMm + 2);
    }
    expect(center.yMm).toBeCloseTo(72 + (279 - 72 - 30) / 2, 2);
  });

  it('sem espaço livre ou maior que a área: não acha lugar (quem chama decide)', () => {
    expect(findFreePlacement(box, [box], { widthMm: 10, heightMm: 10 }, { mode: 'center' })).toBeUndefined();
    expect(findFreePlacement(box, [], { widthMm: 200, heightMm: 10 }, { mode: 'top' })).toBeUndefined();
  });

  it('objetos ocultos ficam de fora; grupo que perde filhos é reajustado e continua válido', () => {
    const draft = headerBlockDraft();
    if (draft.payload.kind !== 'block') throw new Error('block');
    const [band, title] = draft.payload.objects;
    const group = {
      id: 'g', type: 'group' as const, zIndex: 0, frame: boundingFrame([band.frame, title.frame])!,
      objects: [
        { ...band, hidden: true } as typeof band,
        title,
        { ...title, id: 'hdr-sub', frame: { ...title.frame, yMm: 14, xMm: 40 } } as typeof title,
      ] as never,
    };
    const visible = arsenalVisibleObjects([group]);
    expect(visible.hiddenIds).toEqual(['hdr-band']);
    const page = PageSchema.safeParse({ id: 'p', widthMm: 210, heightMm: 297, objects: visible.objects });
    expect(page.success).toBe(true);
    const [refitted] = visible.objects;
    expect(refitted.type).toBe('group');
    expect(refitted.frame).toEqual({ xMm: 18, yMm: 8, widthMm: 142, heightMm: 14 });
    if (page.success) {
      const frames = walkPageObjects(page.data).filter((entry) => entry.depth === 1).map((entry) => entry.resolvedFrameU.xU / 10_000);
      expect(frames).toEqual([18, 40]);
    }
  });
});

describe('prévia do preset (miniatura ao vivo)', () => {
  it('página: a própria página; bloco: página A4 com o bloco no lugar de origem e foco nele', () => {
    const page = buildArsenalPreview(teamPresetFromDraft(coverPageDraft()));
    expect(page.focusMm).toBeUndefined();
    expect(page.page.background).toEqual({ color: '#0b2a4a' });
    expect(page.page.objects).toHaveLength(2);
    const block = buildArsenalPreview(teamPresetFromDraft(headerBlockDraft()));
    expect(block.focusMm).toEqual({ xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 });
    expect(block.page.objects.map((object) => object.frame)).toEqual([{ xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 }, { xMm: 18, yMm: 8, widthMm: 120, heightMm: 8 }]);
    expect(PageSchema.safeParse(block.page).success).toBe(true);
  });

  it('tabela no topo da área segura; estilo numa amostra; tudo passa no esquema da página', () => {
    const table = buildArsenalPreview(teamPresetFromDraft(specTableDraft()));
    expect(table.focusMm).toEqual({ xMm: 10, yMm: 10, widthMm: 174, heightMm: 30 });
    const style = buildArsenalPreview(teamPresetFromDraft(titleStyleDraft()));
    const sample = style.page.objects[0];
    expect(sample.type === 'text' && sample.style).toMatchObject({ fontSizePt: 20, fontWeight: 700, color: '#ffffff' });
    for (const preview of [table, style]) expect(PageSchema.safeParse(preview.page).success).toBe(true);
  });

  it('imagem que o leitor não carrega vira a moldura "Foto a escolher"; com URL, a imagem aparece', () => {
    const preset = teamPresetFromDraft(logoBlockDraft());
    const missing = buildArsenalPreview(preset);
    expect(missing.page.objects.some((object) => object.type === 'image')).toBe(false);
    expect(JSON.stringify(missing.page)).toContain(ARSENAL_PHOTO_PLACEHOLDER_TEXT);
    const shown = buildArsenalPreview(preset, { assetUrls: new Map([[CONTRACT_ASSET.id, 'blob:logo']]) });
    expect(shown.page.objects.some((object) => object.type === 'image' && object.assetId === CONTRACT_ASSET.id)).toBe(true);
  });

  it('o construtor guarda a prévia por preset (mesmo objeto, mesma prévia)', () => {
    const builder = createArsenalPreviewBuilder();
    const preset = teamPresetFromDraft(headerBlockDraft());
    expect(builder(preset)).toBe(builder(preset));
  });

  it('janela do cartão: foco com margem nas proporções do cartão, dentro da folha quando cabe', () => {
    expect(arsenalPreviewViewport(undefined, 210 / 297)).toEqual({ xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 });
    const header = arsenalPreviewViewport({ xMm: 0, yMm: 0, widthMm: 210, heightMm: 24 }, 4 / 3);
    expect(header).toEqual({ xMm: 0, yMm: 0, widthMm: 210, heightMm: 157.5 });
    const small = arsenalPreviewViewport({ xMm: 100, yMm: 100, widthMm: 40, heightMm: 30 }, 4 / 3);
    expect(small.widthMm / small.heightMm).toBeCloseTo(4 / 3, 6);
    expect(frameInside({ xMm: 100, yMm: 100, widthMm: 40, heightMm: 30 }, small)).toBe(true);
    const wide = arsenalPreviewViewport(undefined, 4 / 3);
    expect(wide.heightMm).toBe(297);
    expect(wide.xMm).toBeLessThan(0);
  });
});
