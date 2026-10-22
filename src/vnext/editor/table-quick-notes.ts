import type { TableAnnotation, TableModel } from '../domain/editorial-model';
import type { TableStep } from './table-look-authoring';
import { annotationTargetForTable, annotationUsages } from './table-semantic-authoring';

/**
 * FR-33 "Notas": a note under the table in one click. The new note starts with the house placeholder, so a note the
 * person forgets to write blocks the PDF ("Ainda há um texto provisório") instead of printing an empty line.
 */
export const QUICK_NOTE_PLACEHOLDER = 'A COMPLETAR';

/** The notes shown under the table (attached to the whole table), in their order. */
export function tableQuickNotes(table: TableModel): readonly TableAnnotation[] {
  const attached = new Set(table.annotationIds ?? []);
  return table.annotations.filter((annotation) => annotation.kind !== 'caption' && attached.has(annotation.id));
}

/** A note also used by cells is kept out of the one-click removal (it is removed in "Notas e legenda"). */
export function quickNoteRemovable(table: TableModel, annotationId: string): boolean {
  return annotationUsages(table, annotationId).every((usage) => usage.kind === 'TABLE');
}

export function quickNoteCreateStep(): TableStep {
  return {
    build: ({ identity, table }) => {
      const target = annotationTargetForTable(table);
      return {
        type: 'table.annotation.create',
        ...identity,
        kind: 'note',
        plainText: QUICK_NOTE_PLACEHOLDER,
        expectedAnnotationOrder: table.annotations.map((annotation) => annotation.id),
        target: { kind: 'TABLE', expectedAnnotationIds: [...target.expectedAnnotationIds] },
      };
    },
  };
}

/** Takes the note away from the table and deletes it, in one undo step. */
export function quickNoteRemoveSteps(annotationId: string): TableStep[] {
  return [
    {
      build: ({ identity, table }) => (table.annotationIds ?? []).includes(annotationId)
        ? {
          type: 'table.annotation.detach',
          ...identity,
          annotationId,
          target: { kind: 'TABLE', expectedAnnotationIds: [...(table.annotationIds ?? [])] },
        }
        : null,
    },
    {
      build: ({ identity, table }) => {
        const annotation = table.annotations.find((entry) => entry.id === annotationId);
        return annotation
          ? { type: 'table.annotation.remove', ...identity, annotationId, expectedAnnotation: annotation }
          : null;
      },
    },
  ];
}
