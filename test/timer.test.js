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
