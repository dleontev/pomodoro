// AI-assisted implementation with OpenAI Codex, 2026-10-18.
import { MODES, PomodoroTimer, formatTime } from './timer.js';
import { AmbientAudio, SOUNDS } from './audio.js';

const $ = (id) => document.getElementById(id);
const sessionKey = 'pomodoro.session.v1';
const notificationKey = 'pomodoro.notifications.v1';
let saved;
try { saved = JSON.parse(sessionStorage.getItem(sessionKey)); } catch { /* Storage may be blocked. */ }
const timer = new PomodoroTimer(saved?.timer);
let completedFocus = Number.isSafeInteger(saved?.completedFocus) && saved.completedFocus >= 0 ? saved.completedFocus : 0;
let notificationsEnabled = false;
try { notificationsEnabled = localStorage.getItem(notificationKey) === 'true'; } catch { /* Optional preference. */ }
const notificationsSupported = 'Notification' in window && window.isSecureContext;
const notificationToggle = $('notifications');
const modeButtons = [...document.querySelectorAll('.mode-button')];
const captions = {
  focus: 'A fresh start for the task that matters.',
  short: 'Stand up, stretch, and take a slow breath.',
  long: 'Step away for a while. You’ve earned the space.'
};

const soundKey = 'pomodoro.sounds.v1';
let soundPreferences = { focus: 'off', break: 'off', volume: 30, muted: false };
try {
  const stored = JSON.parse(localStorage.getItem(soundKey));
  if (stored) {
    for (const mode of ['focus', 'break']) {
      if (stored[mode] === 'off' || Object.hasOwn(SOUNDS, stored[mode])) soundPreferences[mode] = stored[mode];
    }
    if (Number.isFinite(stored.volume)) soundPreferences.volume = Math.round(Math.min(100, Math.max(0, stored.volume)));
    soundPreferences.muted = stored.muted === true;
  }
} catch { /* Sound preferences are optional. */ }
const audioSupported = Boolean(window.AudioContext || window.webkitAudioContext);
let audioUnlocked = false;
let audioError = '';
const ambient = new AmbientAudio({ onChange: updateSoundControl });
$('focus-sound').value = soundPreferences.focus;
$('break-sound').value = soundPreferences.break;
$('sound-volume').value = soundPreferences.volume;

function selectedSound() { return soundPreferences[timer.mode === 'focus' ? 'focus' : 'break']; }

function saveSoundPreferences() {
  try { localStorage.setItem(soundKey, JSON.stringify(soundPreferences)); } catch { /* Audio works without storage. */ }
}

function updateSoundControl() {
  const sound = selectedSound();
  const wantsAudio = timer.phase === 'running' && sound !== 'off' && !soundPreferences.muted && soundPreferences.volume > 0;
  $('sound-volume-value').textContent = `${soundPreferences.volume}%`;
  $('sound-volume').setAttribute('aria-valuetext', `${soundPreferences.volume} percent`);
  $('sound-mute').textContent = soundPreferences.muted ? 'Unmute' : 'Mute';
  $('sound-mute').setAttribute('aria-pressed', String(soundPreferences.muted));
  $('sound-mute').setAttribute('aria-label', soundPreferences.muted ? 'Unmute ambient sounds' : 'Mute ambient sounds');
  for (const id of ['focus-sound', 'break-sound', 'sound-volume', 'sound-mute']) $(id).disabled = !audioSupported;
  $('sound-resume').hidden = !audioSupported || !wantsAudio || ambient.isPlaying;
  const status = !audioSupported ? 'Ambient sound is unavailable in this browser.'
    : audioError ? audioError
    : soundPreferences.muted ? 'Ambient sounds are muted.'
    : soundPreferences.volume === 0 ? 'Volume is at zero. Raise it to hear your sound.'
    : sound === 'off' ? 'Sounds are off for this session. Choose one above.'
    : wantsAudio && ambient.isPlaying ? `${SOUNDS[sound]} is playing during your ${timer.mode === 'focus' ? 'focus session' : 'break'}.`
    : wantsAudio ? 'Select Enable sound to allow audio in this tab.'
    : `${SOUNDS[sound]} will play when you start or resume the timer.`;
  if ($('sound-status').textContent !== status) $('sound-status').textContent = status;
}

async function syncSound(userGesture = false) {
  ambient.setVolume(soundPreferences.muted ? 0 : soundPreferences.volume / 100);
  const sound = selectedSound();
  if (!audioSupported || timer.phase !== 'running' || sound === 'off' || soundPreferences.muted || soundPreferences.volume === 0) {
    ambient.stop();
    updateSoundControl();
    return;
  }
  if (!userGesture && (!audioUnlocked || ambient.context?.state !== 'running')) {
    updateSoundControl();
    return;
  }
  try {
    audioError = '';
    await ambient.play(sound, timer.deadline);
    audioUnlocked = ambient.isPlaying;
  } catch {
    ambient.stop();
    audioError = 'Sound could not start. Select Enable sound to try again.';
  }
  updateSoundControl();
}

function save() {
  try { sessionStorage.setItem(sessionKey, JSON.stringify({ timer: timer.snapshot(), completedFocus })); } catch { /* Timer also works without storage. */ }
}

function announce(message) { $('announcer').textContent = message; }

function nextMode() {
  return timer.mode === 'focus' ? (completedFocus > 0 && completedFocus % 4 === 0 ? 'long' : 'short') : 'focus';
}

function updateNotificationControl() {
  const permission = notificationsSupported ? Notification.permission : 'unsupported';
  notificationToggle.disabled = !notificationsSupported || permission === 'denied';
  notificationToggle.checked = notificationsEnabled && permission === 'granted';
  $('notification-help').textContent = !notificationsSupported
    ? 'Notifications need a supported browser on HTTPS or localhost.'
    : permission === 'denied'
      ? 'Blocked in your browser. Allow notifications in site settings.'
      : notificationToggle.checked ? 'On — we’ll let you know when time is up' : 'Notify me when a session ends';
}

function finishSession() {
  ambient.stop();
  if (timer.mode === 'focus') completedFocus += 1;
  const message = timer.mode === 'focus'
    ? 'Focus session complete. Nice work! Time for a break.'
    : 'Break complete. Ready for a fresh focus session?';
  $('completion-text').textContent = message;
  announce(message);
  save();
  if (notificationsEnabled && notificationsSupported && Notification.permission === 'granted') {
    try {
      const notification = new Notification('Pomodoro — session complete', {
        body: message, icon: '/favicon.svg', tag: 'pomodoro-session'
      });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch { /* The visible completion message is always available. */ }
  }
}

function render() {
  const formatted = formatTime(timer.remainingMs);
  const elapsedPercent = (1 - timer.remainingMs / timer.duration) * 100;
  const progress = Math.floor(elapsedPercent);
  const seconds = Math.ceil(timer.remainingMs / 1000);
  $('time').textContent = formatted;
  $('time').setAttribute('aria-label', `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`);
  $('ring-value').setAttribute('stroke-dashoffset', String(elapsedPercent));
  $('session-progress').setAttribute('aria-valuenow', String(progress));
  $('session-progress').setAttribute('aria-valuetext', `${progress}% complete`);
  document.body.dataset.mode = timer.mode;
  $('session-label').textContent = timer.mode === 'focus' ? 'TIME TO FOCUS' : 'TIME TO RECHARGE';
  $('timer-caption').textContent = timer.phase === 'complete' ? 'Take a moment. Then choose your next step.' : captions[timer.mode];
  $('status-text').textContent = { ready: 'Ready when you are', running: timer.mode === 'focus' ? 'One thing at a time' : 'Enjoy your breathing room', paused: 'Paused — take your time', complete: 'Session complete' }[timer.phase];
  $('start').disabled = timer.phase === 'running';
  $('pause').disabled = timer.phase !== 'running';
  $('reset').disabled = timer.phase === 'ready';
  $('start-label').textContent = timer.phase === 'paused' ? 'Resume' : timer.phase === 'complete' ? 'Start again' : timer.mode === 'focus' ? 'Start focus' : 'Start break';
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === timer.mode)));
  $('completion').hidden = timer.phase !== 'complete';
  if (timer.phase === 'complete') {
    $('completion-text').textContent = timer.mode === 'focus' ? 'Focus session complete. Nice work! Time for a break.' : 'Break complete. Ready for a fresh focus session?';
  }
  $('next-session').textContent = `Start ${nextMode() === 'focus' ? 'a focus session' : nextMode() === 'long' ? 'a long break' : 'a short break'} →`;
  $('focus-count').textContent = `${completedFocus} focus session${completedFocus === 1 ? '' : 's'} completed`;
  const cycleCount = completedFocus === 0 ? 0 : ((completedFocus - 1) % 4) + 1;
  [...$('session-dots').children].forEach((dot, index) => dot.classList.toggle('done', index < cycleCount));
  const title = timer.phase === 'complete' ? 'Session complete' : `${formatted} · ${MODES[timer.mode].label}`;
  if (document.title !== `${title} — Pomodoro`) document.title = `${title} — Pomodoro`;
}

function refresh(now = Date.now()) {
  if (timer.sync(now)) finishSession();
  render();
  updateSoundControl();
}

$('start').addEventListener('click', () => {
  timer.start();
  save();
  refresh();
  void syncSound(true);
  announce(`${MODES[timer.mode].label} ${timer.remainingMs < timer.duration ? 'resumed' : 'started'}.`);
});
$('pause').addEventListener('click', () => {
  const now = Date.now();
  refresh(now);
  if (timer.phase !== 'running') return;
  timer.pause(now);
  ambient.stop();
  save();
  render();
  updateSoundControl();
  announce('Timer paused.');
});
$('reset').addEventListener('click', () => {
  timer.reset(); ambient.stop(); save(); render(); updateSoundControl(); announce(`${MODES[timer.mode].label} timer reset.`);
});
modeButtons.forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.mode === timer.mode) return;
  refresh();
  timer.selectMode(button.dataset.mode);
  ambient.stop();
  save(); render(); updateSoundControl(); announce(`${MODES[timer.mode].label} selected. Timer ready.`);
}));
$('next-session').addEventListener('click', () => {
  timer.selectMode(nextMode()); timer.start(); save(); refresh(); announce(`${MODES[timer.mode].label} started.`);
  void syncSound(true);
  $('pause').focus();
});

for (const mode of ['focus', 'break']) {
  $(`${mode}-sound`).addEventListener('change', () => {
    soundPreferences[mode] = $(`${mode}-sound`).value;
    audioError = '';
    saveSoundPreferences();
    refresh();
    void syncSound(true);
  });
}
$('sound-volume').addEventListener('input', () => {
  soundPreferences.volume = Number($('sound-volume').value);
  saveSoundPreferences();
  refresh();
  void syncSound(true);
});
$('sound-mute').addEventListener('click', () => {
  soundPreferences.muted = !soundPreferences.muted;
  audioError = '';
  saveSoundPreferences();
  refresh();
  void syncSound(true);
});
$('sound-resume').addEventListener('click', () => {
  refresh();
  void syncSound(true);
});
window.addEventListener('pagehide', () => ambient.stop());
notificationToggle.addEventListener('change', async () => {
  const requested = notificationToggle.checked;
  notificationToggle.disabled = true;
  try {
    const permission = requested && Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    notificationsEnabled = requested && permission === 'granted';
  } catch { notificationsEnabled = false; }
  try { localStorage.setItem(notificationKey, String(notificationsEnabled)); } catch { /* Optional preference. */ }
  updateNotificationControl();
  announce(notificationsEnabled ? 'Session notifications enabled.' : 'Session notifications off.');
});

// A throttled callback catches up in one update. Restore immediately on return.
setInterval(() => { if (timer.phase === 'running') refresh(); }, 200);
document.addEventListener('visibilitychange', () => { refresh(); updateNotificationControl(); });
window.addEventListener('focus', () => { refresh(); updateNotificationControl(); });
window.addEventListener('pageshow', () => { refresh(); void syncSound(); });
updateNotificationControl();
refresh();
