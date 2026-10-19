// AI-assisted code
// Purpose: Verify duration input boundaries, persistence, and storage-failure recovery.
// Prepared for review by: Dimitriy Leontev
// Generated: 2026-10-19
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DURATIONS, loadDurations, saveDurations, validateDurations } from '../public/settings.js';

test('session lengths accept whole minutes and reject invalid values atomically', () => {
  assert.deepEqual(validateDurations({ focus: '40', short: '7', long: '20' }).durations, { focus: 40, short: 7, long: 20 });
  for (const values of [{ focus: 1, short: 1, long: 1 }, { focus: 120, short: 60, long: 60 }]) {
    assert.deepEqual(validateDurations(values).durations, values);
  }
  for (const value of ['', ' ', 'invalid', 0, -1, 1.5, 121, Infinity, NaN, null, true]) {
    const result = validateDurations({ ...DEFAULT_DURATIONS, focus: value });
    assert.equal(result.durations, null, String(value));
    assert.match(result.errors.focus, /1 to 120/);
  }
  assert.equal(validateDurations({ focus: 25, short: 61, long: 15 }).durations, null);
  assert.equal(validateDurations({ focus: 25, short: 5, long: 61 }).durations, null);
  assert.equal(validateDurations(null).durations, null);
  assert.equal(validateDurations({ focus: 25 }).durations, null);
});

test('saved session lengths round-trip through browser-style storage', () => {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  assert.deepEqual(loadDurations(storage), DEFAULT_DURATIONS);
  assert.equal(saveDurations(storage, { focus: 40, short: 7, long: 20 }), true);
  assert.deepEqual(loadDurations(storage), { focus: 40, short: 7, long: 20 });
  assert.throws(() => saveDurations(storage, { focus: 0, short: 5, long: 15 }), RangeError);
  assert.deepEqual(loadDurations(storage), { focus: 40, short: 7, long: 20 }, 'invalid input cannot overwrite saved values');
  saveDurations(storage, DEFAULT_DURATIONS);
  assert.deepEqual(loadDurations(storage), DEFAULT_DURATIONS);
});

test('corrupt or incomplete stored preferences restore independent default values', () => {
  for (const value of ['{', 'null', '{}', '[]', '{"focus":40,"short":0,"long":20}']) {
    const restored = loadDurations({ getItem: () => value });
    assert.deepEqual(restored, DEFAULT_DURATIONS);
    restored.focus = 50;
    assert.equal(DEFAULT_DURATIONS.focus, 25);
  }
});

test('blocked storage falls back without preventing session-length changes', () => {
  const storage = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota exceeded'); } };
  assert.deepEqual(loadDurations(storage), DEFAULT_DURATIONS);
  assert.deepEqual(loadDurations(undefined), DEFAULT_DURATIONS);
  assert.equal(saveDurations(storage, DEFAULT_DURATIONS), false);
  assert.equal(saveDurations(undefined, DEFAULT_DURATIONS), false);
});
