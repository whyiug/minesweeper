import { neighbors } from './neighbors';
import type { BoardTruth, GameConfig } from './types';

export function validateConfig(config: GameConfig): void {
  const { rows, cols, mineCount, chordMode, difficulty } = config;
  if (
    !Number.isSafeInteger(rows) || rows < 1 ||
    !Number.isSafeInteger(cols) || cols < 1 ||
    !Number.isSafeInteger(rows * cols)
  ) throw new Error('棋盘行列必须为正整数。');
  const maxMines = rows * cols - Math.min(rows, 3) * Math.min(cols, 3);
  if (!Number.isSafeInteger(mineCount) || mineCount < 0 || mineCount > maxMines) {
    throw new Error(`地雷数必须为 0 至 ${maxMines}，以保护首点及其邻格。`);
  }
  if (!['single', 'double', 'auto'].includes(chordMode)) throw new Error('无效的连开方式。');
  if (!['intro', 'beginner', 'intermediate', 'expert'].includes(difficulty)) {
    throw new Error('无效的难度。');
  }
}

/** Partial Fisher–Yates: uniform sampling without replacement, independent of flags. */
export function generateTruth(config: GameConfig, first: number, random: () => number): BoardTruth {
  validateConfig(config);
  const { rows, cols, mineCount } = config;
  if (!Number.isInteger(first) || first < 0 || first >= rows * cols) throw new Error('无效的首点。');
  const protectedCells = new Set([first, ...neighbors(first, rows, cols)]);
  const candidates = Array.from({ length: rows * cols }, (_, i) => i)
    .filter((i) => !protectedCells.has(i));
  const mines = Array<boolean>(rows * cols).fill(false);
  for (let i = 0; i < mineCount; i++) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('随机源必须返回 [0, 1) 内的有限数值。');
    }
    const pick = i + Math.floor(value * (candidates.length - i));
    [candidates[i], candidates[pick]] = [candidates[pick], candidates[i]];
    mines[candidates[i]] = true;
  }
  const counts = mines.map((_, i) => neighbors(i, rows, cols).filter((n) => mines[n]).length);
  return { mines, counts };
}

/** Reproducible local tests; production chooses and injects its own random source. */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
