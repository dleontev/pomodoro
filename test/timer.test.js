// AI-assisted implementation with OpenAI Codex, 2026-10-18.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, PomodoroTimer, formatTime } from '../public/timer.js';

test('all session durations and resets are correct', () => {
  const timer = new PomodoroTimer();
  for (const [mode, duration] of [['focus', 1500000], ['short', 300000], ['long', 900000]]) {
    timer.selectMode(mode);
    assert.equal(timer.remainingMs, duration);
    timer.start(1000); timer.sync(3500); timer.reset();
    assert.equal(timer.remainingMs, duration);
    assert.equal(timer.phase, 'ready');
  }
});

test('a long gap between callbacks catches up and completes exactly once', () => {
  const timer = new PomodoroTimer();
  timer.start(1000);
  assert.equal(timer.sync(901000), false);
  assert.equal(timer.remainingMs, 600000);
  assert.equal(timer.sync(4000000), true);
  assert.equal(timer.remainingMs, 0);
  assert.equal(timer.sync(5000000), false);
});

test('pause freezes remaining time; resume excludes time spent paused', () => {
  const timer = new PomodoroTimer();
  timer.start(1000); timer.pause(61234);
  assert.equal(timer.remainingMs, MODES.focus.duration - 60234);
  timer.sync(1000000);
  assert.equal(timer.remainingMs, MODES.focus.duration - 60234);
  timer.start(2000000); timer.start(2001000);
  timer.sync(2000766);
  assert.equal(timer.remainingMs, MODES.focus.duration - 61000);
});

test('pause at the deadline completes instead of leaving a zero-time paused timer', () => {
  const timer = new PomodoroTimer();
  timer.start(0);
  assert.equal(timer.pause(timer.duration), true);
  assert.equal(timer.phase, 'complete');
  timer.start(2000000);
  assert.equal(timer.remainingMs, timer.duration);
});

test('reload restores a running deadline including elapsed background time', () => {
  const original = new PomodoroTimer();
  original.selectMode('short'); original.start(1000);
  const restored = new PomodoroTimer(original.snapshot(), 61000);
  restored.sync(61000);
  assert.equal(restored.remainingMs, 240000);
  assert.equal(restored.sync(400000), true);
});

// AI-assisted test additions with OpenAI Codex, 2026-10-19.
test('reload preserves paused time without counting time away', () => {
  const original = new PomodoroTimer();
  original.start(1000);
  original.pause(61000);
  const restored = new PomodoroTimer(original.snapshot(), 4000000);
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.remainingMs, 1440000);
  assert.equal(restored.deadline, null);
  assert.equal(restored.sync(5000000), false);
  restored.start(5000000);
  assert.equal(restored.deadline, 6440000);
});

test('switching a running session discards the previous deadline', () => {
  const timer = new PomodoroTimer();
  timer.start(1000);
  timer.selectMode('short');
  assert.equal(timer.phase, 'ready');
  assert.equal(timer.remainingMs, MODES.short.duration);
  assert.equal(timer.deadline, null);
  assert.equal(timer.sync(2000000), false);
  timer.start(2000000);
  assert.equal(timer.sync(2300000), true);
  assert.equal(timer.mode, 'short');
});

test('malformed stored state falls back safely', () => {
  for (const snapshot of [null, {}, { mode: '__proto__' }, { mode: 'focus', phase: 'paused', remainingMs: -1 }, { mode: 'short', phase: 'running', remainingMs: 100, deadline: Infinity }]) {
    const timer = new PomodoroTimer(snapshot);
    assert.equal(timer.phase, 'ready');
    assert.equal(timer.remainingMs, MODES.focus.duration);
  }
  assert.throws(() => new PomodoroTimer().selectMode('missing'), RangeError);
});

test('display rounds up partial seconds and never shows negative time', () => {
  assert.equal(formatTime(1500000), '25:00');
  assert.equal(formatTime(59999), '01:00');
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(-500), '00:00');
});

// AI-assisted customization tests with OpenAI Codex, 2026-10-19.
test('custom lengths apply to each mode and invalid settings cannot mutate a timer', () => {
  const lengths = { focus: 40, short: 7, long: 20 };
  const timer = new PomodoroTimer(undefined, 0, lengths);
  lengths.focus = 99;
  for (const [mode, duration] of [['focus', 2400000], ['short', 420000], ['long', 1200000]]) {
    timer.selectMode(mode);
    assert.equal(timer.duration, duration);
    assert.equal(timer.remainingMs, duration);
  }
  const before = timer.snapshot();
  assert.throws(() => timer.setDurations({ focus: 0, short: 7, long: 20 }), RangeError);
  assert.deepEqual(timer.snapshot(), before);
  assert.deepEqual(timer.durations, { focus: 40, short: 7, long: 20 });
});

test('changing a running length preserves its deadline, progress, and reload state', () => {
  const timer = new PomodoroTimer();
  timer.start(1000);
  timer.sync(61000);
  const before = timer.snapshot();
  timer.setDurations({ focus: 40, short: 7, long: 20 });
  assert.deepEqual(timer.snapshot(), before);
  const restored = new PomodoroTimer(timer.snapshot(), 121000, timer.durations);
  restored.sync(121000);
  assert.equal(restored.duration, 1500000, 'progress uses the original 25-minute session');
  assert.equal(restored.remainingMs, 1380000);
  assert.equal(restored.deadline, 1501000);
  assert.equal(restored.sync(1501000), true);
  restored.start(2000000);
  assert.equal(restored.duration, 2400000, 'the next focus session uses 40 minutes');
});

test('paused sessions keep their original length; reset explicitly adopts saved lengths', () => {
  const timer = new PomodoroTimer();
  timer.selectMode('short');
  timer.start(1000);
  timer.pause(61000);
  timer.setDurations({ focus: 40, short: 7, long: 20 });
  const restored = new PomodoroTimer(timer.snapshot(), 1000000, timer.durations);
  assert.equal(restored.remainingMs, 240000);
  assert.equal(restored.duration, 300000);
  restored.start(1000000);
  assert.equal(restored.deadline, 1240000);
  restored.reset();
  assert.equal(restored.remainingMs, 420000);
  assert.equal(restored.phase, 'ready');
  restored.selectMode('long');
  assert.equal(restored.remainingMs, 1200000);
});

test('restoring defaults leaves an active custom session intact until reset', () => {
  const timer = new PomodoroTimer(undefined, 0, { focus: 40, short: 7, long: 20 });
  timer.start(0);
  timer.sync(60000);
  timer.setDurations({ focus: 25, short: 5, long: 15 });
  assert.equal(timer.duration, 2400000);
  assert.equal(timer.deadline, 2400000);
  timer.reset();
  assert.equal(timer.remainingMs, 1500000);
});

test('ready snapshots adopt saved preferences and legacy active snapshots retain defaults', () => {
  const preferences = { focus: 40, short: 7, long: 20 };
  const ready = new PomodoroTimer().snapshot();
  assert.equal(new PomodoroTimer(ready, 1000, preferences).remainingMs, 2400000);
  const legacy = { mode: 'focus', phase: 'running', remainingMs: 1500000, deadline: 1501000 };
  const restored = new PomodoroTimer(legacy, 61000, preferences);
  restored.sync(61000);
  assert.equal(restored.duration, 1500000);
  assert.equal(restored.remainingMs, 1440000);
});

test('invalid active duration snapshots are rejected rather than altering timer bounds', () => {
  for (const durationMs of [0, -60000, 60001, 7260000, Infinity, '1500000']) {
    const restored = new PomodoroTimer({ mode: 'focus', phase: 'paused', durationMs, remainingMs: 1000 }, 0);
    assert.equal(restored.phase, 'ready');
    assert.equal(restored.remainingMs, 1500000);
  }
});
