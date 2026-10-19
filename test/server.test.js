// AI-assisted implementation with OpenAI Codex, 2026-10-18.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { app } from '../server.js';

test('Express serves the app and health check without exposing project files', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /Make room for/);
  assert.equal(home.headers.get('x-powered-by'), null);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(home.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const file of ['/app.js', '/timer.js', '/audio.js', '/styles.css', '/favicon.svg']) {
    const response = await fetch(base + file);
    assert.equal(response.status, 200, file);
  }
  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await health.json(), { status: 'ok' });
  for (const file of ['/package.json', '/server.js', '/.env', '/.git/config', '/test/server.test.js', '/missing']) {
    const response = await fetch(base + file);
    assert.equal(response.status, 404, file);
    assert.match(response.headers.get('content-type'), /text\/plain/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  const malformed = await fetch(base + '/%E0%A4%A');
  assert.equal(malformed.status, 404);
  assert.equal(await malformed.text(), 'Page not found. Return to / for your timer.');
});

// AI-assisted test additions with OpenAI Codex, 2026-10-19.
test('the production entry point serves requests and exits cleanly on SIGTERM', {
  skip: process.platform === 'win32' ? 'Windows does not deliver POSIX SIGTERM to child processes.' : false,
  timeout: 10000
}, async (context) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, NODE_ENV: 'production', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  context.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const exited = once(child, 'exit');
  let errors = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/Pomodoro listening on (\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`Server exited before listening: ${errors}`)));
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(child.kill('SIGTERM'), true);
  const [code, signal] = await exited;
  assert.equal(code, 0, errors);
  assert.equal(signal, null);
});
