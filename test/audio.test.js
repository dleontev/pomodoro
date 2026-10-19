// AI-assisted implementation with OpenAI Codex, 2026-10-18.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AmbientAudio, SOUNDS, createNoiseSamples } from '../public/audio.js';

function seededRandom() {
  let seed = 12345;
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

test('all five soundscapes contain finite, audible samples with headroom', () => {
  assert.equal(Object.keys(SOUNDS).length, 5);
  const outputs = [];
  for (const sound of Object.keys(SOUNDS)) {
    const samples = createNoiseSamples(sound, 8000, 1, seededRandom());
    assert.equal(samples.length, 8000);
    let energy = 0;
    let mean = 0;
    for (const value of samples) {
      assert.ok(Number.isFinite(value) && Math.abs(value) <= 0.851);
      energy += value * value; mean += value;
    }
    assert.ok(Math.sqrt(energy / samples.length) > 0.05, `${sound} is not silent`);
    assert.ok(Math.abs(mean / samples.length) < 0.000001, `${sound} has no DC offset`);
    outputs.push(samples);
  }
  for (let index = 1; index < outputs.length; index += 1) assert.notDeepEqual(outputs[0], outputs[index]);
  assert.throws(() => createNoiseSamples('unknown', 8000), RangeError);
});

test('pink and brown noise are progressively softer than white noise', () => {
  const roughness = (sound) => {
    const samples = createNoiseSamples(sound, 44100, 2, seededRandom());
    let difference = 0;
    let energy = 0;
    for (let index = 1; index < samples.length; index += 1) {
      difference += (samples[index] - samples[index - 1]) ** 2;
      energy += samples[index] ** 2;
    }
    return difference / energy;
  };
  assert.ok(roughness('white') > roughness('pink'));
  assert.ok(roughness('pink') > roughness('brown'));
});

class Parameter {
  value = 1;
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelAndHoldAtTime() {}
}

class Node {
  gain = new Parameter();
  frequency = new Parameter();
  Q = new Parameter();
  stopTimes = [];
  connect() {}
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop(time) { this.stopTimes.push(time); }
}

function setup() {
  const sources = [];
  const context = {
    state: 'suspended', currentTime: 10, sampleRate: 8000, destination: {},
    async resume() { this.state = 'running'; },
    createGain: () => new Node(),
    createBiquadFilter: () => new Node(),
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource: () => { const source = new Node(); sources.push(source); return source; }
  };
  let created = 0;
  const audio = new AmbientAudio({ createContext: () => { created += 1; return context; }, now: () => 1000 });
  return { audio, context, sources, created: () => created };
}

test('audio initializes only on play and stops on the audio clock at the session deadline', async () => {
  const { audio, sources, created } = setup();
  audio.setVolume(0.4);
  assert.equal(created(), 0);
  await audio.play('rain', 11000);
  assert.equal(created(), 1);
  assert.equal(audio.isPlaying, true);
  assert.equal(sources[0].loop, true);
  assert.deepEqual(sources[0].stopTimes, [20]);
  assert.ok(Math.abs(audio.master.gain.value - 0.16) < 0.000001);
  await audio.play('rain', 11000);
  assert.equal(sources.length, 1, 'volume updates do not duplicate a playing source');
  sources[0].onended();
  assert.equal(audio.isPlaying, false);
  assert.equal(sources[0].disconnected, true);
});

test('switching sounds fades out the previous source; pause cancels the new source', async () => {
  const { audio, sources } = setup();
  await audio.play('rain', 11000);
  await audio.play('ocean', 11000);
  assert.equal(audio.active.sound, 'ocean');
  assert.equal(sources[0].stopTimes.at(-1), 10.06);
  sources[0].onended();
  assert.equal(audio.active.sound, 'ocean', 'old cleanup cannot clear the new sound');
  audio.stop();
  assert.equal(audio.isPlaying, false);
  assert.equal(sources[1].stopTimes.at(-1), 10.06);
});

test('pause during a pending browser audio unlock prevents late playback', async () => {
  const { audio, context, sources } = setup();
  let unlock;
  context.resume = () => new Promise((resolve) => { unlock = () => { context.state = 'running'; resolve(); }; });
  const playing = audio.play('brown', 11000);
  audio.stop();
  unlock();
  await playing;
  assert.equal(sources.length, 0);
  assert.equal(audio.isPlaying, false);
});

test('expired sessions never start audio', async () => {
  const { audio, sources, created } = setup();
  await audio.play('white', 999);
  assert.equal(created(), 0);
  assert.equal(sources.length, 0);
});
