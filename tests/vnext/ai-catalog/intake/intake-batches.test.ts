import { describe, expect, it } from 'vitest';
import {
  batchEntries, dropBatchIntoIntake, fileNamesText, intakeBatchSummary, intakeBatchesFor,
} from '../../../../src/vnext/ai-catalog/intake/intake-batches';
import type { IntakeEntry } from '../../../../src/vnext/ai-catalog/intake/intake-model';
import { createSourceIntakeSession } from '../../../../src/vnext/ai-catalog/intake/intake-store';
import type { SourceBlock } from '../../../../src/vnext/ai-catalog/source-intake';

const source = { fileName: 'x', sha256: 'x', location: 'arquivo' };
const table = (id: string): SourceBlock => ({ id, title: id, kind: 'table', source, warnings: [], rows: [['A']], addresses: [['A1']],
  raw: [['A']], flags: [], merges: [] });
const photo = (id: string): SourceBlock => ({ id, title: id, kind: 'image', source, warnings: [], file: new File([''], 'f.jpg'), mime: 'image/jpeg' });
const entry = (fileName: string, state: IntakeEntry['state'], blocks: SourceBlock[] = []): IntakeEntry => ({
  id: fileName, file: new File([''], fileName), fileName, kind: 'other', state, options: {},
  intake: state === 'ready' || state === 'needs-help' ? { blocks, warnings: [], ignored: [], rangeRequests: [] } : undefined,
});

describe('one short message per batch of files', () => {
  it('names the files in plain Portuguese', () => {
    expect(fileNamesText(['a.pdf'])).toBe('a.pdf');
    expect(fileNamesText(['a.pdf', 'b.csv'])).toBe('a.pdf e b.csv');
    expect(fileNamesText(['a.pdf', 'b.csv', 'c.jpg'])).toBe('a.pdf, b.csv e c.jpg');
    expect(fileNamesText(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c e mais 2');
  });

  it('says it is reading, then what it read and found, in one or two sentences', () => {
    expect(intakeBatchSummary([entry('a.pdf', 'reading'), entry('b.csv', 'ready')]).text).toBe('Lendo a.pdf…');
    expect(intakeBatchSummary([entry('a.pdf', 'reading'), entry('b.csv', 'reading')])).toMatchObject({ reading: true, text: 'Lendo 2 arquivos…' });
    const done = intakeBatchSummary([entry('a.pdf', 'ready', [table('t1'), table('t2')]), entry('foto.jpg', 'ready', [photo('p')]),
      entry('c.csv', 'needs-help')]);
    expect(done).toMatchObject({ reading: false, tables: 2, needsAttention: true });
    expect(done.text).toBe('Li 3 arquivos: a.pdf, foto.jpg e c.csv. Encontrei 2 tabelas e 1 foto. Um deles precisa da sua ajuda.');
  });

  it('mentions the files it could not read, the repeated ones and the ones over the limit', () => {
    expect(intakeBatchSummary([entry('ruim.pdf', 'error')]).text).toBe('Não consegui ler ruim.pdf.');
    expect(intakeBatchSummary([entry('a.pdf', 'duplicate')]).text).toBe('a.pdf é repetido e não foi lido de novo.');
    expect(intakeBatchSummary([entry('a.pdf', 'skipped'), entry('b.pdf', 'skipped')]).text).toBe('2 arquivos ficaram de fora pelo limite de arquivos.');
    expect(intakeBatchSummary([]).text).toBe('Nenhum arquivo deste envio continua na lista.');
  });

  it('records only the files of this drop as the batch, and nothing while a table is being inserted', () => {
    const session = createSourceIntakeSession();
    const first = dropBatchIntoIntake(session, [new File(['A;B\n1;2\n'], 'a.csv')], { conversationId: 'c1', at: 1 });
    const second = dropBatchIntoIntake(session, [new File(['A;B\n3;4\n'], 'b.csv'), new File(['A;B\n5;6\n'], 'c.csv')], { at: 2 });
    expect(first?.entryIds).toHaveLength(1);
    expect(second?.entryIds).toHaveLength(2);
    expect(intakeBatchesFor(session).get()).toEqual([first, second]);
    expect(batchEntries(second!, session.files.getEntries()).map((item) => item.fileName)).toEqual(['b.csv', 'c.csv']);
    session.files.remove(second!.entryIds[0]);
    expect(batchEntries(second!, session.files.getEntries()).map((item) => item.fileName)).toEqual(['c.csv']);
    session.insertion.set({ ...session.insertion.get(), phase: 'measuring' });
    expect(dropBatchIntoIntake(session, [new File(['x'], 'd.csv')])).toBeNull();
    expect(intakeBatchesFor(session).get()).toHaveLength(2);
    session.files.clear();
  });
});
