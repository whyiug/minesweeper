/** Visible information only: the input layer never receives mine locations. */
export interface InputCell {
  cover: 'hidden' | 'flagged' | 'revealed';
  number?: number;
}

export type InputChordMode = 'single' | 'double' | 'auto';
export type InputAction = { type: 'REVEAL' | 'FLAG' | 'CHORD'; index: number };

/** Structurally compatible with PointerEvent, without a dependency on the DOM. */
export interface PointerInput {
  pointerId: number;
  pointerType?: string;
  button?: number;
  buttons?: number;
  clientX?: number;
  clientY?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  isPrimary?: boolean;
  preventDefault?(): void;
}

export interface ClickInput {
  detail?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  preventDefault?(): void;
}

export interface PointerControllerOptions {
  getCell(index: number): InputCell | undefined;
  getChordMode(): InputChordMode;
  getTouchMode(): 'reveal' | 'flag';
  dispatch(action: InputAction): void;
  onPress(index: number | null): void;
  onPreview(index: number | null): void;
  now?: () => number;
}

export const LONG_PRESS_MS = 350;
export const MOVE_TOLERANCE_PX = 10;
export const DOUBLE_CLICK_MS = 350;
const SYNTHETIC_CLICK_GUARD_MS = 500;
const CONTEXT_MENU_GUARD_MS = 1_000;

interface Gesture {
  pointerId: number;
  index: number;
  x: number;
  y: number;
  intent: 'reveal' | 'flag' | 'chord' | 'none';
  chordMode: InputChordMode;
  committed: boolean;
}

/**
 * Integration: cells forward pointerdown/move/up/leave/cancel, contextmenu and
 * click. Forward lostpointercapture to pointerCancel too. A window pointerdown
 * observer calls observePointerDown (including fingers outside the board), and
 * window pointerup/pointercancel observers call observePointerUp. Window scroll
 * (capture), blur and document visibilitychange when hidden call cancel().
 *
 * No pointer capture, touchend handler, preventDefault on touch movement, or
 * touch-action:none is needed. Browser scrolling and pinch zoom remain usable.
 * Only pointerup commits ordinary pointer gestures. The long-press timer is the
 * one intentional early commit; it marks its gesture consumed before dispatch.
 */
export function createPointerController(options: PointerControllerOptions) {
  const now = options.now ?? Date.now;
  let gesture: Gesture | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let previousClick: { index: number; at: number } | null = null;
  let recentContext: { index: number; until: number } | null = null;
  let suppressSyntheticClickUntil = -Infinity;
  const touches = new Set<number>();
  let multiTouchBlocked = false;
  let destroyed = false;

  function clearTimer() {
    if (longPressTimer !== undefined) clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }

  function clearVisuals() {
    options.onPress(null);
    options.onPreview(null);
  }

  function clearGesture(clearDouble = true) {
    if (gesture && clearDouble) {
      recentContext = { index: gesture.index, until: now() + CONTEXT_MENU_GUARD_MS };
    }
    clearTimer();
    gesture = null;
    if (clearDouble) previousClick = null;
    clearVisuals();
  }

  function guardSyntheticClick() {
    suppressSyntheticClickUntil = now() + SYNTHETIC_CLICK_GUARD_MS;
  }

  function observePointerDown(event: PointerInput) {
    if (destroyed || event.pointerType !== 'touch') return;
    touches.add(event.pointerId);
    if (touches.size > 1 || event.isPrimary === false) {
      multiTouchBlocked = true;
      guardSyntheticClick();
      clearGesture();
    }
  }

  function releaseTouch(event: Pick<PointerInput, 'pointerId'>) {
    touches.delete(event.pointerId);
    if (touches.size === 0) multiTouchBlocked = false;
  }

  function observePointerUp(event: Pick<PointerInput, 'pointerId'>) {
    releaseTouch(event);
    // Attach this observer in bubble phase. A cell's pointerUp has already
    // committed; an outstanding gesture here was released outside the board.
    if (gesture?.pointerId === event.pointerId) {
      guardSyntheticClick();
      clearGesture();
    }
  }

  function pointerDown(index: number, event: PointerInput) {
    if (destroyed) return;
    observePointerDown(event);
    guardSyntheticClick();
    if (multiTouchBlocked) return;
    if (gesture) {
      // A second simultaneous pointer must never replace an in-flight gesture.
      if (gesture.pointerId !== event.pointerId) clearGesture();
      return;
    }
    if (event.button !== undefined && event.button !== 0 && event.button !== 2) return;
    const cell = options.getCell(index);
    if (!cell) return;
    // A new real gesture establishes a new context-menu identity, even when
    // two legitimate right clicks occur within the deduplication time window.
    recentContext = null;
    const touch = event.pointerType === 'touch';
    const modifierFlag = event.button === 2 || event.ctrlKey || event.shiftKey;
    const chordMode = options.getChordMode();
    let intent: Gesture['intent'] = 'none';
    if (modifierFlag) {
      if (cell.cover !== 'revealed') intent = 'flag';
    } else if (cell.cover === 'revealed') {
      if ((cell.number ?? 0) > 0 && chordMode !== 'auto') intent = 'chord';
    } else if (touch && options.getTouchMode() === 'flag') {
      intent = 'flag';
    } else if (cell.cover === 'hidden') {
      intent = 'reveal';
    }
    if (intent !== 'chord' || chordMode !== 'double') previousClick = null;
    gesture = {
      pointerId: event.pointerId,
      index,
      x: event.clientX ?? 0,
      y: event.clientY ?? 0,
      intent,
      chordMode,
      committed: false,
    };
    options.onPress(index);
    options.onPreview(intent === 'chord' ? index : null);

    if (touch && cell.cover !== 'revealed') {
      const pending = gesture;
      longPressTimer = setTimeout(() => {
        longPressTimer = undefined;
        if (destroyed || gesture !== pending || pending.committed || multiTouchBlocked) return;
        // Mark consumed before a synchronous React/core callback can reenter.
        pending.committed = true;
        previousClick = null;
        guardSyntheticClick();
        recentContext = { index, until: now() + CONTEXT_MENU_GUARD_MS };
        clearVisuals();
        const current = options.getCell(index);
        if (current && current.cover !== 'revealed') {
          options.dispatch({ type: 'FLAG', index });
        }
      }, LONG_PRESS_MS);
    }
  }

  function pointerMove(event: PointerInput) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot((event.clientX ?? 0) - gesture.x, (event.clientY ?? 0) - gesture.y);
    if (distance > MOVE_TOLERANCE_PX) {
      guardSyntheticClick();
      clearGesture();
    }
  }

  function pointerUp(index: number, event: PointerInput) {
    const pending = gesture;
    releaseTouch(event);
    if (destroyed || !pending || pending.pointerId !== event.pointerId) return;
    guardSyntheticClick();
    // Some browsers coalesce the last move; check release coordinates too.
    const distance = Math.hypot((event.clientX ?? pending.x) - pending.x, (event.clientY ?? pending.y) - pending.y);
    clearGesture(false);
    if (index !== pending.index || distance > MOVE_TOLERANCE_PX) {
      previousClick = null;
      return;
    }
    if (pending.committed) return;
    const cell = options.getCell(index);
    if (!cell) return;
    if (pending.intent === 'flag') {
      recentContext = { index, until: now() + CONTEXT_MENU_GUARD_MS };
      if (cell.cover !== 'revealed') options.dispatch({ type: 'FLAG', index });
    } else if (pending.intent === 'reveal') {
      if (cell.cover === 'hidden') options.dispatch({ type: 'REVEAL', index });
    } else if (pending.intent === 'chord' && cell.cover === 'revealed' && (cell.number ?? 0) > 0) {
      if (pending.chordMode === 'double') {
        const at = now();
        if (previousClick?.index === index && at - previousClick.at >= 0 && at - previousClick.at <= DOUBLE_CLICK_MS) {
          previousClick = null;
          options.dispatch({ type: 'CHORD', index });
        } else {
          previousClick = { index, at };
        }
      } else if (pending.chordMode === 'single') {
        options.dispatch({ type: 'CHORD', index });
      }
    }
  }

  function pointerCancel(event?: Pick<PointerInput, 'pointerId'>) {
    const hadPointer = gesture !== null || touches.size > 0 || multiTouchBlocked;
    if (event) observePointerUp(event);
    if (!event || !gesture || gesture.pointerId === event.pointerId) {
      if (hadPointer) guardSyntheticClick();
      clearGesture();
    }
  }

  function pointerLeave(event?: Pick<PointerInput, 'pointerId'>) {
    if (!event || gesture?.pointerId === event.pointerId) {
      if (gesture) guardSyntheticClick();
      clearGesture();
    }
  }

  function contextMenu(index: number, event: ClickInput) {
    event.preventDefault?.();
    if (destroyed) return;
    guardSyntheticClick();
    if (multiTouchBlocked) return;
    if (gesture?.index === index) {
      if (gesture.committed) return;
      // macOS can deliver contextmenu before pointerup, and ctrlKey may only
      // be present on pointerdown. The contextmenu itself is enough evidence.
      gesture.intent = options.getCell(index)?.cover === 'revealed' ? 'none' : 'flag';
      previousClick = null;
      options.onPreview(null);
      return;
    }
    if (recentContext?.index === index && now() <= recentContext.until) {
      recentContext = null;
      return;
    }
    // Also supports OS/assistive-tech context menus with no pointer sequence.
    previousClick = null;
    const cell = options.getCell(index);
    if (cell && cell.cover !== 'revealed') options.dispatch({ type: 'FLAG', index });
  }

  function click(index: number, event: ClickInput) {
    if (destroyed || event.detail !== 0 || gesture || now() < suppressSyntheticClickUntil) return;
    const cell = options.getCell(index);
    if (!cell) return;
    event.preventDefault?.();
    previousClick = null;
    if (event.shiftKey || event.ctrlKey) {
      if (cell.cover !== 'revealed') options.dispatch({ type: 'FLAG', index });
    } else if (cell.cover === 'hidden') {
      options.dispatch({ type: 'REVEAL', index });
    } else if (cell.cover === 'revealed' && (cell.number ?? 0) > 0 && options.getChordMode() !== 'auto') {
      // Screen-reader activation is explicit; never impose double-click timing.
      options.dispatch({ type: 'CHORD', index });
    }
  }

  function cancel() {
    // Mount, reset and focus-induced scrolling also call cancel(). Without a
    // pending pointer there is no ghost click to suppress: preserve immediate
    // keyboard/screen-reader activation. An existing real-pointer guard stays.
    if (gesture || touches.size > 0 || multiTouchBlocked) guardSyntheticClick();
    clearGesture();
    touches.clear();
    multiTouchBlocked = false;
  }

  function destroy() {
    cancel();
    destroyed = true;
  }

  return { pointerDown, pointerMove, pointerUp, pointerCancel, pointerLeave, contextMenu, click, observePointerDown, observePointerUp, cancel, destroy };
}
