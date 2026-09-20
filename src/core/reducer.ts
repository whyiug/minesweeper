import { autoChord } from './auto-chord';
import { chordTargets } from './chord';
import { generateTruth, validateConfig } from './generate';
import { revealBatch } from './reveal';
import type { GameAction, GameConfig, GameEvent, GameState, RuleContext } from './types';

export function createGame(config: GameConfig, gameId: string): GameState {
  validateConfig(config);
  return {
    gameId, config: { ...config }, phase: 'ready',
    covers: Array(config.rows * config.cols).fill('hidden'), truth: null,
    startedAt: null, endedAt: null, flagCount: 0, revealedCount: 0,
    exploded: null, sequence: 0, events: [],
  };
}

export function reduceGame(state: GameState, action: GameAction, context: RuleContext): GameState {
  const { index, type } = action;
  if (state.phase === 'won' || state.phase === 'lost') return state;
  if (!Number.isInteger(index) || index < 0 || index >= state.covers.length) return state;
  const cover = state.covers[index];
  if (type === 'FLAG' && cover === 'revealed') return state;
  if (type === 'REVEAL' && cover !== 'hidden') return state;
  const manualTargets = type === 'CHORD' ? chordTargets(state, index) : [];
  if (type === 'CHORD' && manualTargets.length === 0) return state;
  if (!Number.isFinite(context.now)) throw new Error('时钟必须提供有限的毫秒数。');

  const draft: GameState = {
    ...state, covers: [...state.covers], sequence: state.sequence + 1, events: [],
  };
  const emit = (eventType: GameEvent['type'], indices: number[], origin = index) => {
    draft.events.push({
      id: `${draft.gameId}:${draft.sequence}:${draft.events.length}`,
      gameId: draft.gameId, type: eventType, indices, origin,
    });
  };
  const lose = (hit: number) => {
    draft.phase = 'lost';
    draft.exploded = hit;
    draft.endedAt = context.now;
    emit('lost', draft.truth!.mines.flatMap((isMine, i) => isMine ? [i] : []), hit);
  };
  let changed: number[];
  if (type === 'FLAG') {
    draft.covers[index] = cover === 'flagged' ? 'hidden' : 'flagged';
    draft.flagCount += cover === 'flagged' ? -1 : 1;
    changed = [index];
    emit('flag', changed);
  } else {
    if (!draft.truth) {
      draft.truth = generateTruth(draft.config, index, context.random);
      draft.startedAt = context.now;
      draft.phase = 'playing';
    }
    const batch = revealBatch(draft, type === 'CHORD' ? manualTargets : [index]);
    if (batch.hit !== null) {
      lose(batch.hit);
      return draft;
    }
    changed = batch.opened;
    emit(type === 'CHORD' ? 'chord' : 'reveal', changed);
  }
  if (draft.phase === 'playing' && draft.config.chordMode === 'auto') {
    const cascade = autoChord(draft, changed);
    if (cascade.opened.length > 0) emit('chord', cascade.opened);
    if (cascade.hit !== null) {
      lose(cascade.hit);
      return draft;
    }
  }
  // Terminal evaluation is deliberately after the entire auto-chord transaction.
  if (draft.phase === 'playing' && draft.revealedCount === draft.covers.length - draft.config.mineCount) {
    draft.phase = 'won';
    draft.endedAt = context.now;
    emit('won', []);
  }
  return draft;
}

export function remainingFlags(state: GameState): number {
  return state.config.mineCount - state.flagCount;
}

export function elapsedMs(state: GameState, now: number): number {
  if (state.startedAt === null) return 0;
  return (state.endedAt ?? now) - state.startedAt;
}
