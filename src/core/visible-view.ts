import type { GameState, VisibleCell } from './types';

/** This is the only cell data crossing from the rules layer to the board UI. */
export function visibleView(state: GameState): VisibleCell[] {
  const ended = state.phase === 'won' || state.phase === 'lost';
  return state.covers.map((cover, index) => {
    const cell: VisibleCell = { index, cover };
    if (state.truth && cover === 'revealed' && !state.truth.mines[index]) {
      cell.number = state.truth.counts[index];
    }
    if (ended && state.truth) {
      if (state.truth.mines[index]) cell.mine = true;
      if (cover === 'flagged' && !state.truth.mines[index]) cell.wrongFlag = true;
      if (index === state.exploded) cell.exploded = true;
    }
    return cell;
  });
}
