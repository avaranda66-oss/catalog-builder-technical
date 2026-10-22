import { afterEach, describe, expect, it } from 'vitest';
import {
  createSourceFileStore, dropIntoIntake, forgetSourceIntakeSessions, INTAKE_SESSIONS_KEPT, sourceIntakeSessionFor,
} from '@/vnext/ai-catalog/intake/intake-store';
import { fileOf } from './intake-fixtures';

afterEach(() => forgetSourceIntakeSessions());

const settled = async (store: ReturnType<typeof createSourceFileStore>) => {
  for (let attempt = 0; attempt < 200 && store.getEntries().some((entry) => entry.state === 'reading'); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return store.getEntries();
};

describe('FR-64 the files of a catalog live outside the assistant panel', () => {
  it('gives the same intake every time for the same catalog, and another one for another catalog', () => {
    const first = sourceIntakeSessionFor('catalog-a');
    expect(sourceIntakeSessionFor('catalog-a')).toBe(first);
    expect(sourceIntakeSessionFor('catalog-b')).not.toBe(first);
  });

  it(`keeps the files of the last ${INTAKE_SESSIONS_KEPT} catalogs only, and lets the oldest go`, () => {
    const oldest = sourceIntakeSessionFor('catalog-1');
    const second = sourceIntakeSessionFor('catalog-2');
    second.files.addFiles([fileOf('Modelo;Faixa\nA;1\n', 'a.csv')]);
    sourceIntakeSessionFor('catalog-3');
    // Opening catalog 1 again makes it the most recent one, so catalog 2 is now the oldest.
    expect(sourceIntakeSessionFor('catalog-1')).toBe(oldest);
    sourceIntakeSessionFor('catalog-4');
    expect(sourceIntakeSessionFor('catalog-1')).toBe(oldest);
    expect(second.files.getEntries()).toEqual([]);
    expect(sourceIntakeSessionFor('catalog-2')).not.toBe(second);
  });

  it('reads files without any screen open, and tells every listener', async () => {
    const store = createSourceFileStore();
    const seen: number[] = [];
    const stop = store.subscribe(() => seen.push(store.getEntries().length));
    store.addFiles([fileOf('Modelo;Faixa\nPCON-Y17;0 a 20 bar\n', 'lista.csv')]);
    const entries = await settled(store);
    expect(entries.map((entry) => [entry.fileName, entry.state])).toEqual([['lista.csv', 'ready']]);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    stop();
  });

  it('files let go anywhere on the assistant join the list, but not while a table is being inserted', () => {
    const intake = sourceIntakeSessionFor('catalog-drop');
    intake.insertion.set({ phase: 'idle', pending: null, notice: { tone: 'success', text: 'Tabela inserida.' } });
    expect(dropIntoIntake(intake, [fileOf('Modelo;Faixa\nA;1\n', 'a.csv')])).toBe(true);
    expect(intake.files.getEntries()).toHaveLength(1);
    // The old message goes away when new files come in.
    expect(intake.insertion.get().notice).toBeNull();
    intake.insertion.set({ ...intake.insertion.get(), phase: 'measuring' });
    expect(dropIntoIntake(intake, [fileOf('Modelo;Faixa\nB;2\n', 'b.csv')])).toBe(false);
    expect(intake.files.getEntries()).toHaveLength(1);
  });
});
