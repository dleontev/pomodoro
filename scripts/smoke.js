// AI-assisted implementation with OpenAI Codex, 2026-10-18.
// Launches the real npm start command on a free port, then stops its process tree.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (!process.env.npm_execpath) throw new Error('Run this check with npm run smoke.');
const windows = process.platform === 'win32';
const child = spawn(process.execPath, [process.env.npm_execpath, 'start'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, NODE_ENV: 'production', PORT: '0' },
  detached: !windows,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
});
const closed = new Promise((resolve) => child.once('close', resolve));
let output = '';
let startupTimeout;

try {
  const port = await new Promise((resolve, reject) => {
    startupTimeout = setTimeout(() => reject(new Error(`Startup timed out.\n${output}`)), 10000);
    const capture = (chunk) => {
      output = (output + chunk.toString()).slice(-20000);
      const match = output.match(/Pomodoro listening on (\d+)/);
      if (match) resolve(Number(match[1]));
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', reject);
    child.once('close', (code) => reject(new Error(`npm start exited (${code}).\n${output}`)));
  });
  clearTimeout(startupTimeout);
  assert.ok(port > 0, 'The server must report its OS-assigned port');
  const origin = `http://127.0.0.1:${port}`;
  const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const home = await fetch(origin, { signal: AbortSignal.timeout(5000) });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Make room for/);
  console.log(`Production npm start passed: / and /health returned 200 on port ${port}.`);
} finally {
  clearTimeout(startupTimeout);
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    if (windows) {
      // Target only the npm process created above and its children.
      const cleanup = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true, stdio: 'ignore'
      });
      await new Promise((resolve, reject) => {
        cleanup.once('error', reject);
        cleanup.once('close', (code) => code === 0 || code === 128
          ? resolve() : reject(new Error(`Startup check cleanup failed (${code}).`)));
      });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await Promise.race([closed, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  }
  await Promise.race([closed, delay(3000)]);
}
