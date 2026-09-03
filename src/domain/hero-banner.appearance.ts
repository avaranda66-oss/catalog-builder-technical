// src/domain/hero-banner.appearance.ts
// Contrato puro de domínio para paletas visuais e gradientes do Hero Banner (CORE.E5B / CORE.E5B.1).
// Zero dependências de React, Zustand ou Supabase.

export type HeroPaletteId =
  | 'presys_navy_solid'
  | 'presys_industrial'
  | 'navy_corporate'
  | 'obsidian'
  | 'graphite'
  | 'steel'
  | 'emerald'
  | 'ruby'
  | 'presys_yellow';

export type HeroForegroundTone = 'light' | 'dark';

export interface HeroPaletteDefinition {
  readonly id: HeroPaletteId;
  readonly label: string;
  readonly className: string;
  readonly hex: string;
  readonly foregroundTone: HeroForegroundTone;
}

export const HERO_PALETTES: readonly HeroPaletteDefinition[] = [
  {
    id: 'presys_navy_solid',
    label: 'Azul Presys Sólido (Padrão)',
    className: 'bg-[#001f3f]',
    hex: '#001f3f',
    foregroundTone: 'light'
  },
  {
    id: 'presys_industrial',
    label: 'Azul Presys Industrial',
    className: 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900',
    hex: '#003366',
    foregroundTone: 'light'
  },
  {
    id: 'navy_corporate',
    label: 'Azul Marinho Corporativo',
    className: 'bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900',
    hex: '#1E3A8A',
    foregroundTone: 'light'
  },
  {
    id: 'obsidian',
    label: 'Obsidiana / Preto Puro',
    className: 'bg-gradient-to-b from-black via-zinc-950 to-black',
    hex: '#09090B',
    foregroundTone: 'light'
  },
  {
    id: 'graphite',
    label: 'Grafite Técnico',
    className: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900',
    hex: '#27272A',
    foregroundTone: 'light'
  },
  {
    id: 'steel',
    label: 'Aço Escuro Metrológico',
    className: 'bg-gradient-to-br from-slate-800 via-slate-900 to-zinc-900',
    hex: '#334155',
    foregroundTone: 'light'
  },
  {
    id: 'emerald',
    label: 'Esmeralda Metrologia',
    className: 'bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900',
    hex: '#065F46',
    foregroundTone: 'light'
  },
  {
    id: 'ruby',
    label: 'Vinho / Rubi Industrial',
    className: 'bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900',
    hex: '#881337',
    foregroundTone: 'light'
  },
  {
    id: 'presys_yellow',
    label: 'Amarelo Presys Calibration',
    className: 'bg-[#FFC20E]',
    hex: '#FFC20E',
    foregroundTone: 'dark'
  }
];

export const DEFAULT_HERO_PALETTE_ID: HeroPaletteId = 'presys_navy_solid';

export const HERO_PALETTE_OPTIONS = HERO_PALETTES.map((p) => ({
  label: p.label,
  value: p.id
}));

export interface HeroAppearanceTarget {
  style?: {
    gradient?: string | null;
    [key: string]: unknown;
  };
  customData?: {
    gradient?: string | null;
    [key: string]: unknown;
  };
}

/**
 * Resolve a classe Tailwind para renderização do Hero Banner seguindo:
 * 1. style.gradient (autoridade canônica de novas escritas)
 * 2. customData.gradient (fallback legado para documentos históricos)
 * 3. 'bg-[#001f3f]' (fallback padrão canônico)
 */
export function resolveHeroPaletteClass(block: HeroAppearanceTarget | null | undefined): string {
  if (!block) return 'bg-[#001f3f]';

  if (typeof block.style?.gradient === 'string' && block.style.gradient.trim()) {
    return block.style.gradient.trim();
  }

  if (typeof block.customData?.gradient === 'string' && block.customData.gradient.trim()) {
    return block.customData.gradient.trim();
  }

  return 'bg-[#001f3f]';
}

/**
 * Identifica o HeroPaletteId semântico ativo. Se o valor for um gradiente legado
 * fora do allowlist canônico, retorna 'legacy_custom'.
 */
export function resolveHeroPaletteId(block: HeroAppearanceTarget | null | undefined): HeroPaletteId | 'legacy_custom' {
  const currentClass = resolveHeroPaletteClass(block);
  const found = HERO_PALETTES.find((p) => p.className === currentClass);
  if (found) {
    return found.id;
  }
  return 'legacy_custom';
}

/**
 * Resolve o tom de contraste/foreground do Hero Banner (CORE.E5B.1):
 * - Deriva semanticamente de foregroundTone da paleta ativa.
 * - Para presys_yellow (#FFC20E), retorna 'dark'.
 * - Para paletas escuras e gradientes legados ('legacy_custom'), preserva o fallback histórico 'light'.
 */
export function resolveHeroForegroundTone(block: HeroAppearanceTarget | null | undefined): HeroForegroundTone {
  const paletteId = resolveHeroPaletteId(block);
  if (paletteId !== 'legacy_custom') {
    const palette = HERO_PALETTES.find((p) => p.id === paletteId);
    if (palette) {
      return palette.foregroundTone;
    }
  }
  return 'light';
}

export interface HeroPalettePatch {
  style: Record<string, unknown>;
  customData?: Record<string, unknown>;
}

/**
 * Constrói o patch canônico para aplicação de uma paleta no Hero Banner:
 * - Escreve em style.gradient
 * - Remove customData.gradient legado conflitante se existir
 * - Produz exatamente uma mutação sem tocar outras propriedades de style
 */
export function setHeroPalette(
  block: HeroAppearanceTarget | null | undefined,
  paletteId: HeroPaletteId
): HeroPalettePatch {
  const palette = HERO_PALETTES.find((p) => p.id === paletteId);
  const targetClass = palette ? palette.className : 'bg-[#001f3f]';

  const newStyle: Record<string, unknown> = {
    ...(block?.style || {}),
    gradient: targetClass
  };

  let newCustomData: Record<string, unknown> | undefined = undefined;
  if (block?.customData && 'gradient' in block.customData) {
    const { gradient: _removed, ...restCustom } = block.customData;
    newCustomData = restCustom;
  }

  return {
    style: newStyle,
    ...(newCustomData !== undefined ? { customData: newCustomData } : {})
  };
}
