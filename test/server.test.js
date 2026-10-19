// AI-assisted implementation with OpenAI Codex, 2026-10-18.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
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
  for (const file of ['/app.js', '/timer.js', '/audio.js', '/styles.css', '/favicon.svg']) {
    const response = await fetch(base + file);
    assert.equal(response.status, 200, file);
  }
  const health = await fetch(base + '/health');
  assert.deepEqual(await health.json(), { status: 'ok' });
  for (const file of ['/package.json', '/server.js', '/.env', '/missing']) {
    assert.equal((await fetch(base + file)).status, 404, file);
  }
});
