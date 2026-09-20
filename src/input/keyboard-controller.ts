import type { InputAction, InputCell, InputChordMode } from './pointer-controller';

export interface KeyboardInput {
  key: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | null;
  preventDefault?(): void;
}

export interface KeyboardControllerOptions {
  rows: number;
  cols: number;
  getCell(index: number): InputCell | undefined;
  getChordMode(): InputChordMode;
  dispatch(action: InputAction): void;
  /** The board owns roving tabindex and moves actual DOM focus here. */
  focus(index: number): void;
}

function isEditing(target: EventTarget | null | undefined) {
  if (!target || typeof target !== 'object') return false;
  const element = target as EventTarget & {
    tagName?: string;
    isContentEditable?: boolean;
    closest?(selector: string): unknown;
  };
  return /^(INPUT|TEXTAREA|SELECT)$/i.test(element.tagName ?? '') || element.isContentEditable ||
    Boolean(element.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'));
}

/** Bind to grid cells, not a document-global shortcut handler. */
export function createKeyboardController(options: KeyboardControllerOptions) {
  function keyDown(index: number, event: KeyboardInput): boolean {
    if (isEditing(event.target) || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!Number.isInteger(index) || index < 0 || index >= options.rows * options.cols) return false;
    const row = Math.floor(index / options.cols);
    const col = index % options.cols;
    let next: number | undefined;
    switch (event.key) {
      case 'ArrowLeft': next = row * options.cols + Math.max(0, col - 1); break;
      case 'ArrowRight': next = row * options.cols + Math.min(options.cols - 1, col + 1); break;
      case 'ArrowUp': next = Math.max(0, row - 1) * options.cols + col; break;
      case 'ArrowDown': next = Math.min(options.rows - 1, row + 1) * options.cols + col; break;
      case 'Home': next = row * options.cols; break;
      case 'End': next = row * options.cols + options.cols - 1; break;
    }
    if (next !== undefined) {
      event.preventDefault?.();
      options.focus(next);
      return true;
    }
    const isFlag = event.key.toLowerCase() === 'f';
    const isReveal = event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
    if (!isFlag && !isReveal) return false;
    // Prevent native button click as well as page scrolling. A held key may
    // navigate, but must not toggle flags or submit repeated rule actions.
    event.preventDefault?.();
    if (event.repeat) return true;
    const cell = options.getCell(index);
    if (!cell) return true;
    if (isFlag) {
      if (cell.cover !== 'revealed') options.dispatch({ type: 'FLAG', index });
    } else if (cell.cover === 'hidden') {
      options.dispatch({ type: 'REVEAL', index });
    } else if (cell.cover === 'revealed' && (cell.number ?? 0) > 0 && options.getChordMode() !== 'auto') {
      options.dispatch({ type: 'CHORD', index });
    }
    return true;
  }
  return { keyDown };
}
