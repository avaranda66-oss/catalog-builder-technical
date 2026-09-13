import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryWriteScheduler } from '@/vnext/recovery';

describe('W3.D recovery scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('writes the first dirty value immediately and coalesces the trailing latest value', async () => {
    const values: string[] = [];
    const scheduler = new RecoveryWriteScheduler<string>({ write: async (value) => { values.push(value); } });
    scheduler.schedule('L1');
    await vi.advanceTimersByTimeAsync(0);
    expect(values).toEqual(['L1']);
    scheduler.schedule('L2');
    await vi.advanceTimersByTimeAsync(400);
    scheduler.schedule('L3');
    await vi.advanceTimersByTimeAsync(749);
    expect(values).toEqual(['L1']);
    await vi.advanceTimersByTimeAsync(1);
    expect(values).toEqual(['L1', 'L3']);
  });

  it('flushes continuous editing by the 3000 ms maximum wait and serializes writes', async () => {
    const values: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const scheduler = new RecoveryWriteScheduler<string>({
      write: async (value) => {
        values.push(value);
        if (value === 'L1') await firstBlocked;
      },
    });
    scheduler.schedule('L1');
    for (let elapsed = 250; elapsed < 3000; elapsed += 250) {
      await vi.advanceTimersByTimeAsync(250);
      scheduler.schedule(`L${elapsed}`);
    }
    await vi.advanceTimersByTimeAsync(250);
    expect(values).toEqual(['L1']);
    releaseFirst();
    await scheduler.flush();
    expect(values).toEqual(['L1', 'L2750']);
  });

  it('continues with later protection after a failed write', async () => {
    const values: string[] = [];
    const errors: unknown[] = [];
    const scheduler = new RecoveryWriteScheduler<string>({
      write: async (value) => {
        if (value === 'bad') throw new Error('quota');
        values.push(value);
      },
      onError: (error) => errors.push(error),
    });
    scheduler.schedule('bad');
    await vi.advanceTimersByTimeAsync(0);
    await expect(scheduler.flush()).rejects.toThrow('quota');
    scheduler.schedule('good');
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.flush();
    expect(values).toEqual(['good']);
    expect(errors).toHaveLength(1);
  });
});
