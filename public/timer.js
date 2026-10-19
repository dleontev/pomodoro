// AI-assisted implementation with OpenAI Codex, 2026-10-18.
export const MODES = Object.freeze({
  focus: Object.freeze({ label: 'Focus', duration: 25 * 60 * 1000 }),
  short: Object.freeze({ label: 'Short break', duration: 5 * 60 * 1000 }),
  long: Object.freeze({ label: 'Long break', duration: 15 * 60 * 1000 })
});

export class PomodoroTimer {
  constructor(snapshot, now = Date.now()) {
    this.mode = 'focus';
    this.reset();
    if (!snapshot || !Object.hasOwn(MODES, snapshot.mode)) return;
    const duration = MODES[snapshot.mode].duration;
    if (!['ready', 'running', 'paused', 'complete'].includes(snapshot.phase)) return;
    if (!Number.isFinite(snapshot.remainingMs) || snapshot.remainingMs < 0 || snapshot.remainingMs > duration) return;
    if (snapshot.phase === 'running' && (!Number.isFinite(snapshot.deadline) || snapshot.deadline > now + duration)) return;
    if (snapshot.phase === 'paused' && snapshot.remainingMs === 0) return;
    this.mode = snapshot.mode;
    this.phase = snapshot.phase;
    this.remainingMs = this.phase === 'ready' ? duration : this.phase === 'complete' ? 0 : snapshot.remainingMs;
    this.deadline = this.phase === 'running' ? snapshot.deadline : null;
  }

  get duration() { return MODES[this.mode].duration; }

  selectMode(mode) {
    if (!Object.hasOwn(MODES, mode)) throw new RangeError('Unknown timer mode');
    this.mode = mode;
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.remainingMs = this.duration;
    this.deadline = null;
  }

  start(now = Date.now()) {
    if (this.phase === 'running') return;
    if (this.phase === 'complete') this.reset();
    this.deadline = now + this.remainingMs;
    this.phase = 'running';
  }

  pause(now = Date.now()) {
    if (this.phase !== 'running') return false;
    const completed = this.sync(now);
    if (!completed) {
      this.phase = 'paused';
      this.deadline = null;
    }
    return completed;
  }

  sync(now = Date.now()) {
    if (this.phase !== 'running') return false;
    // Recompute from the finish time; never count interval callbacks as seconds.
    this.remainingMs = Math.min(this.duration, Math.max(0, this.deadline - now));
    if (this.remainingMs > 0) return false;
    this.phase = 'complete';
    this.deadline = null;
    return true;
  }

  snapshot() {
    return { mode: this.mode, phase: this.phase, remainingMs: this.remainingMs, deadline: this.deadline };
  }
}

export function formatTime(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
