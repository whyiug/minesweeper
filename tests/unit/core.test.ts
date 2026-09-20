import { describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES, getConfig } from '../../src/config/game';
import {
  chordTargets, createGame, elapsedMs, generateTruth, neighbors, reduceGame,
  remainingFlags, seededRandom, visibleView,
} from '../../src/core';
import type { ChordMode, GameState } from '../../src/core';

function fixture({ mines = [5], revealed = [0], flags = [], mode = 'single' }: {
  mines?: number[]; revealed?: number[]; flags?: number[]; mode?: ChordMode;
} = {}): GameState {
  const state = createGame({ difficulty: 'intro', rows: 4, cols: 4, mineCount: mines.length, chordMode: mode }, 'fixture');
  state.phase = 'playing';
  state.startedAt = 100;
  state.truth = {
    mines: Array.from({ length: 16 }, (_, i) => mines.includes(i)),
    counts: Array.from({ length: 16 }, (_, i) => neighbors(i, 4, 4).filter((n) => mines.includes(n)).length),
  };
  for (const i of revealed) state.covers[i] = 'revealed';
  for (const i of flags) state.covers[i] = 'flagged';
  state.revealedCount = revealed.length;
  state.flagCount = flags.length;
  return state;
}

const context = { now: 1_234, random: seededRandom(42) };

describe('configuration and generation', () => {
  it('has the four contracted presets and starts with the initial board', () => {
    expect(DIFFICULTIES).toEqual({
      intro: { name: '启蒙', rows: 6, cols: 6, mineCount: 4 },
      beginner: { name: '初级', rows: 9, cols: 9, mineCount: 10 },
      intermediate: { name: '中级', rows: 16, cols: 16, mineCount: 40 },
      expert: { name: '高级', rows: 16, cols: 30, mineCount: 99 },
    });
    const state = createGame(getConfig(), 'initial');
    expect(state.config).toEqual({ difficulty: 'beginner', rows: 9, cols: 9, mineCount: 10, chordMode: 'single' });
    expect(state.phase).toBe('ready');
    expect(state.truth).toBeNull();
    expect(state.startedAt).toBeNull();
  });

  it('uses row-major neighbors without wrapping at edges, even for narrow boards', () => {
    expect(neighbors(0, 4, 4)).toEqual([1, 4, 5]);
    expect(neighbors(3, 4, 4)).toEqual([2, 6, 7]);
    expect(neighbors(5, 4, 4)).toEqual([0, 1, 2, 4, 6, 8, 9, 10]);
    expect(neighbors(15, 4, 4)).toEqual([10, 11, 14]);
    expect(neighbors(2, 1, 5)).toEqual([1, 3]);
    expect(neighbors(2, 5, 1)).toEqual([1, 3]);
    expect(neighbors(0, 1, 1)).toEqual([]);
    expect(neighbors(-1, 4, 4)).toEqual([]);
    expect(neighbors(16, 4, 4)).toEqual([]);
  });

  it('rejects impossible full-neighborhood protection instead of reducing mine count', () => {
    expect(() => createGame({ ...getConfig(), rows: 3, cols: 3, mineCount: 1 }, 'bad')).toThrow();
    expect(() => createGame({ ...getConfig(), mineCount: -1 }, 'bad')).toThrow();
    expect(() => createGame({ ...getConfig(), rows: 0 }, 'bad')).toThrow();
    expect(() => createGame({ ...getConfig(), cols: 1.5 }, 'bad')).toThrow();
    expect(() => createGame({ ...getConfig(), rows: Number.MAX_SAFE_INTEGER }, 'bad')).toThrow();
  });

  it('generates exactly the requested mines, reproduces a seed and protects first neighborhood', () => {
    const config = getConfig();
    const truth = generateTruth(config, 40, seededRandom(765));
    expect(truth).toEqual(generateTruth(config, 40, seededRandom(765)));
    expect(truth).not.toEqual(generateTruth(config, 40, seededRandom(766)));
    expect(truth.mines.filter(Boolean)).toHaveLength(10);
    for (const i of [40, ...neighbors(40, 9, 9)]) expect(truth.mines[i]).toBe(false);
    expect(truth.counts[40]).toBe(0);
  });

  it('supports maximum mine count and validates injected randomness', () => {
    const config = { ...getConfig(), rows: 4, cols: 4, mineCount: 7 };
    expect(generateTruth(config, 5, () => 0).mines.filter(Boolean)).toHaveLength(7);
    for (const value of [-1, 1, NaN, Infinity]) {
      expect(() => generateTruth(config, 5, () => value)).toThrow();
    }
    expect(() => generateTruth(config, 16, () => 0)).toThrow();
  });

  it('preflags neither start the timer nor influence the generated mine locations', () => {
    const initial = createGame(getConfig(), 'preflags');
    const random = vi.fn(seededRandom(37));
    const flagged = reduceGame(initial, { type: 'FLAG', index: 12 }, { now: 10, random });
    expect(flagged.truth).toBeNull();
    expect(flagged.startedAt).toBeNull();
    expect(random).not.toHaveBeenCalled();
    expect(reduceGame(flagged, { type: 'REVEAL', index: 12 }, context)).toBe(flagged);
    const opened = reduceGame(flagged, { type: 'REVEAL', index: 40 }, { now: 20, random });
    const control = reduceGame(initial, { type: 'REVEAL', index: 40 }, { now: 20, random: seededRandom(37) });
    expect(opened.truth).toEqual(control.truth);
    expect(opened.startedAt).toBe(20);
    expect(opened.covers[12]).toBe('flagged');
  });
});

describe('reveal, flags, time and terminal states', () => {
  it('iteratively reveals a large zero region and border numbers, skipping flags', () => {
    const config = { ...getConfig(), rows: 100, cols: 100, mineCount: 0 };
    let state = createGame(config, 'large-blank');
    state = reduceGame(state, { type: 'FLAG', index: 100 }, context);
    state = reduceGame(state, { type: 'REVEAL', index: 0 }, context);
    expect(state.revealedCount).toBe(9_999);
    expect(state.phase).toBe('playing');
    expect(state.covers[100]).toBe('flagged');
    state = reduceGame(state, { type: 'FLAG', index: 100 }, context);
    expect(state.phase).toBe('playing');
    state = reduceGame(state, { type: 'REVEAL', index: 100 }, { ...context, now: 2_000 });
    expect(state.phase).toBe('won');
    expect(state.endedAt).toBe(2_000);
  });

  it('counts flags without clamping, and filling the mine quota never wins', () => {
    let state = createGame(getConfig('intro'), 'flags');
    for (let index = 0; index < 6; index++) state = reduceGame(state, { type: 'FLAG', index }, context);
    expect(state.flagCount).toBe(6);
    expect(remainingFlags(state)).toBe(-2);
    expect(state.phase).toBe('ready');
    expect(state.truth).toBeNull();
  });

  it('wins on all safe cells with no flags and commits before presentation', () => {
    const state = fixture({ mines: [0], revealed: [] });
    const result = reduceGame(state, { type: 'REVEAL', index: 15 }, context);
    expect(result.phase).toBe('won');
    expect(result.revealedCount).toBe(15);
    expect(result.flagCount).toBe(0);
    expect(result.endedAt).toBe(context.now);
    expect(result.events.map((event) => event.type)).toEqual(['reveal', 'won']);
  });

  it('freezes terminal boards and does not duplicate outcome events', () => {
    for (const terminal of [
      reduceGame(fixture(), { type: 'REVEAL', index: 5 }, context),
      reduceGame(fixture({ mines: [0], revealed: [] }), { type: 'REVEAL', index: 15 }, context),
    ]) {
      for (const type of ['REVEAL', 'FLAG', 'CHORD'] as const) {
        expect(reduceGame(terminal, { type, index: 1 }, context)).toBe(terminal);
      }
      expect(terminal.events.filter((e) => e.type === 'won' || e.type === 'lost')).toHaveLength(1);
    }
  });

  it('does not mutate prior state and returns the same state for ineffective actions', () => {
    const state = fixture();
    const snapshot = structuredClone(state);
    reduceGame(state, { type: 'FLAG', index: 5 }, context);
    expect(state).toEqual(snapshot);
    expect(reduceGame(state, { type: 'FLAG', index: 0 }, context)).toBe(state);
    expect(reduceGame(state, { type: 'CHORD', index: 0 }, context)).toBe(state);
    expect(reduceGame(state, { type: 'REVEAL', index: -1 }, context)).toBe(state);
    expect(reduceGame(state, { type: 'REVEAL', index: 0.5 }, context)).toBe(state);
  });

  it('uses injected elapsed wall time without a 999 second cap or tick counting', () => {
    const ready = createGame(getConfig(), 'clock');
    expect(elapsedMs(ready, 20_000)).toBe(0);
    const playing = fixture();
    expect(elapsedMs(playing, 2_000_100)).toBe(2_000_000);
    expect(elapsedMs(playing, 90)).toBe(-10); // caller must reject abnormal scores, not conceal them
    const lost = reduceGame(playing, { type: 'REVEAL', index: 5 }, { ...context, now: 1_100 });
    expect(elapsedMs(lost, 9_999_999)).toBe(1_000);
  });
});

describe('manual and automatic chording', () => {
  it.each(['single', 'double'] as const)('accepts an explicit keyboard CHORD in %s mode', (mode) => {
    const state = fixture({ flags: [5], mode });
    expect(chordTargets(state, 0)).toEqual([1, 4]);
    const result = reduceGame(state, { type: 'CHORD', index: 0 }, context);
    expect(result.revealedCount).toBe(3);
    expect(result.covers[1]).toBe('revealed');
    expect(result.covers[4]).toBe('revealed');
    expect(result.phase).toBe('playing');
  });

  it('only chords a visible nonzero number with an equal flag count', () => {
    expect(chordTargets(fixture(), 0)).toEqual([]);
    expect(chordTargets(fixture({ flags: [1, 5] }), 0)).toEqual([]);
    expect(chordTargets(fixture({ revealed: [15], flags: [5] }), 15)).toEqual([]);
    expect(chordTargets(fixture({ flags: [5] }), 1)).toEqual([]);
  });

  it.each(['single', 'double', 'auto'] as const)('wrong flags cause a real loss in %s mode', (mode) => {
    let state = fixture({ mode });
    state = reduceGame(state, { type: 'FLAG', index: 1 }, context);
    if (mode !== 'auto') state = reduceGame(state, { type: 'CHORD', index: 0 }, context);
    expect(state.phase).toBe('lost');
    expect(state.exploded).toBe(5);
    expect(state.covers[4]).toBe('hidden'); // complete batch checked before any safe target
    expect(state.covers[1]).toBe('flagged'); // no secret correction
  });

  it('preflights all chord targets, even when the safe target has the lower index', () => {
    const state = fixture({ mines: [5], revealed: [0], flags: [1] });
    expect(chordTargets(state, 0)).toEqual([4, 5]);
    const result = reduceGame(state, { type: 'CHORD', index: 0 }, context);
    expect(result.phase).toBe('lost');
    expect(result.revealedCount).toBe(1);
    expect(result.events.map((event) => event.type)).toEqual(['lost']);
  });

  it('settles an entire chain in one flag transaction and evaluates victory last', () => {
    const state = fixture({ mode: 'auto' });
    const result = reduceGame(state, { type: 'FLAG', index: 5 }, context);
    expect(result.phase).toBe('won');
    expect(result.revealedCount).toBe(15);
    expect(result.sequence).toBe(1);
    expect(result.events.map((event) => event.type)).toEqual(['flag', 'chord', 'won']);
    expect(result.events.find((event) => event.type === 'chord')!.indices).toHaveLength(14);
    expect(result.covers[5]).toBe('flagged');
    expect(result.endedAt).toBe(context.now);
  });

  it('deduplicates shared neighborhoods and emitted reveals in fixed order', () => {
    const state = fixture({ mode: 'auto', revealed: [0, 1, 4] });
    const result = reduceGame(state, { type: 'FLAG', index: 5 }, context);
    expect(result).toEqual(reduceGame(state, { type: 'FLAG', index: 5 }, context));
    expect(result.phase).toBe('won');
    const indices = result.events.find((event) => event.type === 'chord')!.indices;
    expect(indices).toHaveLength(12);
    expect(new Set(indices).size).toBe(indices.length);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(result.events.length);
  });

  it('stops without progress and does not search distant eligible numbers', () => {
    const state = fixture({ mode: 'auto', flags: [5] });
    const result = reduceGame(state, { type: 'FLAG', index: 15 }, context);
    expect(result.revealedCount).toBe(1);
    expect(result.events.map((event) => event.type)).toEqual(['flag']);
    expect(result.phase).toBe('playing');
    const overflagged = fixture({ mode: 'auto', flags: [1, 4] });
    const noProgress = reduceGame(overflagged, { type: 'FLAG', index: 5 }, context);
    expect(noProgress.phase).toBe('playing');
    expect(noProgress.revealedCount).toBe(1);
  });

  it('also starts automatic cascades after a valid reveal and after removing a flag', () => {
    const beforeReveal = fixture({ mode: 'auto', revealed: [], flags: [5] });
    expect(reduceGame(beforeReveal, { type: 'REVEAL', index: 0 }, context).phase).toBe('won');
    const beforeUnflag = fixture({ mode: 'auto', flags: [1, 5] });
    expect(reduceGame(beforeUnflag, { type: 'FLAG', index: 1 }, context).phase).toBe('won');
  });
});

describe('visible information boundary and event identity', () => {
  it('never exposes hidden counts, mines or wrong flags during play', () => {
    const cells = visibleView(fixture({ flags: [1] }));
    expect(cells[0]).toEqual({ index: 0, cover: 'revealed', number: 1 });
    expect(cells[1]).toEqual({ index: 1, cover: 'flagged' });
    expect(cells[5]).toEqual({ index: 5, cover: 'hidden' });
    expect(cells[15]).toEqual({ index: 15, cover: 'hidden' });
  });

  it('reveals every mine, the triggering cell and wrong flags on loss', () => {
    const state = fixture({ mines: [5, 15], flags: [1] });
    const lost = reduceGame(state, { type: 'REVEAL', index: 5 }, context);
    const cells = visibleView(lost);
    expect(cells[5]).toEqual({ index: 5, cover: 'hidden', mine: true, exploded: true });
    expect(cells[15]).toEqual({ index: 15, cover: 'hidden', mine: true });
    expect(cells[1]).toEqual({ index: 1, cover: 'flagged', wrongFlag: true });
  });

  it('has stable transaction ids with no event collision after a new game', () => {
    const first = reduceGame(createGame(getConfig(), 'a'), { type: 'FLAG', index: 0 }, context);
    const second = reduceGame(first, { type: 'FLAG', index: 0 }, context);
    const fresh = reduceGame(createGame(getConfig(), 'b'), { type: 'FLAG', index: 0 }, context);
    expect(new Set([first.events[0].id, second.events[0].id, fresh.events[0].id]).size).toBe(3);
    expect(second.events).toHaveLength(1);
    expect(second.events[0].gameId).toBe('a');
  });
});
