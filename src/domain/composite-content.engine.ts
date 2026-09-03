// src/domain/composite-content.engine.ts
// Domínio puro para blocos compostos não-tabulares (CORE.E6B).
// Gerencia coleções armazenadas em customData (MultiMode e SoftwareConnectivity)
// com autoridade de array, leitura retrocompatível e preservação de campos não relacionados.
// Zero React, zero Store, zero any.

import { ContentBlock } from './catalog.schema';

export interface CalibratorModeItem {
  id: string;
  badge: string;
  title: string;
  desc: string;
  description?: string; // campo legado para leitura retrocompatível
}

export interface SoftwareConnectivityItem {
  badge?: string;
  title: string;
  desc: string;
  icon?: string;
}

/**
 * Lê a descrição de um modo de calibração respeitando a hierarquia canônica:
 * desc canônico > description legado > ''.
 */
export function getEffectiveModeDesc(mode: CalibratorModeItem): string {
  if (typeof mode.desc === 'string' && mode.desc.trim().length > 0) {
    return mode.desc;
  }
  if (typeof mode.description === 'string' && mode.description.trim().length > 0) {
    return mode.description;
  }
  return '';
}

/**
 * Extrai a coleção de modos de um bloco multi_mode_calibrator.
 * Retorna os itens existentes ou [] caso a coleção seja inexistente ou vazia.
 * Nunca fabrica dados demonstrativos técnicos.
 */
export function getMultiModeItems(block: ContentBlock): CalibratorModeItem[] {
  if (!block.customData || !Array.isArray(block.customData.modes)) {
    return [];
  }
  return block.customData.modes.map((m) => {
    const raw = m as Partial<CalibratorModeItem>;
    return {
      id: typeof raw.id === 'string' ? raw.id : '',
      badge: typeof raw.badge === 'string' ? raw.badge : '',
      title: typeof raw.title === 'string' ? raw.title : '',
      desc: getEffectiveModeDesc(raw as CalibratorModeItem)
    };
  });
}

/**
 * Constrói o patch de atualização para os modos de calibração,
 * gravando estritamente em `desc` e preservando qualquer outro campo existente em customData.
 */
export function buildMultiModeItemsPatch(
  block: ContentBlock,
  modes: CalibratorModeItem[]
): { customData: Record<string, any> } {
  const existingCustom = (block.customData && typeof block.customData === 'object')
    ? block.customData
    : {};

  const cleanModes = modes.map((m) => ({
    id: m.id,
    badge: m.badge,
    title: m.title,
    desc: m.desc
  }));

  return {
    customData: {
      ...existingCustom,
      modes: cleanModes
    }
  };
}

/**
 * Extrai a coleção de cards de conectividade de um bloco software_connectivity.
 * Retorna os itens existentes ou [] caso a coleção seja inexistente ou vazia.
 * Nunca fabrica dados demonstrativos técnicos.
 */
export function getSoftwareConnectivityItems(block: ContentBlock): SoftwareConnectivityItem[] {
  if (!block.customData || !Array.isArray(block.customData.items)) {
    return [];
  }
  return block.customData.items.map((it) => {
    const raw = it as Partial<SoftwareConnectivityItem>;
    return {
      badge: typeof raw.badge === 'string' ? raw.badge : '',
      title: typeof raw.title === 'string' ? raw.title : '',
      desc: typeof raw.desc === 'string' ? raw.desc : '',
      icon: typeof raw.icon === 'string' ? raw.icon : undefined
    };
  });
}

/**
 * Constrói o patch de atualização para os itens de conectividade,
 * preservando qualquer outro campo existente em customData.
 */
export function buildSoftwareConnectivityItemsPatch(
  block: ContentBlock,
  items: SoftwareConnectivityItem[]
): { customData: Record<string, any> } {
  const existingCustom = (block.customData && typeof block.customData === 'object')
    ? block.customData
    : {};

  const cleanItems = items.map((it) => {
    const itemObj: SoftwareConnectivityItem = {
      badge: it.badge || '',
      title: it.title,
      desc: it.desc
    };
    if (it.icon) {
      itemObj.icon = it.icon;
    }
    return itemObj;
  });

  return {
    customData: {
      ...existingCustom,
      items: cleanItems
    }
  };
}
