import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoundController, type SoundType } from '../../src/presentation/sound-controller';

class FakeParameter {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}

class FakeOscillator {
  type = 'sine';
  frequency = new FakeParameter();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeParameter();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 12;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  createOscillator = vi.fn(() => {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  });
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  });
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}

class FakeDocument extends EventTarget {
  visibilityState = 'visible';
  setVisibility(state: 'visible' | 'hidden') {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

let context: FakeContext;
let documentFixture: FakeDocument;
let construct: ReturnType<typeof vi.fn>;
const controllers: ReturnType<typeof createSoundController>[] = [];

function controller() {
  const result = createSoundController();
  controllers.push(result);
  return result;
}

beforeEach(() => {
  context = new FakeContext();
  documentFixture = new FakeDocument();
  construct = vi.fn(function AudioContextMock() { return context; });
  vi.stubGlobal('AudioContext', construct);
  vi.stubGlobal('webkitAudioContext', undefined);
  vi.stubGlobal('document', documentFixture);
});

afterEach(() => {
  for (const item of controllers.splice(0)) item.dispose();
  vi.unstubAllGlobals();
});

describe('original sound feedback lifecycle', () => {
  it('is muted by default and creates audio only when explicitly enabled and unlocked', async () => {
    const audio = controller();
    audio.play('won');
    await audio.unlock();
    audio.setEnabled(true);
    audio.play('reveal');
    expect(construct).not.toHaveBeenCalled();
    await audio.unlock();
    expect(construct).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).not.toHaveBeenCalled();
    audio.play('reveal');
    expect(context.oscillators).toHaveLength(1);
  });

  it('has distinct short feedback for all five rule event types', async () => {
    const audio = controller();
    audio.setEnabled(true);
    await audio.unlock();
    const signatures = new Set<string>();
    for (const type of ['reveal', 'flag', 'chord', 'won', 'lost'] as SoundType[]) {
      const previous = context.oscillators.length;
      audio.play(type);
      const notes = context.oscillators.slice(previous);
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.length).toBeLessThanOrEqual(3);
      signatures.add(JSON.stringify(notes.map((note) => [note.type, note.frequency.setValueAtTime.mock.calls[0]])));
      for (const note of notes) {
        expect(note.start.mock.calls[0][0]).toBeGreaterThanOrEqual(context.currentTime);
        expect(note.stop.mock.calls[0][0] - context.currentTime).toBeLessThan(0.6);
      }
      audio.stop();
    }
    expect(signatures.size).toBe(5);
    for (const gain of context.gains) {
      expect(gain.gain.linearRampToValueAtTime.mock.calls[0][0]).toBeLessThanOrEqual(0.05);
    }
  });

  it('bounds voices during rapid gestures and releases finished nodes', async () => {
    const audio = controller();
    audio.setEnabled(true);
    await audio.unlock();
    for (let i = 0; i < 100; i++) audio.play('chord');
    const active = context.oscillators.filter((note) => note.disconnect.mock.calls.length === 0);
    expect(active.length).toBeLessThanOrEqual(6);
    expect(context.oscillators[0].stop).toHaveBeenCalledTimes(2);
    for (const note of active) note.onended?.();
    expect(context.oscillators.every((note) => note.disconnect.mock.calls.length > 0)).toBe(true);
    expect(context.gains.every((gain) => gain.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it('stops scheduled victory notes when hidden and never accumulates a background replay', async () => {
    const audio = controller();
    audio.setEnabled(true);
    await audio.unlock();
    audio.play('won');
    documentFixture.setVisibility('hidden');
    expect(context.oscillators.every((note) => note.stop.mock.calls.length === 2)).toBe(true);
    for (let i = 0; i < 20; i++) audio.play('flag');
    expect(context.oscillators).toHaveLength(3);
    documentFixture.setVisibility('visible');
    expect(context.oscillators).toHaveLength(3);
    audio.play('flag');
    expect(context.oscillators).toHaveLength(4);
  });

  it('drops sound while context is suspended; only a subsequent unlock can resume it', async () => {
    context.state = 'suspended';
    const audio = controller();
    audio.setEnabled(true);
    context.resume.mockRejectedValueOnce(new Error('User activation required'));
    await expect(audio.unlock()).resolves.toBeUndefined();
    audio.play('won');
    audio.play('lost');
    expect(context.oscillators).toHaveLength(0);
    expect(context.resume).toHaveBeenCalledTimes(1);
    await audio.unlock();
    expect(context.oscillators).toHaveLength(0);
    audio.play('reveal');
    expect(context.oscillators).toHaveLength(1);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('immediately silences mute, explicit new-game stop and disposal', async () => {
    const audio = controller();
    audio.setEnabled(true);
    await audio.unlock();
    audio.play('won');
    audio.stop();
    expect(context.oscillators.every((note) => note.disconnect.mock.calls.length > 0)).toBe(true);
    audio.play('chord');
    audio.setEnabled(false);
    expect(context.oscillators.every((note) => note.disconnect.mock.calls.length > 0)).toBe(true);
    const count = context.oscillators.length;
    audio.play('flag');
    expect(context.oscillators).toHaveLength(count);
    audio.setEnabled(true);
    audio.play('reveal');
    audio.dispose();
    audio.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    audio.setEnabled(true);
    await audio.unlock();
    audio.play('won');
    expect(context.oscillators).toHaveLength(count + 1);
    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('survives unavailable API, constructor, resume, and node creation failures', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const unavailable = controller();
    unavailable.setEnabled(true);
    await expect(unavailable.unlock()).resolves.toBeUndefined();
    expect(() => unavailable.play('flag')).not.toThrow();
    vi.stubGlobal('AudioContext', vi.fn(function BrokenContext() { throw new Error('No device'); }));
    const failed = controller();
    failed.setEnabled(true);
    await expect(failed.unlock()).resolves.toBeUndefined();
    vi.stubGlobal('AudioContext', construct);
    const brokenNode = controller();
    brokenNode.setEnabled(true);
    await brokenNode.unlock();
    context.createGain.mockImplementation(() => { throw new Error('Disconnected device'); });
    expect(() => brokenNode.play('reveal')).not.toThrow();
    expect(context.oscillators[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not create audio from a hidden-page unlock', async () => {
    documentFixture.setVisibility('hidden');
    const audio = controller();
    audio.setEnabled(true);
    await audio.unlock();
    expect(construct).not.toHaveBeenCalled();
  });
});
