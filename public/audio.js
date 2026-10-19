// AI-assisted implementation with OpenAI Codex, 2026-10-18.
// Uses browser-native Web Audio; no recordings, downloads, or audio dependencies.
export const SOUNDS = Object.freeze({
  rain: 'Rain',
  ocean: 'Ocean',
  white: 'White noise',
  pink: 'Pink noise',
  brown: 'Brown noise'
});

export function createNoiseSamples(sound, sampleRate, seconds = 8, random = Math.random) {
  if (!Object.hasOwn(SOUNDS, sound)) throw new RangeError('Unknown ambient sound');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isFinite(seconds) || seconds < 1 || seconds > 30) {
    throw new RangeError('Invalid audio sample rate or duration');
  }
  const length = Math.floor(sampleRate * seconds);
  const overlap = Math.floor(sampleRate / 4);
  const raw = new Float32Array(length + overlap);
  const rows = Array.from({ length: 12 }, () => random() * 2 - 1);
  let rowSum = rows.reduce((sum, value) => sum + value, 0);
  let brown = 0;
  const brownStep = 1 - Math.exp(-2 * Math.PI * 20 / sampleRate);
  let droplet = 0;
  const decay = Math.exp(-1 / (sampleRate * 0.003));

  for (let index = 0; index < raw.length; index += 1) {
    const white = random() * 2 - 1;
    let value = white;
    if (sound === 'pink' || sound === 'ocean') {
      // Voss-style octave-rate random rows produce a softer, pink spectrum.
      const row = Math.min(11, 31 - Math.clz32((index + 1) & -(index + 1)));
      rowSum -= rows[row];
      rows[row] = random() * 2 - 1;
      rowSum += rows[row];
      value = (rowSum + white) / 5;
    }
    if (sound === 'brown') {
      brown += (white - brown) * brownStep;
      value = brown * 10;
    } else if (sound === 'rain') {
      droplet *= decay;
      if (random() < 90 / sampleRate) droplet = random() * 0.5;
      value = white * (0.65 + droplet);
    } else if (sound === 'ocean') {
      const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * index / length);
      value *= 0.2 + 0.8 * swell * swell;
    }
    raw[index] = value;
  }

  const samples = raw.slice(overlap);
  // Crossfade the end into the preceding head, keeping the loop boundary smooth.
  for (let index = 0; index < overlap; index += 1) {
    const position = length - overlap + index;
    const angle = index / (overlap - 1) * Math.PI / 2;
    samples[position] = raw[position + overlap] * Math.cos(angle) + raw[index] * Math.sin(angle);
  }
  let mean = 0;
  for (const value of samples) mean += value / length;
  let energy = 0;
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    samples[index] -= mean;
    energy += samples[index] ** 2;
    peak = Math.max(peak, Math.abs(samples[index]));
  }
  const gain = Math.min(0.18 / (Math.sqrt(energy / length) || 1), 0.85 / (peak || 1));
  for (let index = 0; index < length; index += 1) samples[index] *= gain;
  return samples;
}

export class AmbientAudio {
  constructor({ createContext, now = Date.now, onChange = () => {} } = {}) {
    this.createContext = createContext || (() => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('Web Audio is unavailable');
      return new Context({ latencyHint: 'playback' });
    });
    this.now = now;
    this.onChange = onChange;
    this.context = null;
    this.master = null;
    this.active = null;
    this.buffers = new Map();
    this.volume = 0.3;
    this.revision = 0;
  }

  get isPlaying() {
    return Boolean(this.active && this.context.state === 'running' && this.active.endTime > this.context.currentTime);
  }

  setVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.min(1, Math.max(0, volume));
    // Squared volume makes the quiet end of the slider easier to adjust.
    this.master?.gain.setTargetAtTime(this.volume ** 2, this.context.currentTime, 0.025);
  }

  async play(sound, deadline) {
    if (!Object.hasOwn(SOUNDS, sound)) throw new RangeError('Unknown ambient sound');
    if (!Number.isFinite(deadline) || deadline <= this.now()) { this.stop(); return; }
    if (this.active?.sound === sound && this.active.deadline === deadline && this.isPlaying) return;
    const revision = ++this.revision;
    this.stopVoice();
    if (!this.context || this.context.state === 'closed') {
      this.context = this.createContext();
      this.buffers.clear();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume ** 2;
      this.master.connect(this.context.destination);
      this.context.onstatechange = () => this.onChange();
    }
    // Called directly from a user gesture to satisfy browser autoplay rules.
    try {
      if (this.context.state !== 'running') await this.context.resume();
    } catch (error) {
      if (revision === this.revision) throw error;
      return;
    }
    if (revision !== this.revision) return;
    if (this.context.state !== 'running') throw new Error('Audio needs a user gesture');
    const remainingSeconds = (deadline - this.now()) / 1000;
    if (remainingSeconds <= 0) return;

    let buffer = this.buffers.get(sound);
    if (!buffer) {
      const samples = createNoiseSamples(sound, this.context.sampleRate);
      buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
      buffer.copyToChannel(samples, 0);
      this.buffers.set(sound, buffer);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sound === 'rain' ? 6500 : sound === 'ocean' ? 1200 : this.context.sampleRate / 2;
    filter.Q.value = 0.5;
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    const startTime = this.context.currentTime;
    // Schedule on the audio clock too, so throttled tabs don't overrun a session.
    const endTime = startTime + Math.max(0, (deadline - this.now()) / 1000);
    const fade = Math.min(0.06, (endTime - startTime) / 2);
    const voice = { source, filter, gain, sound, deadline, endTime };
    this.active = voice;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + fade);
    gain.gain.setValueAtTime(1, endTime - fade);
    gain.gain.linearRampToValueAtTime(0, endTime);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
      if (this.active === voice) { this.active = null; this.onChange(); }
    };
    source.start();
    source.stop(endTime);
    this.onChange();
  }

  stopVoice() {
    if (!this.active) return;
    const { source, gain } = this.active;
    this.active = null;
    const now = this.context.currentTime;
    if (typeof gain.gain.cancelAndHoldAtTime === 'function') {
      gain.gain.cancelAndHoldAtTime(now);
    } else {
      const value = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(value, now);
    }
    gain.gain.linearRampToValueAtTime(0, now + 0.06);
    source.stop(now + 0.06);
  }

  stop() {
    this.revision += 1; // Cancels a pending resume before it can create a source.
    this.stopVoice();
    this.onChange();
  }
}
