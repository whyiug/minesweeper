import { chordTargets } from './chord';
import { neighbors } from './neighbors';
import { revealBatch } from './reveal';
import type { GameState } from './types';

/** No React effects: the entire cascade settles inside the initiating action. */
export function autoChord(draft: GameState, changed: number[]): { opened: number[]; hit: number | null } {
  if (!draft.truth) return { opened: [], hit: null };
  const queue: number[] = [];
  const queued = new Set<number>();
  const enqueueAffected = (indices: number[]) => {
    const affected = new Set<number>();
    for (const index of indices) {
      affected.add(index);
      for (const n of neighbors(index, draft.config.rows, draft.config.cols)) affected.add(n);
    }
    for (const index of [...affected].sort((a, b) => a - b)) {
      if (draft.covers[index] === 'revealed' && draft.truth!.counts[index] > 0 && !queued.has(index)) {
        queued.add(index);
        queue.push(index);
      }
    }
  };
  enqueueAffected(changed);
  const opened: number[] = [];
  for (let head = 0; head < queue.length; head++) {
    const targets = chordTargets(draft, queue[head]);
    if (targets.length === 0) continue;
    const batch = revealBatch(draft, targets);
    if (batch.hit !== null) return { opened, hit: batch.hit };
    if (batch.opened.length === 0) continue;
    opened.push(...batch.opened);
    enqueueAffected(batch.opened);
  }
  // Flags are fixed during the queue. An already checked number cannot become
  // newly eligible; revealing only removes targets. A transaction-wide set is safe.
  return { opened, hit: null };
}
