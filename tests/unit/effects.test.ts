import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, neighbors, reduceGame } from '../../src/core';
import type { GameEvent, GameState } from '../../src/core';
import { createEffectController } from '../../src/presentation/effect-controller';

class AnimationFixture {
  onfinish: (() => void) | null = null;
  cancel = vi.fn();
}

function stage(size = 16) {
  const animations: AnimationFixture[] = [];
  const elements = Array.from({ length: size }, () => ({
    animate: vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => {
      const animation = new AnimationFixture();
      animations.push(animation);
      return animation;
    }),
  }));
  const querySelector = vi.fn((selector: string) => {
    const index = Number(/^\[data-cell="(\d+)"\]$/.exec(selector)?.[1]);
    return elements[index] ?? null;
  });
  return {
    root: { querySelector } as unknown as HTMLElement,
    elements, animations, querySelector,
  };
}

function event(type: GameEvent['type'], id: string, indices: number[], gameId = 'game', origin = 0): GameEvent {
  return { type, id, indices, gameId, origin };
}

function harness() {
  const sound = { play: vi.fn(), stop: vi.fn() };
  const controller = createEffectController(sound);
  controller.reset('game');
  sound.stop.mockClear();
  const board = stage();
  return { sound, controller, ...board };
}

let documentFixture: { hidden: boolean };
beforeEach(() => {
  documentFixture = { hidden: false };
  vi.stubGlobal('document', documentFixture);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('committed rule-event presentation', () => {
  it('deduplicates event ids both within one batch and across React effect replays', () => {
    const h = harness();
    const reveal = event('reveal', 'game:1:0', [0, 1]);
    h.controller.consume([reveal, reveal], h.root, true, 4);
    h.controller.consume([reveal], h.root, true, 4);
    expect(h.sound.play.mock.calls).toEqual([['reveal']]);
    expect(h.elements[0].animate).toHaveBeenCalledOnce();
    expect(h.elements[1].animate).toHaveBeenCalledOnce();
    expect(h.animations).toHaveLength(2);
  });

  it.each([
    { types: ['flag', 'chord', 'won'] as const, expected: 'won' },
    { types: ['reveal', 'chord', 'lost'] as const, expected: 'lost' },
    { types: ['flag', 'chord'] as const, expected: 'chord' },
    { types: ['reveal'] as const, expected: 'reveal' },
    { types: ['flag'] as const, expected: 'flag' },
  ])('plays exactly one prioritized sound for $types', ({ types, expected }) => {
    const h = harness();
    h.controller.consume(types.map((type, i) => event(type, `game:1:${i}`, [i])), h.root, true, 4);
    expect(h.sound.play.mock.calls).toEqual([[expected]]);
  });

  it('consumes an actual complete automatic-win transaction without deciding rules or delaying victory', () => {
    const h = harness();
    const state: GameState = createGame({ difficulty: 'intro', rows: 4, cols: 4, mineCount: 1, chordMode: 'auto' }, 'game');
    state.truth = {
      mines: Array.from({ length: 16 }, (_, i) => i === 5),
      counts: Array.from({ length: 16 }, (_, i) => neighbors(i, 4, 4).filter((n) => n === 5).length),
    };
    state.covers[0] = 'revealed';
    state.revealedCount = 1;
    state.startedAt = 100;
    state.phase = 'playing';
    const committed = reduceGame(state, { type: 'FLAG', index: 5 }, { now: 800, random: () => 0 });
    const snapshot = structuredClone(committed);
    expect(committed.phase).toBe('won');
    expect(committed.events.map((item) => item.type)).toEqual(['flag', 'chord', 'won']);
    h.controller.consume(committed.events, h.root, true, 4);
    expect(h.sound.play.mock.calls).toEqual([['won']]);
    expect(h.animations).toHaveLength(15);
    expect(committed).toEqual(snapshot);
    expect(committed.endedAt).toBe(800);
    expect(reduceGame(committed, { type: 'FLAG', index: 7 }, { now: 801, random: () => 0 })).toBe(committed);
  });

  it('resets old animations and sound before a new game and rejects its late events', () => {
    const h = harness();
    h.controller.consume([event('reveal', 'game:1:0', [0, 1, 2])], h.root, true, 4);
    const old = [...h.animations];
    h.controller.reset('next');
    expect(old.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    expect(h.sound.stop).toHaveBeenCalledOnce();
    h.sound.play.mockClear();
    h.controller.consume([event('lost', 'game:2:0', [5])], h.root, true, 4);
    expect(h.sound.play).not.toHaveBeenCalled();
    expect(h.animations).toHaveLength(3);
    h.controller.consume([event('flag', 'next:1:0', [0], 'next')], h.root, true, 4);
    expect(h.sound.play.mock.calls).toEqual([['flag']]);
    // A browser may deliver an old callback after replacement. It cannot remove
    // the next game's animation from the controller's active map.
    old[0].onfinish?.();
    h.controller.cancel();
    expect(h.animations[3].cancel).toHaveBeenCalledOnce();
  });

  it('finishes decoration on a pressed cell immediately and permits a replacement animation', () => {
    const h = harness();
    h.controller.consume([event('flag', 'game:1:0', [3])], h.root, true, 4);
    const first = h.animations[0];
    h.controller.finishCell(h.elements[3] as unknown as HTMLElement);
    expect(first.cancel).toHaveBeenCalledOnce();
    h.controller.finishCell(h.elements[3] as unknown as HTMLElement);
    h.controller.finishCell(null);
    expect(first.cancel).toHaveBeenCalledOnce();
    h.controller.consume([event('flag', 'game:2:0', [3])], h.root, true, 4);
    expect(h.animations).toHaveLength(2);
    first.onfinish?.();
    h.controller.cancel();
    expect(h.animations[1].cancel).toHaveBeenCalledOnce();
  });

  it('bounds live per-cell animation during 100 rapid flag toggles and releases finished handles', () => {
    const h = harness();
    for (let i = 0; i < 100; i++) {
      h.controller.consume([event('flag', `game:${i}:0`, [2])], h.root, true, 4);
    }
    expect(h.animations.filter((animation) => animation.cancel.mock.calls.length === 0)).toHaveLength(1);
    h.animations[99].onfinish?.();
    h.controller.cancel();
    expect(h.animations[99].cancel).not.toHaveBeenCalled();
    expect(h.animations.slice(0, 99).every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  });

  it('drops background events permanently instead of replaying a burst on return', () => {
    const h = harness();
    const background = Array.from({ length: 20 }, (_, i) => event('flag', `game:${i}:0`, [i % 16]));
    documentFixture.hidden = true;
    h.controller.consume(background, h.root, true, 4);
    expect(h.sound.play).not.toHaveBeenCalled();
    expect(h.animations).toHaveLength(0);
    documentFixture.hidden = false;
    h.controller.consume(background, h.root, true, 4);
    expect(h.sound.play).not.toHaveBeenCalled();
    expect(h.animations).toHaveLength(0);
    h.controller.consume([event('flag', 'game:21:0', [0])], h.root, true, 4);
    expect(h.sound.play.mock.calls).toEqual([['flag']]);
  });

  it('spreads a 480-cell reveal by distance with every decoration complete within 300ms', () => {
    const h = harness();
    const board = stage(480);
    h.controller.consume([event('reveal', 'game:1:0', Array.from({ length: 480 }, (_, i) => i))], board.root, true, 30);
    expect(h.sound.play).toHaveBeenCalledOnce();
    expect(board.animations).toHaveLength(480);
    const timings = board.elements.map((element) => element.animate.mock.calls[0][1]);
    expect(timings[0].delay).toBe(0);
    expect(Number(timings[1].delay)).toBeGreaterThan(0);
    expect(timings.every((timing) => Number(timing.delay) + Number(timing.duration) <= 300)).toBe(true);
    expect(timings.every((timing) => Number(timing.duration) >= 100 && Number(timing.duration) <= 160)).toBe(true);
  });

  it('does not animate under reduced motion and never replays skipped events when motion is enabled', () => {
    const h = harness();
    const events = [event('reveal', 'game:1:0', [0, 1, 2])];
    h.controller.consume(events, h.root, false, 4);
    expect(h.animations).toHaveLength(0);
    expect(h.querySelector).not.toHaveBeenCalled();
    expect(h.sound.play.mock.calls).toEqual([['reveal']]);
    h.controller.consume(events, h.root, true, 4);
    expect(h.animations).toHaveLength(0);
    expect(h.sound.play).toHaveBeenCalledOnce();
  });

  it('works with missing nodes, absent Web Animations support and an unmounted root', () => {
    const h = harness();
    h.controller.consume([event('flag', 'game:1:0', [100])], h.root, true, 4);
    const noAnimationApi = { querySelector: () => ({}) } as unknown as HTMLElement;
    expect(() => h.controller.consume([event('flag', 'game:2:0', [0])], noAnimationApi, true, 4)).not.toThrow();
    expect(() => h.controller.consume([event('flag', 'game:3:0', [0])], null, true, 4)).not.toThrow();
    expect(h.sound.play).toHaveBeenCalledTimes(3);
    expect(h.animations).toHaveLength(0);
  });

  it('disposes once, stops feedback and ignores late consumers or resets', () => {
    const h = harness();
    h.controller.consume([event('reveal', 'game:1:0', [0, 1])], h.root, true, 4);
    h.controller.dispose();
    h.controller.dispose();
    expect(h.animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    expect(h.sound.stop).toHaveBeenCalledOnce();
    h.sound.play.mockClear();
    h.controller.reset('next');
    h.controller.consume([event('reveal', 'next:1:0', [3], 'next')], h.root, true, 4);
    expect(h.sound.play).not.toHaveBeenCalled();
    expect(h.animations).toHaveLength(2);
  });
});
