import { neighbors } from './neighbors';
import type { GameState } from './types';

/** Eligibility uses visible numbers and the count of flags, never flag correctness. */
export function chordTargets(state: GameState, index: number): number[] {
  if (state.covers[index] !== 'revealed' || !state.truth) return [];
  const number = state.truth.counts[index];
  if (number === 0) return [];
  const nearby = neighbors(index, state.config.rows, state.config.cols);
  if (nearby.filter((n) => state.covers[n] === 'flagged').length !== number) return [];
  return nearby.filter((n) => state.covers[n] === 'hidden');
}
