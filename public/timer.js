// AI-assisted implementation with OpenAI Codex, 2026-10-18.
// AI-assisted code
// Purpose: Preserve session deadlines, completion counts, and opt-in mode transitions.
// Prepared for review by: Dimitriy Leontev
// Generated: 2026-10-19
import { DEFAULT_DURATIONS, DURATION_LIMITS, validateDurations } from './settings.js';

export const MODES = Object.freeze({
  focus: Object.freeze({ label: 'Focus', duration: DEFAULT_DURATIONS.focus * 60000 }),
  short: Object.freeze({ label: 'Short break', duration: DEFAULT_DURATIONS.short * 60000 }),
  long: Object.freeze({ label: 'Long break', duration: DEFAULT_DURATIONS.long * 60000 })
});

// Longer interruptions require an explicit restart rather than unseen catch-up sessions.
export const COMPLETION_GRACE_MS = 5000;

export class PomodoroTimer {
  constructor(snapshot, now = Date.now(), durations = DEFAULT_DURATIONS, options = {}) {
    this.durations = validateDurations(durations).durations || { ...DEFAULT_DURATIONS };
    this.autoSwitch = options.autoSwitch === true;
    this.autoStart = this.autoSwitch && options.autoStart === true;
    const completedFocus = snapshot?.completedFocus ?? options.completedFocus;
    this.completedFocus = Number.isSafeInteger(completedFocus) && completedFocus >= 0 ? completedFocus : 0;
    const cycleFocus = snapshot?.cycleFocus;
    this.cycleFocus = Number.isInteger(cycleFocus) && cycleFocus >= 0 && cycleFocus <= 4 && cycleFocus <= this.completedFocus
      ? cycleFocus : this.completedFocus === 0 || (snapshot?.mode === 'long' && snapshot?.phase === 'complete')
        ? 0 : ((this.completedFocus - 1) % 4) + 1;
    this.mode = 'focus';
    this.reset();
    if (!snapshot || !Object.hasOwn(MODES, snapshot.mode)) return;
    // Snapshots from the original timer used the default session lengths.
    const duration = snapshot.durationMs ?? MODES[snapshot.mode].duration;
    if (!Number.isInteger(duration) || duration % 60000 !== 0 || duration < 60000 ||
        duration > DURATION_LIMITS[snapshot.mode] * 60000) return;
    if (!['ready', 'running', 'paused', 'complete'].includes(snapshot.phase)) return;
    if (!Number.isFinite(snapshot.remainingMs) || snapshot.remainingMs < 0 || snapshot.remainingMs > duration) return;
    if (snapshot.phase === 'running' && (!Number.isFinite(snapshot.deadline) || snapshot.deadline > now + duration)) return;
    if (snapshot.phase === 'paused' && snapshot.remainingMs === 0) return;
    this.mode = snapshot.mode;
    if (snapshot.phase === 'ready') this.reset();
    else {
      this.sessionDurationMs = duration;
      this.phase = snapshot.phase;
      this.remainingMs = this.phase === 'complete' ? 0 : snapshot.remainingMs;
      this.deadline = this.phase === 'running' ? snapshot.deadline : null;
    }
    const from = snapshot.transitionFrom;
    const expectedMode = from === 'focus' ? (this.cycleFocus === 4 ? 'long' : 'short') : 'focus';
    if (this.phase !== 'complete' && Object.hasOwn(MODES, from) && this.mode === expectedMode) this.transitionFrom = from;
  }

  get duration() { return this.sessionDurationMs; }

  get nextMode() {
    return this.mode === 'focus' ? (this.cycleFocus === 4 ? 'long' : 'short') : 'focus';
  }

  setDurations(values) {
    const { durations } = validateDurations(values);
    if (!durations) throw new RangeError('Invalid session lengths');
    this.durations = durations;
    if (this.phase === 'ready') this.reset();
  }

  selectMode(mode) {
    if (!Object.hasOwn(MODES, mode)) throw new RangeError('Unknown timer mode');
    this.mode = mode;
    this.reset();
  }

  reset() {
    this.transitionFrom = null;
    this.sessionDurationMs = this.durations[this.mode] * 60000;
    this.phase = 'ready';
    this.remainingMs = this.duration;
    this.deadline = null;
  }

  start(now = Date.now()) {
    if (this.phase === 'running') return;
    if (this.phase === 'complete') this.reset();
    this.transitionFrom = null;
    this.deadline = now + this.remainingMs;
    this.phase = 'running';
  }

  pause(now = Date.now()) {
    if (this.phase !== 'running') return false;
    const completed = this.sync(now, { allowTransition: false });
    if (!completed) {
      this.phase = 'paused';
      this.deadline = null;
    }
    return completed;
  }

  sync(now = Date.now(), { allowTransition = true, allowAutoStart = true } = {}) {
    if (this.phase !== 'running') return false;
    // Recompute from the finish time; never count interval callbacks as seconds.
    this.remainingMs = Math.min(this.duration, Math.max(0, this.deadline - now));
    if (this.remainingMs > 0) return false;
    const overdue = now - this.deadline;
    this.transitionFrom = null;
    this.phase = 'complete';
    this.deadline = null;
    if (this.mode === 'focus') {
      this.completedFocus = Math.min(Number.MAX_SAFE_INTEGER, this.completedFocus + 1);
      this.cycleFocus = this.cycleFocus % 4 + 1;
    } else if (this.mode === 'long') {
      this.cycleFocus = 0;
    }
    if (this.autoSwitch && allowTransition) {
      const from = this.mode;
      this.selectMode(this.nextMode);
      if (this.autoStart && allowAutoStart && overdue <= COMPLETION_GRACE_MS) this.start(now);
      this.transitionFrom = from;
    }
    return true;
  }

  snapshot() {
    return {
      mode: this.mode, phase: this.phase, durationMs: this.duration, remainingMs: this.remainingMs, deadline: this.deadline,
      completedFocus: this.completedFocus, cycleFocus: this.cycleFocus, transitionFrom: this.transitionFrom
    };
  }
}

export function formatTime(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
