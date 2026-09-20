/** Row-major order is part of the deterministic transaction contract. */
export function neighbors(index: number, rows: number, cols: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= rows * cols) return [];
  const row = Math.floor(index / cols);
  const col = index % cols;
  const result: number[] = [];
  for (let y = Math.max(0, row - 1); y <= Math.min(rows - 1, row + 1); y++) {
    for (let x = Math.max(0, col - 1); x <= Math.min(cols - 1, col + 1); x++) {
      if (y !== row || x !== col) result.push(y * cols + x);
    }
  }
  return result;
}
