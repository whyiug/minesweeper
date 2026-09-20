import { neighbors } from './neighbors';
import type { GameState } from './types';

/** Mutates only the private draft owned by one reducer transaction. */
export function revealBatch(draft: GameState, targets: number[]): { opened: number[]; hit: number | null } {
  if (!draft.truth) return { opened: [], hit: null };
  const { mines, counts } = draft.truth;
  const roots = [...new Set(targets)].filter((i) => draft.covers[i] === 'hidden').sort((a, b) => a - b);
  // Preflight the complete requested batch before revealing even one safe tile.
  const hit = roots.find((i) => mines[i]);
  if (hit !== undefined) return { opened: [], hit };
  const queue = [...roots];
  const queued = new Set(queue);
  const opened: number[] = [];
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (draft.covers[index] !== 'hidden') continue;
    draft.covers[index] = 'revealed';
    draft.revealedCount++;
    opened.push(index);
    if (counts[index] !== 0) continue;
    for (const next of neighbors(index, draft.config.rows, draft.config.cols)) {
      if (draft.covers[next] === 'hidden' && !queued.has(next)) {
        queued.add(next);
        queue.push(next);
      }
    }
  }
  return { opened, hit: null };
}
