import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPointerController, DOUBLE_CLICK_MS, LONG_PRESS_MS,
  type InputCell, type InputChordMode, type PointerInput,
} from '../../src/input/pointer-controller';
import { createKeyboardController } from '../../src/input/keyboard-controller';

const mouse = (extra: Partial<PointerInput> = {}): PointerInput => ({
  pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, ...extra,
});
const touch = (extra: Partial<PointerInput> = {}): PointerInput => mouse({ pointerType: 'touch', isPrimary: true, ...extra });

function harness(initialMode: InputChordMode = 'single') {
  const cells = new Map<number, InputCell>();
  let chordMode = initialMode;
  let touchMode: 'reveal' | 'flag' = 'reveal';
  const dispatch = vi.fn();
  const onPress = vi.fn();
  const onPreview = vi.fn();
  const getCell = (index: number) => index >= 0 && index < 81 ? cells.get(index) ?? { cover: 'hidden' as const } : undefined;
  const pointer = createPointerController({
    getCell, getChordMode: () => chordMode, getTouchMode: () => touchMode,
    dispatch, onPress, onPreview,
  });
  function tap(index = 0, event = mouse()) {
    pointer.pointerDown(index, event);
    pointer.pointerUp(index, event);
  }
  return {
    pointer, cells, dispatch, onPress, onPreview, tap, getCell,
    setChordMode(mode: InputChordMode) { chordMode = mode; },
    setTouchMode(mode: 'reveal' | 'flag') { touchMode = mode; },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('pointer transaction routing', () => {
  it('shows immediate press feedback but submits exactly once on release', () => {
    const h = harness();
    h.pointer.pointerDown(3, mouse());
    expect(h.onPress).toHaveBeenLastCalledWith(3);
    expect(h.dispatch).not.toHaveBeenCalled();
    h.pointer.pointerUp(3, mouse());
    h.pointer.click(3, { detail: 1 });
    h.pointer.click(3, { detail: 0 });
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 3 }]]);
    expect(h.onPress).toHaveBeenLastCalledWith(null);
  });

  it('does not reveal flags or submit unsupported mouse buttons', () => {
    const h = harness();
    h.cells.set(0, { cover: 'flagged' });
    h.tap(0);
    h.tap(1, mouse({ button: 1 }));
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it.each([{ shiftKey: true }, { ctrlKey: true }, { button: 2 }])('routes flag input %j without a reveal', (modifier) => {
    const h = harness();
    h.tap(4, mouse(modifier));
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 4 }]]);
  });

  it('deduplicates right pointerup followed by contextmenu and click', () => {
    const h = harness();
    const preventDefault = vi.fn();
    h.tap(4, mouse({ button: 2 }));
    h.pointer.contextMenu(4, { preventDefault });
    h.pointer.click(4, { detail: 1 });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 4 }]]);
  });

  it('defers an early macOS context menu until release and remembers Ctrl from down', () => {
    const h = harness();
    h.pointer.pointerDown(4, mouse({ ctrlKey: true }));
    h.pointer.contextMenu(4, {});
    expect(h.dispatch).not.toHaveBeenCalled();
    h.pointer.pointerUp(4, mouse({ ctrlKey: false }));
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 4 }]]);
  });

  it('accepts contextmenu as a flag signal even if the browser omitted ctrlKey', () => {
    const h = harness();
    h.pointer.pointerDown(0, mouse());
    h.pointer.contextMenu(0, {});
    h.pointer.pointerUp(0, mouse());
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 0 }]]);
  });

  it('supports standalone system/AT contextmenu events', () => {
    const h = harness();
    h.pointer.contextMenu(0, {});
    h.pointer.contextMenu(0, {});
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 0 }], [{ type: 'FLAG', index: 0 }]]);
  });

  it('does not swallow the next real right-click gesture inside the dedupe interval', () => {
    const h = harness();
    h.tap(0, mouse({ button: 2 }));
    h.pointer.contextMenu(0, {});
    h.tap(0, mouse({ button: 2 }));
    h.pointer.contextMenu(0, {});
    expect(h.dispatch).toHaveBeenCalledTimes(2);
  });

  it('does not flag revealed numbers by right click, shift, ctrl or context menu', () => {
    const h = harness();
    h.cells.set(0, { cover: 'revealed', number: 2 });
    h.tap(0, mouse({ button: 2 }));
    h.tap(0, mouse({ shiftKey: true }));
    h.tap(0, mouse({ ctrlKey: true }));
    h.pointer.contextMenu(0, {});
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('previews single chord while held and only commits on matching release', () => {
    const h = harness();
    h.cells.set(0, { cover: 'revealed', number: 2 });
    h.pointer.pointerDown(0, mouse());
    expect(h.onPreview).toHaveBeenLastCalledWith(0);
    expect(h.dispatch).not.toHaveBeenCalled();
    h.pointer.pointerUp(0, mouse());
    expect(h.onPreview).toHaveBeenLastCalledWith(null);
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'CHORD', index: 0 }]]);
  });

  it('does not submit explicit pointer chords in auto mode or on zero cells', () => {
    const h = harness('auto');
    h.cells.set(0, { cover: 'revealed', number: 2 });
    h.tap();
    h.setChordMode('single');
    h.cells.set(0, { cover: 'revealed', number: 0 });
    h.tap();
    expect(h.dispatch).not.toHaveBeenCalled();
  });
});

describe('double-click eligibility', () => {
  it('opens hidden cells immediately and excludes their opening click from a chord pair', () => {
    const h = harness('double');
    h.tap();
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 0 }]]);
    h.cells.set(0, { cover: 'revealed', number: 1 });
    vi.advanceTimersByTime(50);
    h.tap();
    expect(h.dispatch).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(50);
    h.tap();
    expect(h.dispatch.mock.calls[1]).toEqual([{ type: 'CHORD', index: 0 }]);
  });

  it('requires two releases on the same preexisting number within the interval', () => {
    const h = harness('double');
    h.cells.set(0, { cover: 'revealed', number: 1 });
    h.cells.set(1, { cover: 'revealed', number: 1 });
    h.tap(0);
    h.tap(1);
    h.tap(0);
    expect(h.dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOUBLE_CLICK_MS + 1);
    h.tap(0);
    expect(h.dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOUBLE_CLICK_MS);
    h.tap(0);
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'CHORD', index: 0 }]]);
    h.tap(0);
    expect(h.dispatch).toHaveBeenCalledOnce();
  });

  it('cancellation and intervening flag gestures reset the double-click pair', () => {
    const h = harness('double');
    h.cells.set(0, { cover: 'revealed', number: 1 });
    h.tap();
    h.pointer.cancel();
    h.tap();
    expect(h.dispatch).not.toHaveBeenCalled();
    h.tap(1, mouse({ shiftKey: true }));
    h.tap();
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 1 }]]);
  });
});

describe('touch, scrolling and cancellation', () => {
  it('tap-to-flag mode is available without long press', () => {
    const h = harness();
    h.setTouchMode('flag');
    h.tap(3, touch());
    vi.advanceTimersByTime(1_000);
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 3 }]]);
  });

  it('long press flags once at 350ms; release/contextmenu/synthetic clicks never reveal', () => {
    const h = harness();
    h.pointer.pointerDown(3, touch());
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(h.dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 3 }]]);
    h.pointer.contextMenu(3, {});
    h.pointer.pointerUp(3, touch());
    h.pointer.click(3, { detail: 1 });
    h.pointer.click(3, { detail: 0 });
    expect(h.dispatch).toHaveBeenCalledOnce();
    expect(h.onPress).toHaveBeenLastCalledWith(null);
  });

  it('long press can remove a flag in reveal mode', () => {
    const h = harness();
    h.cells.set(3, { cover: 'flagged' });
    h.pointer.pointerDown(3, touch());
    vi.advanceTimersByTime(LONG_PRESS_MS);
    h.pointer.pointerUp(3, touch());
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'FLAG', index: 3 }]]);
  });

  it('uses Euclidean movement tolerance and preserves native browser scrolling', () => {
    const h = harness();
    const preventDefault = vi.fn();
    h.pointer.pointerDown(0, touch({ preventDefault }));
    h.pointer.pointerMove(touch({ clientX: 108, clientY: 108, preventDefault }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    h.pointer.pointerUp(0, touch({ clientX: 108, clientY: 108 }));
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('accepts motion at the 10px boundary', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.pointerMove(touch({ clientX: 110 }));
    h.pointer.pointerUp(0, touch({ clientX: 110 }));
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 0 }]]);
  });

  it('checks final displacement even if the browser skipped pointermove', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.pointerUp(0, touch({ clientY: 125 }));
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'pointerCancel', 'pointerLeave'] as const)('%s cancels the timer, release, synthetic click and delayed context menu', (method) => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer[method]();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    h.pointer.pointerUp(0, touch());
    h.pointer.click(0, { detail: 0 });
    h.pointer.contextMenu(0, {});
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.onPress).toHaveBeenLastCalledWith(null);
    expect(h.onPreview).toHaveBeenLastCalledWith(null);
  });

  it('leaving and reentering a cell does not reactivate the original press', () => {
    const h = harness();
    h.pointer.pointerDown(0, mouse());
    h.pointer.pointerLeave(mouse());
    h.pointer.pointerMove(mouse());
    h.pointer.pointerUp(0, mouse());
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('release on a different cell never reveals or chords either cell', () => {
    const h = harness();
    h.pointer.pointerDown(0, mouse());
    h.pointer.pointerUp(1, mouse());
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('second finger outside the board cancels all uncommitted actions', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.observePointerDown(touch({ pointerId: 2, isPrimary: false }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    h.pointer.pointerUp(0, touch());
    h.pointer.observePointerUp(touch({ pointerId: 2 }));
    expect(h.dispatch).not.toHaveBeenCalled();
    h.tap(1, touch({ pointerId: 3 }));
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 1 }]]);
  });

  it('second finger on the board cannot become a replacement gesture', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.pointerDown(1, touch({ pointerId: 2, isPrimary: false }));
    h.pointer.pointerUp(1, touch({ pointerId: 2 }));
    h.pointer.pointerUp(0, touch());
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('a non-primary touch is rejected even when its first finger began elsewhere', () => {
    const h = harness();
    h.tap(0, touch({ pointerId: 2, isPrimary: false }));
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('a global release outside the board cancels the outstanding long-press timer', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.observePointerUp(touch());
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it('global observers safely coexist with cell handlers without breaking double clicks', () => {
    const h = harness('double');
    h.cells.set(0, { cover: 'revealed', number: 1 });
    for (let i = 0; i < 2; i++) {
      h.pointer.observePointerDown(touch());
      h.pointer.pointerDown(0, touch());
      h.pointer.pointerUp(0, touch());
      h.pointer.observePointerUp(touch());
    }
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'CHORD', index: 0 }]]);
  });

  it('destroy cancels old timers and ignores all subsequent actions', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.destroy();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    h.tap();
    h.pointer.contextMenu(0, {});
    h.pointer.click(0, { detail: 0 });
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('assistive activation and keyboard navigation', () => {
  it.each(['cancel', 'pointerCancel', 'pointerLeave'] as const)('idle %s does not suppress a following assistive activation', (method) => {
    const h = harness();
    h.pointer[method]();
    h.pointer.click(0, { detail: 0 });
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 0 }]]);
  });

  it('idle cleanup preserves a ghost-click guard from a real canceled pointer', () => {
    const h = harness();
    h.pointer.pointerDown(0, touch());
    h.pointer.cancel();
    h.pointer.cancel();
    h.pointer.click(0, { detail: 0 });
    expect(h.dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(501);
    h.pointer.click(0, { detail: 0 });
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 0 }]]);
  });

  it('standalone detail=0 activation works without pointer events in double mode', () => {
    const h = harness('double');
    h.pointer.click(0, { detail: 0 });
    h.cells.set(1, { cover: 'revealed', number: 2 });
    h.pointer.click(1, { detail: 0 });
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'REVEAL', index: 0 }], [{ type: 'CHORD', index: 1 }]]);
  });

  it('pointer click suppression expires and does not permanently disable AT', () => {
    const h = harness();
    h.tap();
    vi.advanceTimersByTime(501);
    h.pointer.click(1, { detail: 0 });
    expect(h.dispatch).toHaveBeenCalledTimes(2);
  });

  function keyboardHarness(mode: InputChordMode = 'double') {
    const h = harness(mode);
    const focus = vi.fn();
    const keyboard = createKeyboardController({ rows: 9, cols: 9, getCell: h.getCell, getChordMode: () => mode, dispatch: h.dispatch, focus });
    return { ...h, keyboard, focus };
  }

  it.each(['Enter', ' ', 'Spacebar'])('%s directly chords a revealed number even in pointer double mode', (key) => {
    const h = keyboardHarness();
    h.cells.set(4, { cover: 'revealed', number: 2 });
    const preventDefault = vi.fn();
    expect(h.keyboard.keyDown(4, { key, preventDefault })).toBe(true);
    expect(h.dispatch.mock.calls).toEqual([[{ type: 'CHORD', index: 4 }]]);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('keyboard reveal and F flags use explicit actions; repeats do not toggle', () => {
    const h = keyboardHarness();
    h.keyboard.keyDown(1, { key: 'Enter' });
    h.keyboard.keyDown(2, { key: 'F' });
    h.keyboard.keyDown(2, { key: 'F', repeat: true });
    h.cells.set(3, { cover: 'flagged' });
    h.keyboard.keyDown(3, { key: ' ' });
    h.keyboard.keyDown(3, { key: 'f' });
    expect(h.dispatch.mock.calls).toEqual([
      [{ type: 'REVEAL', index: 1 }], [{ type: 'FLAG', index: 2 }], [{ type: 'FLAG', index: 3 }],
    ]);
  });

  it('automatic mode leaves chord initiation to the rule transaction', () => {
    const h = keyboardHarness('auto');
    h.cells.set(0, { cover: 'revealed', number: 1 });
    h.keyboard.keyDown(0, { key: 'Enter' });
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'ArrowLeft', 0], [8, 'ArrowRight', 8], [0, 'ArrowUp', 0], [80, 'ArrowDown', 80],
    [10, 'ArrowLeft', 9], [10, 'ArrowRight', 11], [10, 'ArrowUp', 1], [10, 'ArrowDown', 19],
    [13, 'Home', 9], [13, 'End', 17],
  ])('navigates from %i with %s to %i without wrapping rows', (index, key, expected) => {
    const h = keyboardHarness();
    const preventDefault = vi.fn();
    h.keyboard.keyDown(index, { key, preventDefault });
    expect(h.focus).toHaveBeenCalledWith(expected);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(h.dispatch).not.toHaveBeenCalled();
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('does not hijack %s form controls', (tagName) => {
    const h = keyboardHarness();
    const preventDefault = vi.fn();
    const target = { tagName } as unknown as EventTarget;
    expect(h.keyboard.keyDown(0, { key: 'f', target, preventDefault })).toBe(false);
    expect(h.keyboard.keyDown(0, { key: 'ArrowLeft', target, preventDefault })).toBe(false);
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not hijack editable descendants or browser shortcuts', () => {
    const h = keyboardHarness();
    const target = { closest: () => ({}) } as unknown as EventTarget;
    expect(h.keyboard.keyDown(0, { key: 'f', target })).toBe(false);
    expect(h.keyboard.keyDown(0, { key: 'f', ctrlKey: true })).toBe(false);
    expect(h.keyboard.keyDown(0, { key: 'f', metaKey: true })).toBe(false);
    expect(h.keyboard.keyDown(0, { key: 'ArrowLeft', altKey: true })).toBe(false);
    expect(h.keyboard.keyDown(0, { key: 'Tab' })).toBe(false);
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(h.focus).not.toHaveBeenCalled();
  });
});
