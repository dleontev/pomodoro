// AI-assisted code with OpenAI Codex.
// Purpose: Keep brief, user-enabled session sounds independent of ambient audio.
// Prepared for review by: Dimitriy Leontev
// Generated: 2026-10-19
export const NOTIFICATION_SOUNDS = Object.freeze({
  chime: 'Soft Chime', bell: 'Bell', digital: 'Digital Tone', wood: 'Wooden Chime', melody: 'Ascending Melody'
});
export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({ sound: 'off', volume: 40, muted: false });
const storageKey = 'pomodoro.notification-sound.v1';

function normalizeSettings(values) {
  return {
    sound: Object.hasOwn(NOTIFICATION_SOUNDS, values?.sound) ? values.sound : 'off',
    volume: Number.isFinite(values?.volume) ? Math.round(Math.min(100, Math.max(0, values.volume))) : 40,
    muted: values?.muted === true
  };
}

export function loadNotificationSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(storageKey))); }
  catch { return { ...DEFAULT_NOTIFICATION_SETTINGS }; }
}

export function saveNotificationSettings(storage, values) {
  try { storage.setItem(storageKey, JSON.stringify(normalizeSettings(values))); return true; }
  catch { return false; }
}

// Frequency, start offset, length, peak gain, waveform. All effects finish in 1.3 seconds.
const notes = {
  chime: [[880, 0, 1.1, 0.22, 'sine']],
  bell: [[784, 0, 1.25, 0.18, 'sine'], [1568, 0, 0.7, 0.055, 'sine'], [2352, 0, 0.35, 0.02, 'sine']],
  digital: [[660, 0, 0.16, 0.15, 'triangle'], [880, 0.23, 0.18, 0.15, 'triangle']],
  wood: [[523, 0, 0.19, 0.26, 'sine'], [1046, 0, 0.08, 0.07, 'sine']],
  melody: [[523.25, 0, 0.3, 0.16, 'sine'], [659.25, 0.18, 0.3, 0.16, 'sine'], [783.99, 0.36, 0.45, 0.16, 'sine']]
};

export class NotificationAudio {
  constructor({ createContext } = {}) {
    this.createContext = createContext || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is unavailable');
      return new Context({ latencyHint: 'playback' });
    });
    this.context = null;
    this.master = null;
    this.volume = 0.4;
    this.voices = new Set();
    this.revision = 0;
  }

  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    this.master?.gain.setTargetAtTime(this.volume ** 2, this.context.currentTime, 0.015);
    if (this.volume === 0) this.stop();
  }

  // Only call directly from Start, Resume, or Preview: never from a completion callback.
  async unlock() {
    if (!this.context || this.context.state === 'closed') {
      this.context = this.createContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume ** 2;
      this.master.connect(this.context.destination);
      this.context.onstatechange = () => {
        if (this.context.state !== 'running') this.stop();
      };
    }
    if (this.context.state !== 'running') await this.context.resume();
    return this.context.state === 'running';
  }

  async play(sound, { userGesture = false } = {}) {
    this.stop();
    const revision = this.revision;
    if (sound === 'off' || this.volume === 0) return false;
    if (!Object.hasOwn(NOTIFICATION_SOUNDS, sound)) throw new RangeError('Unknown notification sound');
    if (userGesture) {
      try { await this.unlock(); }
      catch (error) { if (revision === this.revision) throw error; return false; }
    }
    // Restricted or suspended contexts drop the sound; nothing is queued for later.
    if (revision !== this.revision || this.volume === 0 || this.context?.state !== 'running') return false;
    const now = this.context.currentTime;
    for (const [frequency, offset, duration, peak, waveform] of notes[sound]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + offset;
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      const voice = { oscillator, gain };
      this.voices.add(voice);
      oscillator.onended = () => {
        oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice);
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
    return true;
  }

  stop() {
    this.revision += 1;
    for (const { oscillator, gain } of this.voices) {
      const now = this.context.currentTime;
      if (this.context.state !== 'running') {
        oscillator.stop(now);
        oscillator.disconnect(); gain.disconnect();
        continue;
      }
      if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(now);
      else {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
      }
      gain.gain.linearRampToValueAtTime(0, now + 0.015);
      oscillator.stop(now + 0.02);
    }
    this.voices.clear();
  }
}
