import type { GameEvent } from '../core/types';

/** A presentation-only consumer. Rules have already committed before this runs. */
export function createEffectController(sound: { play(type: GameEvent['type']): void; stop(): void }) {
  let gameId = '';
  let seen = new Set<string>();
  let disposed = false;
  const active = new Map<HTMLElement, Animation>();
  const cancel = () => { for (const animation of active.values()) animation.cancel(); active.clear(); };
  function finishCell(element: HTMLElement | null) { if (element) { active.get(element)?.cancel(); active.delete(element); } }
  return {
    reset(id: string) { if (disposed) return; cancel(); sound.stop(); gameId = id; seen = new Set(); },
    finishCell,
    cancel,
    consume(events: GameEvent[], root: HTMLElement | null, motion: boolean, cols: number) {
      if (disposed) return;
      const fresh = events.filter(event => {
        if (event.gameId !== gameId || seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
      if (!fresh.length || document.hidden) return;
      const feedback = fresh.find(event => event.type === 'lost' || event.type === 'won') ?? fresh.find(event => event.type === 'chord') ?? fresh[0];
      sound.play(feedback.type);
      if (!motion || !root) return;
      for (const event of fresh) {
        for (const index of event.indices) {
          const element = root.querySelector<HTMLElement>(`[data-cell="${index}"]`);
          if (!element || !element.animate) continue;
          finishCell(element);
          const distance = Math.max(Math.abs(index % cols - event.origin % cols), Math.abs(Math.floor(index / cols) - Math.floor(event.origin / cols)));
          const delay = event.type === 'reveal' ? Math.min(distance * 12, 140) : event.type === 'lost' && index !== event.origin ? 80 : 0;
          const animation = element.animate([
            { transform: event.type === 'flag' ? 'scale(.86)' : 'scale(.96)', filter: 'brightness(1.14)' },
            { transform: 'scale(1)', filter: 'brightness(1)' },
          ], { duration: event.type === 'flag' ? 150 : event.type === 'lost' ? 220 : 140, delay, easing: 'ease-out' });
          active.set(element, animation);
          animation.onfinish = () => { if (active.get(element) === animation) active.delete(element); };
        }
      }
    },
    dispose() { if (disposed) return; disposed = true; cancel(); sound.stop(); seen.clear(); },
  };
}
