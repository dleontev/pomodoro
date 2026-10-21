// AI-assisted code
// Purpose: Verify one-time session transitions, cycle progress, and reload behavior.
// Prepared for review by: Dimitriy Leontev
// Generated: 2026-10-19
import test from 'node:test';
import assert from 'node:assert/strict';
import { PomodoroTimer, COMPLETION_GRACE_MS } from '../public/timer.js';

test('auto-switch defaults off and completion preserves manual mode selection', () => {
  const timer = new PomodoroTimer();
  assert.equal(timer.autoSwitch, false);
  timer.start(0);
  assert.equal(timer.sync(timer.deadline), true);
  assert.equal(timer.mode, 'focus');
  assert.equal(timer.phase, 'complete');
  assert.equal(timer.nextMode, 'short');
  assert.equal(timer.completedFocus, 1);
  assert.equal(timer.cycleFocus, 1);
  assert.equal(timer.sync(100000000), false);
  timer.selectMode('short');
  timer.start(200000000);
  assert.equal(timer.sync(timer.deadline), true);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.phase, 'complete');
  assert.equal(timer.nextMode, 'focus');
  assert.equal(timer.completedFocus, 1);
  timer.selectMode('long');
  timer.start(300000000);
  timer.sync(timer.deadline);
  assert.equal(timer.mode, 'long');
  assert.equal(timer.phase, 'complete');
  assert.equal(timer.cycleFocus, 0);
  assert.equal(timer.completedFocus, 1);
});

test('enabled auto-switch selects a short break and waits indefinitely for Start', () => {
  const timer = new PomodoroTimer(undefined, 0, undefined, { autoSwitch: true });
  timer.start(1000);
  assert.equal(timer.sync(timer.deadline), true);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.phase, 'ready');
  assert.equal(timer.transitionFrom, 'focus');
  assert.equal(timer.deadline, null);
  assert.equal(timer.remainingMs, 300000);
  const selected = timer.snapshot();
  assert.equal(timer.sync(10000000000), false, 'sleep cannot initiate additional sessions');
  assert.deepEqual(timer.snapshot(), selected);
});

test('four configured focus sessions lead to a long break and a new four-session cycle', () => {
  const lengths = { focus: 40, short: 7, long: 20 };
  const timer = new PomodoroTimer(undefined, 0, lengths, { autoSwitch: true });
  let now = 1000;
  for (let focus = 1; focus <= 4; focus += 1) {
    assert.equal(timer.mode, 'focus');
    assert.equal(timer.remainingMs, 2400000);
    timer.start(now);
    now = timer.deadline;
    assert.equal(timer.sync(now), true);
    assert.equal(timer.completedFocus, focus);
    assert.equal(timer.cycleFocus, focus);
    assert.equal(timer.mode, focus === 4 ? 'long' : 'short');
    assert.equal(timer.remainingMs, focus === 4 ? 1200000 : 420000);
    assert.equal(timer.phase, 'ready');
    assert.equal(timer.deadline, null);
    if (focus < 4) {
      timer.start(now + 1000);
      now = timer.deadline;
      assert.equal(timer.sync(now), true);
      assert.equal(timer.mode, 'focus');
      assert.equal(timer.phase, 'ready');
      assert.equal(timer.completedFocus, focus);
      assert.equal(timer.cycleFocus, focus);
    }
  }
  timer.start(now + 1000);
  now = timer.deadline;
  assert.equal(timer.sync(now), true);
  assert.equal(timer.mode, 'focus');
  assert.equal(timer.phase, 'ready');
  assert.equal(timer.completedFocus, 4, 'lifetime total survives the long break');
  assert.equal(timer.cycleFocus, 0);
  timer.start(now + 1000);
  timer.sync(timer.deadline);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.completedFocus, 5);
  assert.equal(timer.cycleFocus, 1);
});

test('manual mode changes and resets cancel countdowns without counting completions', () => {
  const timer = new PomodoroTimer(undefined, 0, undefined, { autoSwitch: true });
  timer.start(0);
  timer.selectMode('short');
  assert.equal(timer.sync(10000000), false);
  timer.start(20000000);
  timer.reset();
  assert.equal(timer.sync(30000000), false);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.completedFocus, 0);
  assert.equal(timer.cycleFocus, 0);
  timer.selectMode('focus');
  timer.start(40000000);
  timer.sync(timer.deadline);
  timer.selectMode('long');
  assert.equal(timer.transitionFrom, null);
  assert.equal(timer.completedFocus, 1);
  assert.equal(timer.cycleFocus, 1, 'selecting a long break alone does not complete it');
  timer.reset();
  assert.equal(timer.completedFocus, 1);
  assert.equal(timer.cycleFocus, 1);
});

test('pause and resume preserve time and count a completion only after resumed expiry', () => {
  const timer = new PomodoroTimer(undefined, 0, undefined, { autoSwitch: true });
  timer.start(1000);
  timer.pause(61000);
  assert.equal(timer.sync(100000000), false);
  const restored = new PomodoroTimer(timer.snapshot(), 100000000, timer.durations, { autoSwitch: true });
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.remainingMs, 1440000);
  restored.start(100000000);
  assert.equal(restored.sync(101439999), false);
  assert.equal(restored.sync(101440000), true);
  assert.equal(restored.mode, 'short');
  assert.equal(restored.completedFocus, 1);
  assert.equal(restored.sync(101440001), false);
});

test('pausing at the deadline completes once without switching modes or starting another timer', () => {
  const timer = new PomodoroTimer(undefined, 0, undefined, { autoSwitch: true });
  timer.start(0);
  assert.equal(timer.pause(timer.deadline), true);
  assert.equal(timer.mode, 'focus');
  assert.equal(timer.phase, 'complete');
  assert.equal(timer.pause(10000000), false);
  assert.equal(timer.completedFocus, 1);
});

test('toggle changes apply at the next completion without changing the active deadline', () => {
  const timer = new PomodoroTimer();
  timer.start(0);
  const deadline = timer.deadline;
  timer.autoSwitch = true;
  assert.equal(timer.deadline, deadline);
  timer.sync(deadline);
  assert.equal(timer.mode, 'short');
  timer.autoSwitch = false;
  assert.equal(timer.sync(deadline + 10000000), false);
  assert.equal(timer.mode, 'short', 'turning off does not undo an already selected mode');
  timer.start(deadline + 10000000);
  timer.autoSwitch = true;
  timer.pause(deadline + 10001000);
  timer.autoSwitch = false;
  timer.start(deadline + 20000000);
  timer.sync(timer.deadline);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.phase, 'complete');
  timer.autoSwitch = true;
  assert.equal(timer.sync(deadline + 30000000), false, 'enabling does not reprocess an existing completion');
  assert.equal(timer.mode, 'short');
});

test('reload and delayed callbacks produce one completion and preserve the selected ready mode', () => {
  const timer = new PomodoroTimer(undefined, 0, { focus: 2, short: 3, long: 4 }, { autoSwitch: true });
  timer.start(1000);
  const expired = new PomodoroTimer(timer.snapshot(), 50000000, timer.durations, { autoSwitch: true });
  let completions = 0;
  for (const now of [50000000, 50000001, 50000002]) if (expired.sync(now)) completions += 1;
  assert.equal(completions, 1, 'the UI receives one completion event for notifications');
  assert.equal(expired.mode, 'short');
  assert.equal(expired.phase, 'ready');
  assert.equal(expired.completedFocus, 1);
  assert.equal(expired.remainingMs, 180000);
  const restored = new PomodoroTimer(expired.snapshot(), 90000000, timer.durations, { autoSwitch: true });
  assert.equal(restored.transitionFrom, 'focus');
  assert.equal(restored.sync(90000000), false, 'reload does not emit a second completion');
  assert.equal(restored.completedFocus, 1);
  assert.equal(restored.cycleFocus, 1);
  assert.equal(restored.deadline, null);
});

test('legacy focus totals migrate and completed snapshots are not processed again', () => {
  const legacy = { mode: 'focus', phase: 'running', durationMs: 1500000, remainingMs: 1500000, deadline: 1501000 };
  const timer = new PomodoroTimer(legacy, 1501000, undefined, { completedFocus: 3, autoSwitch: true });
  assert.equal(timer.sync(1501000), true);
  assert.equal(timer.completedFocus, 4);
  assert.equal(timer.mode, 'long');
  const alreadyComplete = new PomodoroTimer({ ...legacy, phase: 'complete', remainingMs: 0, deadline: null }, 2000000, undefined, { completedFocus: 4, autoSwitch: true });
  assert.equal(alreadyComplete.sync(2000000), false);
  assert.equal(alreadyComplete.completedFocus, 4);
  assert.equal(alreadyComplete.phase, 'complete');
  const longComplete = new PomodoroTimer({ mode: 'long', phase: 'complete', remainingMs: 0 }, 0, undefined, { completedFocus: 4 });
  assert.equal(longComplete.cycleFocus, 0);
});

test('changed preferences affect the selected next session while the active duration stays intact', () => {
  const timer = new PomodoroTimer(undefined, 0, { focus: 2, short: 3, long: 4 }, { autoSwitch: true });
  timer.start(0);
  timer.setDurations({ focus: 40, short: 7, long: 20 });
  assert.equal(timer.deadline, 120000);
  assert.equal(timer.sync(120000), true);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.remainingMs, 420000);
  timer.reset();
  assert.equal(timer.transitionFrom, null);
  assert.equal(timer.completedFocus, 1);
  timer.start(200000);
  timer.sync(timer.deadline);
  assert.equal(timer.mode, 'focus');
  assert.equal(timer.remainingMs, 2400000);
});

test('auto-start is off by default and cannot start a session without auto-switch', () => {
  for (const options of [{}, { autoSwitch: true }, { autoStart: true }]) {
    const timer = new PomodoroTimer(undefined, 0, undefined, options);
    assert.equal(timer.autoStart, false);
    timer.start(0);
    timer.sync(timer.deadline);
    assert.notEqual(timer.phase, 'running');
  }
});

test('automatic starts use custom durations and follow four-focus long-break scheduling', () => {
  const timer = new PomodoroTimer(undefined, 0, { focus: 2, short: 3, long: 4 }, { autoSwitch: true, autoStart: true });
  timer.start(1000);
  for (let focus = 1; focus <= 4; focus += 1) {
    const completion = timer.deadline + 1200;
    assert.equal(timer.sync(completion), true);
    assert.equal(timer.completedFocus, focus);
    assert.equal(timer.mode, focus === 4 ? 'long' : 'short');
    assert.equal(timer.phase, 'running');
    assert.equal(timer.remainingMs, focus === 4 ? 240000 : 180000);
    assert.equal(timer.deadline, completion + timer.duration, 'starts from detection time, never an old deadline');
    assert.equal(timer.sync(completion), false, 'another callback cannot duplicate a completion');
    const breakEnd = timer.deadline;
    assert.equal(timer.sync(breakEnd), true);
    assert.equal(timer.mode, 'focus');
    assert.equal(timer.phase, 'running');
    assert.equal(timer.remainingMs, 120000);
  }
  assert.equal(timer.completedFocus, 4);
  assert.equal(timer.cycleFocus, 0);
});

test('prolonged suspension and expired reloads select one ready session without catch-up cycles', () => {
  const options = { autoSwitch: true, autoStart: true };
  const timer = new PomodoroTimer(undefined, 0, undefined, options);
  timer.start(1000);
  const snapshot = timer.snapshot();
  const afterSleep = timer.deadline + COMPLETION_GRACE_MS + 1;
  assert.equal(timer.sync(afterSleep), true);
  assert.equal(timer.mode, 'short');
  assert.equal(timer.phase, 'ready');
  assert.equal(timer.sync(afterSleep + 100000000), false);
  assert.equal(timer.completedFocus, 1);
  const reload = new PomodoroTimer(snapshot, snapshot.deadline, undefined, options);
  assert.equal(reload.sync(snapshot.deadline, { allowAutoStart: false }), true);
  assert.equal(reload.phase, 'ready');
  assert.equal(reload.completedFocus, 1);
  assert.equal(reload.sync(snapshot.deadline + 1), false);
});

test('manual controls and automation changes retain control of automatically started timers', () => {
  const timer = new PomodoroTimer(undefined, 0, undefined, { autoSwitch: true, autoStart: true });
  timer.start(1000);
  timer.sync(timer.deadline);
  const deadline = timer.deadline;
  timer.start(deadline - 1000);
  assert.equal(timer.deadline, deadline, 'repeated Start cannot replace a running deadline');
  timer.pause(deadline - 2000);
  assert.equal(timer.phase, 'paused');
  const restored = new PomodoroTimer(timer.snapshot(), deadline + 100000, timer.durations, { autoSwitch: true, autoStart: true });
  assert.equal(restored.phase, 'paused');
  assert.equal(restored.sync(deadline + 1000000), false);
  restored.start(deadline + 1000000);
  restored.autoStart = false;
  restored.sync(restored.deadline);
  assert.equal(restored.mode, 'focus');
  assert.equal(restored.phase, 'ready');
  restored.autoStart = true;
  assert.equal(restored.sync(1000000000), false, 'enabling does not start an already selected session');
  restored.selectMode('long');
  assert.equal(restored.phase, 'ready');
  restored.start(1000000000);
  restored.reset();
  assert.equal(restored.sync(2000000000), false);
  assert.equal(restored.completedFocus, 1);
});

test('reloading an automatically started countdown retains its deadline and completion feedback', () => {
  const options = { autoSwitch: true, autoStart: true };
  const timer = new PomodoroTimer(undefined, 0, undefined, options);
  timer.start(1000);
  timer.sync(timer.deadline);
  const restored = new PomodoroTimer(timer.snapshot(), timer.deadline - 1000, timer.durations, options);
  assert.equal(restored.phase, 'running');
  assert.equal(restored.transitionFrom, 'focus');
  assert.equal(restored.deadline, timer.deadline);
  assert.equal(restored.completedFocus, 1);
  assert.equal(restored.sync(timer.deadline - 1000), false);
  assert.equal(restored.remainingMs, 1000);
  restored.autoSwitch = false;
  restored.sync(timer.deadline);
  assert.equal(restored.mode, 'short');
  assert.equal(restored.phase, 'complete');
  assert.equal(restored.transitionFrom, null, 'completion clears feedback from the previous automatic transition');
});
