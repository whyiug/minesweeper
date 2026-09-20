export type SoundType = 'reveal' | 'flag' | 'chord' | 'won' | 'lost';

interface Note {
  frequency: number;
  endFrequency?: number;
  delay: number;
  duration: number;
  waveform: OscillatorType;
}

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

// Original short synthesized cues. One rule transaction requests one cue.
const CUES: Record<SoundType, readonly Note[]> = {
  reveal: [{ frequency: 660, endFrequency: 830, delay: 0, duration: 0.07, waveform: 'sine' }],
  flag: [{ frequency: 420, endFrequency: 580, delay: 0, duration: 0.105, waveform: 'triangle' }],
  chord: [
    { frequency: 520, delay: 0, duration: 0.13, waveform: 'sine' },
    { frequency: 780, delay: 0.035, duration: 0.13, waveform: 'sine' },
  ],
  won: [
    { frequency: 523.25, delay: 0, duration: 0.18, waveform: 'sine' },
    { frequency: 659.25, delay: 0.11, duration: 0.18, waveform: 'sine' },
    { frequency: 783.99, delay: 0.22, duration: 0.26, waveform: 'sine' },
  ],
  lost: [
    { frequency: 330, endFrequency: 260, delay: 0, duration: 0.17, waveform: 'sine' },
    { frequency: 220, endFrequency: 196, delay: 0.10, duration: 0.21, waveform: 'sine' },
  ],
};

const MAX_VOICES = 6;
const PEAK_VOLUME = 0.045;

/** Audio is never initialized by render/gameplay. Call unlock only from a user gesture. */
export function createSoundController() {
  let enabled = false;
  let disposed = false;
  let context: AudioContext | undefined;
  const voices = new Set<Voice>();
  const documentRef = typeof document === 'undefined' ? undefined : document;
  const isHidden = () => documentRef?.visibilityState === 'hidden';

  function disconnect(voice: Voice): void {
    if (!voices.delete(voice)) return;
    voice.oscillator.onended = null;
    try { voice.oscillator.disconnect(); } catch { /* Already disconnected. */ }
    try { voice.gain.disconnect(); } catch { /* Already disconnected. */ }
  }

  function stopVoice(voice: Voice): void {
    try { voice.oscillator.stop(); } catch { /* May have already ended. */ }
    disconnect(voice);
  }

  function stop(): void {
    for (const voice of [...voices]) stopVoice(voice);
  }

  function onVisibilityChange(): void {
    if (isHidden()) stop();
  }
  documentRef?.addEventListener('visibilitychange', onVisibilityChange);

  function note(audio: AudioContext, definition: Note): void {
    while (voices.size >= MAX_VOICES) {
      const oldest = voices.values().next().value;
      if (oldest) stopVoice(oldest);
    }
    let voice: Voice | undefined;
    let oscillator: OscillatorNode | undefined;
    let gain: GainNode | undefined;
    try {
      oscillator = audio.createOscillator();
      gain = audio.createGain();
      voice = { oscillator, gain };
      voices.add(voice);
      const current = voice;
      const start = audio.currentTime + definition.delay;
      const end = start + definition.duration;
      oscillator.type = definition.waveform;
      oscillator.frequency.setValueAtTime(definition.frequency, start);
      if (definition.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(definition.endFrequency, end);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(PEAK_VOLUME, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => disconnect(current);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    } catch {
      if (voice) stopVoice(voice);
      else {
        try { oscillator?.disconnect(); } catch { /* Device is unavailable. */ }
        try { gain?.disconnect(); } catch { /* Device is unavailable. */ }
      }
    }
  }

  return {
    setEnabled(next: boolean): void {
      enabled = next;
      if (!enabled) stop();
    },
    async unlock(): Promise<void> {
      if (!enabled || disposed || isHidden()) return;
      try {
        if (!context) {
          const host = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
          const AudioContextConstructor = host.AudioContext ?? host.webkitAudioContext;
          if (!AudioContextConstructor) return;
          context = new AudioContextConstructor();
        }
        if (context.state === 'suspended') await context.resume();
      } catch {
        // Audio failure never changes the game or queues a replay for later.
      }
    },
    play(type: SoundType): void {
      if (!enabled || disposed || isHidden() || !context || context.state !== 'running') return;
      for (const definition of CUES[type]) note(context, definition);
    },
    stop,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      enabled = false;
      stop();
      documentRef?.removeEventListener('visibilitychange', onVisibilityChange);
      if (context && context.state !== 'closed') {
        try { void context.close().catch(() => undefined); } catch { /* Device is already unavailable. */ }
      }
      context = undefined;
    },
  };
}
