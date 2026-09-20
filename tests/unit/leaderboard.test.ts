import { describe, expect, it, vi } from 'vitest';
import { createLeaderboard, isScoreEntry, LEADERBOARD_KEY, type ScoreEntry } from '../../src/storage/leaderboard';

function score(overrides: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    id: 'score-1', gameId: 'game-1', nickname: '访客', difficulty: 'beginner',
    controlClass: 'manual', elapsedMs: 12345, completedAt: '2026-09-20T08:00:00.000Z',
    rulesVersion: 'modern-v1', ...overrides,
  };
}

function storageFixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  const getStorage = vi.fn(() => storage);
  return { values, storage, getStorage };
}

describe('local leaderboard privacy and failure boundaries', () => {
  it('never even resolves storage while disabled, and does not read eagerly', () => {
    const fixture = storageFixture();
    const board = createLeaderboard({ enabled: false, getStorage: fixture.getStorage });
    expect(board.list().entries).toEqual([]);
    expect(board.save(score()).saved).toBe(false);
    expect(board.clear().entries).toEqual([]);
    board.setEnabled(true);
    board.setEnabled(false);
    expect(fixture.getStorage).not.toHaveBeenCalled();
  });

  it('writes only an explicit valid save; disabling preserves existing entries', () => {
    const fixture = storageFixture();
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    expect(fixture.getStorage).not.toHaveBeenCalled();
    expect(board.list()).toEqual({ entries: [] });
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
    expect(board.save(score())).toEqual({ entries: [score()], saved: true });
    board.setEnabled(false);
    fixture.getStorage.mockClear();
    expect(board.list()).toEqual({ entries: [] });
    expect(fixture.getStorage).not.toHaveBeenCalled();
    board.setEnabled(true);
    expect(board.list()).toEqual({ entries: [score()] });
  });

  it('saves a game only once, including when its nickname or score id is changed', () => {
    const fixture = storageFixture();
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    board.save(score());
    expect(board.save(score({ id: 'changed', nickname: '哥哥', elapsedMs: 1 })).saved).toBe(false);
    expect(fixture.storage.setItem).toHaveBeenCalledTimes(1);
    expect(board.list().entries).toEqual([score()]);
  });

  it('keeps independent Top 10 lists for every difficulty and control class', () => {
    const fixture = storageFixture();
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    for (const difficulty of ['intro', 'beginner', 'intermediate', 'expert'] as const) {
      for (const controlClass of ['manual', 'auto'] as const) {
        for (let time = 12; time >= 1; time--) {
          const id = `${difficulty}-${controlClass}-${time}`;
          expect(board.save(score({ id, gameId: id, difficulty, controlClass, elapsedMs: time * 1000 })).saved).toBe(true);
        }
      }
    }
    const entries = board.list().entries;
    expect(entries).toHaveLength(80);
    for (const difficulty of ['intro', 'beginner', 'intermediate', 'expert'] as const) {
      for (const controlClass of ['manual', 'auto'] as const) {
        expect(entries.filter((entry) => entry.difficulty === difficulty && entry.controlClass === controlClass)
          .map((entry) => entry.elapsedMs)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]);
      }
    }
    const writes = fixture.storage.setItem.mock.calls.length;
    expect(board.save(score({ id: 'slow', gameId: 'slow', elapsedMs: 999999 })).saved).toBe(false);
    expect(fixture.storage.setItem).toHaveBeenCalledTimes(writes);
  });

  it('allows long games and zero elapsed but rejects invalid/negative timing', () => {
    expect(isScoreEntry(score({ elapsedMs: 1000 * 60 * 60 * 24 }))).toBe(true);
    expect(isScoreEntry(score({ elapsedMs: 0 }))).toBe(true);
    for (const elapsedMs of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE]) {
      expect(isScoreEntry(score({ elapsedMs }))).toBe(false);
    }
  });

  it.each([
    { id: '' }, { id: 'a'.repeat(129) }, { gameId: '\nprivate' }, { gameId: ' spaces ' },
    { nickname: '真实姓名' }, { difficulty: 'custom' }, { controlClass: 'single' },
    { elapsedMs: '100' }, { rulesVersion: 'old' }, { completedAt: 'yesterday' },
    { completedAt: '2026-02-30T08:00:00.000Z' }, { completedAt: '2026-09-20' },
  ])('rejects malformed record fields without persisting: %j', (invalid) => {
    const fixture = storageFixture();
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    expect(board.save({ ...score(), ...invalid } as ScoreEntry).saved).toBe(false);
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    '{broken', '[]', 'null', JSON.stringify({ version: 1, entries: [] }),
    JSON.stringify({ version: 2, entries: [score(), score()] }),
    JSON.stringify({ version: 2, entries: [{ ...score(), extra: 'private state' }] }),
    JSON.stringify({ version: 2, entries: Array.from({ length: 81 }, (_, i) => score({ id: `${i}`, gameId: `${i}` })) }),
    JSON.stringify({ version: 2, entries: Array.from({ length: 11 }, (_, i) => score({ id: `${i}`, gameId: `${i}` })) }),
    ' '.repeat(65537),
  ])('handles corrupted, excessive or duplicate storage without changing it', (raw) => {
    const fixture = storageFixture();
    fixture.values.set(LEADERBOARD_KEY, raw);
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    expect(board.list()).toEqual({ entries: [], error: expect.any(String) });
    expect(board.save(score()).saved).toBe(false);
    expect(fixture.values.get(LEADERBOARD_KEY)).toBe(raw);
    expect(fixture.storage.setItem).not.toHaveBeenCalled();
  });

  it('isolates its key when clearing, including corrupted data', () => {
    const fixture = storageFixture();
    fixture.values.set('another-app', 'keep');
    fixture.values.set(LEADERBOARD_KEY, 'invalid');
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    expect(board.clear()).toEqual({ entries: [] });
    expect(fixture.storage.removeItem).toHaveBeenCalledWith(LEADERBOARD_KEY);
    expect(fixture.values.get('another-app')).toBe('keep');
  });

  it('handles storage access denial, write quota and removal failure', () => {
    const denied = createLeaderboard({ enabled: true, getStorage: () => { throw new Error('Denied'); } });
    expect(denied.list().error).toBeTruthy();
    expect(denied.save(score()).saved).toBe(false);
    expect(denied.clear().error).toBeTruthy();
    const fixture = storageFixture();
    const board = createLeaderboard({ enabled: true, getStorage: fixture.getStorage });
    board.save(score());
    fixture.storage.setItem.mockImplementation(() => { throw new Error('QuotaExceeded'); });
    const failed = board.save(score({ id: 'score-2', gameId: 'game-2' }));
    expect(failed.saved).toBe(false);
    expect(failed.entries).toEqual([score()]);
    fixture.storage.removeItem.mockImplementation(() => { throw new Error('Denied'); });
    expect(board.clear().error).toBeTruthy();
    expect(board.list().entries).toEqual([score()]);
  });
});
