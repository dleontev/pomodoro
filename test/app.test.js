// AI-assisted code with OpenAI Codex, 2026-10-19.
// Exercise the real browser controller with minimal DOM, storage, and Web Audio doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
let mounts = 0;

async function mount(t, { preferences = {}, session, now = 1000, audioAvailable = true } = {}) {
  const elements = new Map();
  const listeners = () => ({
    handlers: new Map(),
    addEventListener(type, handler) { this.handlers.set(type, handler); },
    async emit(type, event = {}) { await this.handlers.get(type)?.({ preventDefault() {}, ...event }); }
  });
  const document = { ...listeners(), body: { dataset: {} }, activeElement: null };
  const element = id => ({
    ...listeners(), id, textContent: '', value: '', checked: false, hidden: false, disabled: false,
    dataset: {}, children: [], attributes: new Map(), classList: { toggle() {} },
    setAttribute(name, value) { this.attributes.set(name, value); },
    focus() { document.activeElement = this; }
  });
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], element(match[1]));
  elements.get('session-dots').children = Array.from({ length: 4 }, () => element('dot'));
  const modes = ['focus', 'short', 'long'].map(mode => ({ ...element(mode), dataset: { mode } }));
  document.getElementById = id => {
    assert.ok(elements.has(id), `controller references an existing element: ${id}`);
    return elements.get(id);
  };
  document.querySelectorAll = selector => { assert.equal(selector, '.mode-button'); return modes; };
  const storage = initial => {
    const entries = new Map(Object.entries(initial));
    return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  };
  const localStorage = storage(preferences);
  const sessionStorage = storage(session ? { 'pomodoro.session.v1': JSON.stringify(session) } : {});
  const desktopAlerts = [];
  const oscillators = [];
  const ambientSources = [];
  class DesktopNotification {
    static permission = 'granted';
    constructor(_title, options) { desktopAlerts.push(options); }
  }
  class AudioContext {
    state = 'suspended'; currentTime = 10; sampleRate = 8000; destination = {};
    async resume() { this.state = 'running'; }
    createGain() { return { gain: { value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelAndHoldAtTime() {} }, connect() {}, disconnect() {} }; }
    createBuffer() { return { copyToChannel() {} }; }
    createBiquadFilter() { return { frequency: {}, Q: {}, connect() {}, disconnect() {} }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() {}, stop() {} };
      ambientSources.push(source); return source;
    }
    createOscillator() {
      const source = { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
      oscillators.push(source); return source;
    }
  }
  let tick;
  const window = { ...listeners(), localStorage, Notification: DesktopNotification, isSecureContext: true, focus() {} };
  if (audioAvailable) window.AudioContext = AudioContext;
  const globals = { document, window, localStorage, sessionStorage, Notification: DesktopNotification, AudioContext: audioAvailable ? AudioContext : undefined, setInterval: callback => { tick = callback; return 1; } };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalNow = Date.now;
  Date.now = () => now;
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(() => {
    Date.now = originalNow;
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`../public/app.js?controller-test=${++mounts}`);
  return {
    elements, modes, localStorage, sessionStorage, desktopAlerts, oscillators, ambientSources, window,
    tick: async time => { now = time; tick(); await new Promise(resolve => setImmediate(resolve)); },
    saved: () => JSON.parse(sessionStorage.getItem('pomodoro.session.v1')),
    change: async (id, value) => {
      const control = elements.get(id);
      if (typeof value === 'boolean') control.checked = value; else control.value = value;
      await control.emit('change');
    },
    click: async (id, time) => { if (time !== undefined) now = time; await elements.get(id).emit('click'); await new Promise(resolve => setImmediate(resolve)); }
  };
}

const automation = { 'pomodoro.auto-switch.v1': 'true', 'pomodoro.auto-start.v1': 'true' };
const sounding = { ...automation, 'pomodoro.notifications.v1': 'true', 'pomodoro.notification-sound.v1': '{"sound":"chime","volume":40,"muted":false}' };

test('controller starts automatic sessions and emits one sound and desktop alert per completion', async t => {
  const app = await mount(t, { preferences: sounding });
  await app.click('start');
  const deadline = app.saved().timer.deadline;
  await app.tick(deadline);
  assert.equal(app.saved().timer.mode, 'short');
  assert.equal(app.saved().timer.phase, 'running');
  assert.equal(app.saved().timer.completedFocus, 1);
  assert.equal(app.oscillators.length, 1);
  assert.equal(app.desktopAlerts.length, 1);
  assert.match(app.elements.get('completion-text').textContent, /Short break started automatically/);
  await app.tick(deadline + 100);
  await app.window.emit('focus');
  await app.window.emit('pageshow', { persisted: false });
  assert.equal(app.desktopAlerts.length, 1);
  assert.equal(app.oscillators.length, 1);
  await app.tick(app.saved().timer.deadline);
  assert.equal(app.saved().timer.mode, 'focus');
  assert.equal(app.desktopAlerts.length, 2);
  assert.equal(app.oscillators.length, 2);
});

test('restoring an expired session selects once without old alerts or automatic starts', async t => {
  const session = { timer: { mode: 'focus', phase: 'running', durationMs: 1500000, remainingMs: 1500000, deadline: 1501000, completedFocus: 0, cycleFocus: 0 } };
  const app = await mount(t, { preferences: sounding, session, now: 1501000 });
  assert.equal(app.saved().timer.mode, 'short');
  assert.equal(app.saved().timer.phase, 'ready');
  assert.equal(app.saved().timer.completedFocus, 1);
  assert.equal(app.elements.get('completion').hidden, false);
  await app.tick(1501001);
  assert.equal(app.desktopAlerts.length, 0);
  assert.equal(app.oscillators.length, 0);
});

test('wake-up drops stale alerts and waits for explicit Start', async t => {
  const app = await mount(t, { preferences: sounding });
  await app.click('start');
  await app.tick(app.saved().timer.deadline + 60000);
  assert.equal(app.saved().timer.phase, 'ready');
  assert.equal(app.saved().timer.completedFocus, 1);
  assert.equal(app.desktopAlerts.length, 0);
  assert.equal(app.oscillators.length, 0);
});

test('sound previews do not save a choice or change the timer; save, volume and mute remain separate', async t => {
  const app = await mount(t);
  await app.change('notification-sound', 'bell');
  await app.click('notification-preview');
  assert.equal(app.oscillators.length, 3);
  assert.equal(app.localStorage.getItem('pomodoro.notification-sound.v1'), null);
  assert.equal(app.sessionStorage.getItem('pomodoro.session.v1'), null);
  await app.click('notification-save');
  assert.equal(JSON.parse(app.localStorage.getItem('pomodoro.notification-sound.v1')).sound, 'bell');
  const volume = app.elements.get('notification-volume');
  volume.value = '23';
  await volume.emit('input');
  await app.click('notification-mute');
  assert.deepEqual(JSON.parse(app.localStorage.getItem('pomodoro.notification-sound.v1')), { sound: 'bell', volume: 23, muted: true });
  assert.equal(app.elements.get('notification-preview').disabled, true);
  assert.equal(app.elements.get('sound-volume').value, 30);
});

test('disabling auto-switch also disables and persists auto-start off; manual modes wait for Start', async t => {
  const app = await mount(t, { preferences: automation });
  await app.click('start');
  await app.change('auto-switch', false);
  assert.equal(app.elements.get('auto-start').disabled, true);
  assert.equal(app.elements.get('auto-start').checked, false);
  assert.equal(app.localStorage.getItem('pomodoro.auto-start.v1'), 'false');
  await app.change('auto-switch', true);
  assert.equal(app.elements.get('auto-start').checked, false);
  await app.modes[2].emit('click');
  assert.equal(app.saved().timer.mode, 'long');
  assert.equal(app.saved().timer.phase, 'ready');
  assert.equal(app.saved().timer.completedFocus, 0);
});

test('unsupported audio preserves timer controls and visual completion', async t => {
  const app = await mount(t, { preferences: sounding, audioAvailable: false });
  assert.equal(app.elements.get('notification-preview').disabled, true);
  await app.click('start');
  await app.tick(app.saved().timer.deadline);
  assert.equal(app.saved().timer.phase, 'running');
  assert.equal(app.elements.get('completion').hidden, false);
  assert.match(app.elements.get('notification-sound-status').textContent, /unavailable/);
});

test('assisted and manual completion keep their countdowns stopped while delivering fresh alerts', async t => {
  for (const autoSwitch of [true, false]) await t.test(autoSwitch ? 'assisted' : 'manual', async t => {
    const app = await mount(t, { preferences: { ...sounding, 'pomodoro.auto-switch.v1': String(autoSwitch), 'pomodoro.auto-start.v1': 'false' } });
    await app.click('start');
    await app.tick(app.saved().timer.deadline);
    assert.equal(app.saved().timer.phase, autoSwitch ? 'ready' : 'complete');
    assert.equal(app.saved().timer.mode, autoSwitch ? 'short' : 'focus');
    assert.equal(app.desktopAlerts.length, 1);
    assert.equal(app.oscillators.length, 1);
    assert.equal(app.elements.get('next-session').hidden, autoSwitch);
  });
});

test('Pause at expiry and Reset cannot auto-start or switch; repeated manual actions do not add counts', async t => {
  const app = await mount(t, { preferences: sounding });
  await app.click('start');
  await app.click('pause', app.saved().timer.deadline);
  assert.equal(app.saved().timer.mode, 'focus');
  assert.equal(app.saved().timer.phase, 'complete');
  assert.equal(app.saved().timer.completedFocus, 1);
  await app.click('reset');
  assert.equal(app.saved().timer.phase, 'ready');
  assert.equal(app.saved().timer.completedFocus, 1);
  await app.click('start');
  await app.click('pause');
  await app.click('start');
  await app.click('reset');
  assert.equal(app.saved().timer.phase, 'ready');
  assert.equal(app.saved().timer.completedFocus, 1);
});

test('automatic transitions reuse unlocked ambient audio and select the configured break sound', async t => {
  const app = await mount(t, { preferences: { ...sounding, 'pomodoro.sounds.v1': '{"focus":"rain","break":"ocean","volume":10,"muted":false}' } });
  await app.click('start');
  assert.match(app.elements.get('sound-status').textContent, /Rain is playing/);
  await app.tick(app.saved().timer.deadline);
  assert.match(app.elements.get('sound-status').textContent, /Ocean is playing/);
  assert.equal(app.ambientSources.length, 2);
  assert.equal(app.oscillators.length, 1);
  assert.equal(app.elements.get('sound-volume').value, 10);
  assert.equal(app.elements.get('notification-volume').value, 40);
});
