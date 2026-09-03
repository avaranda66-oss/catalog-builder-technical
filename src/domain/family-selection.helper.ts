import { ProductFamily } from './product.schema';

/**
 * Resolve deterministicamente qual família deve ser selecionada após a exclusão de uma família.
 * Contrato LIB.F1 (Section 12, 19):
 * - Se a família excluída não era a atualmente selecionada, mantém a seleção atual inalterada.
 * - Se a família excluída era a selecionada:
 *   1. Seleciona a próxima família à direita (mesmo índice na lista remanescente).
 *   2. Se não existir vizinho à direita, seleciona a família anterior (último da lista remanescente).
 *   3. Se não sobrar nenhuma família, retorna string vazia ('') indicando Empty State.
 */
export function resolveFamilySelectionAfterDelete(
  families: ProductFamily[],
  deletedFamilyId: string,
  currentSelected: string
): string {
  const targetIdx = families.findIndex(f => f.id === deletedFamilyId);
  if (targetIdx === -1) {
    return currentSelected;
  }

  const deletedFam = families[targetIdx];
  const isCurrentlySelected =
    Boolean(currentSelected) &&
    (currentSelected === deletedFam.id ||
      currentSelected === deletedFam.name ||
      Boolean(deletedFam.slug && currentSelected === deletedFam.slug));

  if (!isCurrentlySelected) {
    return currentSelected;
  }

  const remaining = families.filter(f => f.id !== deletedFamilyId);
  if (remaining.length === 0) {
    return '';
  }

  // Se existia elemento à direita do targetIdx, ele agora está no índice targetIdx em remaining
  if (targetIdx < remaining.length) {
    return remaining[targetIdx].name;
  }

  // Se não existe à direita (era o último elemento), seleciona o anterior
  return remaining[remaining.length - 1].name;
}

export function slugifyFamilyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
