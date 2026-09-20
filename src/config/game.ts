import type { ChordMode, Difficulty, GameConfig } from '../core/types';

export type { Difficulty } from '../core/types';

export const DIFFICULTIES: Record<
  Difficulty,
  { name: string; rows: number; cols: number; mineCount: number }
> = {
  intro: { name: '启蒙', rows: 6, cols: 6, mineCount: 4 },
  beginner: { name: '初级', rows: 9, cols: 9, mineCount: 10 },
  intermediate: { name: '中级', rows: 16, cols: 16, mineCount: 40 },
  expert: { name: '高级', rows: 16, cols: 30, mineCount: 99 },
};

/** Parents may change this to 'intro'; settings otherwise reset on every load. */
export const DEFAULT_DIFFICULTY: Difficulty = 'beginner';
export const DEFAULT_CHORD_MODE: ChordMode = 'single';
export const RULES_VERSION = 'modern-v1' as const;

export function getConfig(
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  chordMode: ChordMode = DEFAULT_CHORD_MODE,
): GameConfig {
  const { rows, cols, mineCount } = DIFFICULTIES[difficulty];
  return { difficulty, rows, cols, mineCount, chordMode };
}
