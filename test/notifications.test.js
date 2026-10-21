// AI-assisted code with OpenAI Codex, 2026-10-19.
// Verify synthesized alerts, browser restrictions, cancellation, and independent preferences.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationAudio, NOTIFICATION_SOUNDS, DEFAULT_NOTIFICATION_SETTINGS, loadNotificationSettings, saveNotificationSettings } from '../public/notifications.js';

class Parameter {
  value = 1;
  events = [];
  setTargetAtTime(value, time) { this.value = value; this.events.push(['target', value, time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); }
  cancelAndHoldAtTime() {}
}

function setup() {
  const oscillators = [];
  const gains = [];
  const context = {
    state: 'suspended', currentTime: 10, destination: {}, resumeCalls: 0,
    async resume() { this.resumeCalls += 1; this.state = 'running'; },
    createGain() {
      const node = { gain: new Parameter(), connect() {}, disconnect() { this.disconnected = true; } };
      gains.push(node); return node;
    },
    createOscillator() {
      const node = {
        frequency: new Parameter(), stops: [], connect() {}, disconnect() { this.disconnected = true; },
        start(time) { this.startTime = time; }, stop(time) { this.stops.push(time); }
      };
      oscillators.push(node); return node;
    }
  };
  let created = 0;
  const audio = new NotificationAudio({ createContext: () => { created += 1; return context; } });
  return { audio, context, oscillators, gains, created: () => created };
}

test('five distinctive short effects use gentle envelopes and release their audio nodes', async () => {
  assert.equal(Object.keys(NOTIFICATION_SOUNDS).length, 5);
  const fingerprints = new Set();
  for (const sound of Object.keys(NOTIFICATION_SOUNDS)) {
    const { audio, context, oscillators, gains } = setup();
    await audio.unlock();
    assert.equal(await audio.play(sound), true);
    assert.ok(oscillators.length >= 1 && oscillators.length <= 3);
    let peakSum = 0;
    for (const [index, oscillator] of oscillators.entries()) {
      assert.ok(oscillator.startTime >= context.currentTime);
      assert.ok(oscillator.stops[0] <= context.currentTime + 1.3);
      const envelope = gains[index + 1].gain.events;
      assert.equal(envelope[0][1], 0, 'no abrupt full-volume onset');
      peakSum += envelope.find(([type]) => type === 'linear')[1];
      assert.equal(envelope.at(-1)[1], 0.0001, 'decays before stopping');
    }
    assert.ok(peakSum < 0.5, 'even summed note peaks leave headroom at maximum volume');
    fingerprints.add(JSON.stringify(oscillators.map(oscillator => [oscillator.type, oscillator.frequency.events, oscillator.startTime, oscillator.stops])));
    for (const oscillator of oscillators) oscillator.onended();
    assert.equal(audio.voices.size, 0);
    assert.ok(oscillators.every(oscillator => oscillator.disconnected));
    assert.ok(gains.slice(1).every(gain => gain.disconnected));
  }
  assert.equal(fingerprints.size, 5);
});

test('Off, mute, and completion callbacks cannot create or unlock an audio context', async () => {
  const { audio, created, context, oscillators } = setup();
  assert.equal(await audio.play('off', { userGesture: true }), false);
  assert.equal(await audio.play('chime'), false);
  audio.setVolume(0);
  assert.equal(await audio.play('chime', { userGesture: true }), false);
  assert.equal(created(), 0);
  audio.setVolume(0.5);
  await audio.unlock();
  assert.equal(oscillators.length, 0, 'Start enables future alerts without sounding one');
  assert.equal(audio.master.gain.value, 0.25);
  assert.equal(await audio.play('chime'), true);
  audio.setVolume(0);
  assert.equal(audio.voices.size, 0);
  assert.equal(oscillators[0].stops.at(-1), 10.02);
  assert.equal(await audio.play('bell'), false);
  audio.setVolume(1);
  assert.equal(oscillators.length, 1, 'unmuting does not replay an alert');
  context.state = 'suspended';
  assert.equal(await audio.play('bell'), false);
  assert.equal(context.resumeCalls, 1, 'completion never attempts to resume suspended audio');
  context.state = 'running';
  assert.equal(oscillators.length, 1, 'a dropped alert is not queued');
  await audio.play('melody');
  assert.equal(audio.voices.size, 3);
  context.state = 'suspended';
  context.onstatechange();
  assert.equal(audio.voices.size, 0);
  assert.ok(oscillators.slice(1).every(source => source.stops.at(-1) === context.currentTime));
  assert.ok(oscillators.slice(1).every(source => source.disconnected), 'suspension cancels even notes scheduled for later');
  context.state = 'running';
  context.onstatechange();
  assert.equal(oscillators.length, 4, 'audio resumption cannot revive or regenerate an old alert');
});

test('preview requires a gesture, and cancellation or a newer preview defeats pending unlocks', async () => {
  const { audio, context, oscillators } = setup();
  const unlocks = [];
  context.resume = () => new Promise(resolve => unlocks.push(() => { context.state = 'running'; resolve(); }));
  const first = audio.play('chime', { userGesture: true });
  const second = audio.play('wood', { userGesture: true });
  unlocks[1]();
  assert.equal(await second, true);
  unlocks[0]();
  assert.equal(await first, false);
  assert.equal(oscillators.length, 2, 'only the latest wooden chime created sources');
  context.state = 'suspended';
  const cancelled = audio.play('melody', { userGesture: true });
  audio.stop();
  unlocks[2]();
  assert.equal(await cancelled, false);
  assert.equal(oscillators.length, 2, 'pausing, resetting, or muting can cancel pending previews');
});

test('browser audio failures reject a preview without producing sound or blocking future attempts', async () => {
  const { audio, context, oscillators } = setup();
  context.resume = async () => { throw new Error('Audio denied'); };
  await assert.rejects(audio.play('digital', { userGesture: true }), /Audio denied/);
  assert.equal(oscillators.length, 0);
  assert.equal(await audio.play('digital'), false);
  context.resume = async () => { context.state = 'running'; };
  assert.equal(await audio.play('digital', { userGesture: true }), true);
  await assert.rejects(audio.play('unknown'), RangeError);
  const unavailable = new NotificationAudio({ createContext() { throw new Error('Unsupported'); } });
  await assert.rejects(unavailable.play('chime', { userGesture: true }), /Unsupported/);
});

test('notification settings round-trip independently and sanitize corrupt or blocked storage', () => {
  const entries = new Map([['pomodoro.sounds.v1', '{"focus":"rain","volume":10}']]);
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  assert.deepEqual(loadNotificationSettings(storage), DEFAULT_NOTIFICATION_SETTINGS);
  for (const sound of ['off', ...Object.keys(NOTIFICATION_SOUNDS)]) {
    assert.equal(saveNotificationSettings(storage, { sound, volume: 62, muted: true }), true);
    assert.deepEqual(loadNotificationSettings(storage), { sound, volume: 62, muted: true });
  }
  assert.equal(entries.get('pomodoro.sounds.v1'), '{"focus":"rain","volume":10}');
  for (const raw of ['{', 'null', '{}', '{"sound":"unknown","volume":"loud","muted":"yes"}']) {
    assert.deepEqual(loadNotificationSettings({ getItem: () => raw }), DEFAULT_NOTIFICATION_SETTINGS);
  }
  saveNotificationSettings(storage, { sound: 'bell', volume: 200, muted: false });
  assert.equal(loadNotificationSettings(storage).volume, 100);
  assert.deepEqual(loadNotificationSettings(undefined), DEFAULT_NOTIFICATION_SETTINGS);
  assert.equal(saveNotificationSettings(undefined, DEFAULT_NOTIFICATION_SETTINGS), false);
});
