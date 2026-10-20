// AI-assisted code
// Purpose: Validate session lengths and persist timer preferences.
// Prepared for review by: Dimitriy Leontev
// Generated: 2026-10-19
export const DEFAULT_DURATIONS = Object.freeze({ focus: 25, short: 5, long: 15 });
export const DURATION_LIMITS = Object.freeze({ focus: 120, short: 60, long: 60 });
const storageKey = 'pomodoro.durations.v1';
const autoSwitchKey = 'pomodoro.auto-switch.v1';

export function loadAutoSwitch(storage) {
  try { return storage.getItem(autoSwitchKey) === 'true'; } catch { return false; }
}

export function saveAutoSwitch(storage, enabled) {
  if (typeof enabled !== 'boolean') throw new TypeError('Auto-switch must be a boolean');
  try {
    storage.setItem(autoSwitchKey, String(enabled));
    return true;
  } catch {
    return false;
  }
}

export function validateDurations(values) {
  const durations = {};
  const errors = {};
  for (const [mode, maximum] of Object.entries(DURATION_LIMITS)) {
    const raw = values?.[mode];
    const minutes = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > maximum) {
      errors[mode] = `Enter a whole number from 1 to ${maximum}.`;
    } else {
      durations[mode] = minutes;
    }
  }
  return { durations: Object.keys(errors).length ? null : durations, errors };
}

export function loadDurations(storage) {
  try {
    const stored = JSON.parse(storage.getItem(storageKey));
    return validateDurations(stored).durations || { ...DEFAULT_DURATIONS };
  } catch {
    return { ...DEFAULT_DURATIONS };
  }
}

export function saveDurations(storage, values) {
  const { durations } = validateDurations(values);
  if (!durations) throw new RangeError('Invalid session lengths');
  try {
    storage.setItem(storageKey, JSON.stringify(durations));
    return true;
  } catch {
    return false;
  }
}
