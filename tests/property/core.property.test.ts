import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, getConfig } from '../../src/config/game';
import { createGame, generateTruth, neighbors, reduceGame, seededRandom, visibleView } from '../../src/core';
import type { Difficulty, GameState } from '../../src/core';

function assertInvariants(state: GameState) {
  expect(state.flagCount).toBe(state.covers.filter((cover) => cover === 'flagged').length);
  expect(state.revealedCount).toBe(state.covers.filter((cover) => cover === 'revealed').length);
  if (!state.truth) {
    expect(state.phase).toBe('ready');
    expect(state.startedAt).toBeNull();
    return;
  }
  expect(state.truth.mines.filter(Boolean)).toHaveLength(state.config.mineCount);
  const revealed = state.covers.flatMap((cover, i) => cover === 'revealed' ? [i] : []);
  expect(revealed.every((i) => !state.truth!.mines[i])).toBe(true);
  if (state.phase === 'won') expect(state.revealedCount).toBe(state.covers.length - state.config.mineCount);
  if (state.phase === 'lost') expect(state.truth.mines[state.exploded!]).toBe(true);
  if (state.phase === 'playing') {
    expect(state.revealedCount).toBeLessThan(state.covers.length - state.config.mineCount);
    const hidden = visibleView(state).filter((cell) => cell.cover !== 'revealed');
    expect(hidden.every((cell) => Object.keys(cell).sort().join(',') === 'cover,index')).toBe(true);
  }
  const changed = state.events.filter((e) => e.type === 'reveal' || e.type === 'chord').flatMap((e) => e.indices);
  expect(new Set(changed).size).toBe(changed.length);
}

describe('fixed-seed rule properties', () => {
  it('protects all possible first clicks across all four presets and three seeds', () => {
    for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
      const config = getConfig(difficulty);
      for (const seed of [0, 1, 0xffffffff]) {
        for (let first = 0; first < config.rows * config.cols; first++) {
          const truth = generateTruth(config, first, seededRandom(seed));
          expect(truth.mines.filter(Boolean)).toHaveLength(config.mineCount);
          expect([first, ...neighbors(first, config.rows, config.cols)].every((i) => !truth.mines[i])).toBe(true);
          expect(truth.counts[first]).toBe(0);
          const expectedCounts = truth.mines.map((_, i) => neighbors(i, config.rows, config.cols).filter((n) => truth.mines[n]).length);
          expect(truth.counts).toEqual(expectedCounts);
        }
      }
    }
  }, 30_000);

  it('settles 256 seeded automatic games deterministically under mixed valid and invalid actions', () => {
    const difficulties = Object.keys(DIFFICULTIES) as Difficulty[];
    for (let seed = 0; seed < 256; seed++) {
      const config = getConfig(difficulties[seed % difficulties.length], 'auto');
      let left = createGame(config, `seed-${seed}`);
      let right = createGame(config, `seed-${seed}`);
      const leftRandom = seededRandom(seed);
      const rightRandom = seededRandom(seed);
      const actionsRandom = seededRandom(seed + 10_000);
      for (let step = 0; step < 80; step++) {
        const index = Math.floor(actionsRandom() * left.covers.length);
        const type = (['REVEAL', 'FLAG', 'CHORD'] as const)[Math.floor(actionsRandom() * 3)];
        const previous = left;
        const snapshot = structuredClone(left);
        left = reduceGame(left, { type, index }, { now: 100 + step * 7, random: leftRandom });
        right = reduceGame(right, { type, index }, { now: 100 + step * 7, random: rightRandom });
        expect(left).toEqual(right);
        expect(previous).toEqual(snapshot);
        assertInvariants(left);
        if (left.phase === 'won' || left.phase === 'lost') {
          expect(reduceGame(left, { type: 'FLAG', index }, { now: 5_000, random: leftRandom })).toBe(left);
          break;
        }
      }
    }
  }, 30_000);

  it('completes 128 seeded games when a test oracle flags only real mines', () => {
    // The oracle exists only in this test. Production auto-chord never checks flag truth.
    for (let seed = 0; seed < 128; seed++) {
      const config = getConfig(seed % 2 === 0 ? 'beginner' : 'expert', 'auto');
      const random = seededRandom(seed);
      let state = createGame(config, `oracle-${seed}`);
      state = reduceGame(state, { type: 'REVEAL', index: seed % state.covers.length }, { now: 100, random });
      for (let index = 0; index < state.covers.length; index++) {
        if (state.truth!.mines[index]) {
          state = reduceGame(state, { type: 'FLAG', index }, { now: 200 + index, random });
          assertInvariants(state);
        }
      }
      // Separated unrevealed regions still require an explicit safe opening, not a solver.
      for (let index = 0; index < state.covers.length; index++) {
        if (!state.truth!.mines[index]) state = reduceGame(state, { type: 'REVEAL', index }, { now: 1_000 + index, random });
      }
      expect(state.phase).toBe('won');
      assertInvariants(state);
    }
  }, 30_000);
});
