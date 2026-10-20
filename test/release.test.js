// AI-assisted release validation tests with OpenAI Codex, 2026-10-20.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packageRelease, verifyPackage, verifyDeployment, validateSourceRun } from '../scripts/release.js';

const commit = 'a'.repeat(40);
async function fixture(context) {
  const directory = await mkdtemp(path.join(tmpdir(), 'pomodoro-release-'));
  context.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(directory).startsWith('pomodoro-release-'));
    return rm(directory, { recursive: true, force: true });
  });
  const root = path.join(directory, 'source');
  const output = path.join(directory, 'package');
  await mkdir(path.join(root, 'public'), { recursive: true });
  await mkdir(path.join(root, 'node_modules'), { recursive: true });
  await writeFile(path.join(root, '.env'), 'PRIVATE_TEST_VALUE=excluded');
  await writeFile(path.join(root, 'node_modules', 'ignored.js'), 'excluded');
  for (const file of ['server.js', 'package.json', 'package-lock.json']) await writeFile(path.join(root, file), '{}');
  await writeFile(path.join(root, 'public', 'index.html'), '<h1>Pomodoro</h1>');
  await writeFile(path.join(root, 'public', 'app.js'), 'console.log("timer");');
  return { root, output };
}

test('release packaging excludes repository files and binds source checksums to a commit', async context => {
  const { root, output } = await fixture(context);
  const manifest = await packageRelease(root, output, commit);
  assert.equal(manifest.commit, commit);
  assert.deepEqual((await readdir(output)).sort(), ['package-lock.json', 'package.json', 'public', 'release-manifest.json', 'server.js']);
  assert.equal(JSON.parse(await readFile(path.join(output, 'public', 'release.json'))).commit, commit);
  await assert.rejects(packageRelease(root, output, commit), /must be empty/);
  await assert.rejects(packageRelease(root, root, commit), /must differ/);
  await assert.rejects(packageRelease(root, output, 'main'), /full Git commit/);
});

test('a release rejects wrong commits, altered files, missing files, and unlisted files', async context => {
  const { root, output } = await fixture(context);
  await packageRelease(root, output, commit);
  await assert.rejects(verifyPackage(output, 'b'.repeat(40)), /Unexpected release commit/);
  const app = path.join(output, 'public', 'app.js');
  const original = await readFile(app);
  await writeFile(app, 'different code');
  await assert.rejects(verifyPackage(output), /checksum mismatch/);
  await writeFile(app, original);
  await writeFile(path.join(output, 'extra.txt'), 'not allowed');
  await assert.rejects(verifyPackage(output), /unlisted files/);
  await rm(path.join(output, 'extra.txt'));
  await rm(app);
  await assert.rejects(verifyPackage(output), /missing or unlisted/);
});

test('manifest entries cannot traverse directories or include generated dependencies', async context => {
  const { root, output } = await fixture(context);
  await packageRelease(root, output, commit);
  const file = path.join(output, 'release-manifest.json');
  const manifest = JSON.parse(await readFile(file));
  manifest.files['../outside.txt'] = '0'.repeat(64);
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyPackage(output), /unlisted files|Invalid release entry/);
  delete manifest.files['../outside.txt'];
  await mkdir(path.join(output, 'node_modules'));
  await writeFile(path.join(output, 'node_modules', 'extra.js'), 'excluded');
  manifest.files['node_modules/extra.js'] = '0'.repeat(64);
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(verifyPackage(output), /Invalid release entry/);
});

test('source symlinks cannot include files from outside the release allowlist', {
  skip: process.platform === 'win32' ? 'Creating Windows symlinks requires a separate OS privilege.' : false
}, async context => {
  const { root, output } = await fixture(context);
  await symlink(path.join(root, '.env'), path.join(root, 'public', 'leaked.txt'));
  await assert.rejects(packageRelease(root, output, commit), /Symbolic links/);
});

test('rollback selects only successful main release runs from this repository', () => {
  const run = { id: 123, repository: { full_name: 'dleontev/pomodoro' }, head_branch: 'main',
    path: '.github/workflows/release.yml', status: 'completed', conclusion: 'success' };
  assert.equal(validateSourceRun(run, 'dleontev/pomodoro'), 123);
  for (const override of [
    { head_branch: 'dev' }, { conclusion: 'failure' }, { status: 'in_progress' },
    { path: '.github/workflows/ci.yml' }, { repository: { full_name: 'someone/else' } }, { id: '123' }
  ]) assert.throws(() => validateSourceRun({ ...run, ...override }, 'dleontev/pomodoro'), /successful main release/);
});

test('deployment verification rejects stale releases, unhealthy responses, and changed frontend bytes', async context => {
  const { root, output } = await fixture(context);
  await packageRelease(root, output, commit);
  let health = true;
  let changed = false;
  let stale = false;
  const server = createServer(async (request, response) => {
    if (request.url === '/health') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ status: health ? 'ok' : 'error' }));
      return;
    }
    if (changed && request.url === '/app.js') { response.end('wrong release bytes'); return; }
    if (stale && request.url === '/release.json') { response.end(JSON.stringify({ commit: 'b'.repeat(40) })); return; }
    const file = request.url === '/' ? 'index.html' : request.url.slice(1);
    try { response.end(await readFile(path.join(output, 'public', file))); }
    catch { response.statusCode = 404; response.end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await verifyDeployment(origin, output, commit)).commit, commit);
  stale = true;
  await assert.rejects(verifyDeployment(origin, output, commit), /does not match/);
  stale = false;
  changed = true;
  await assert.rejects(verifyDeployment(origin, output, commit), /does not match/);
  changed = false;
  health = false;
  await assert.rejects(verifyDeployment(origin, output, commit), /health check failed/);
  await assert.rejects(verifyDeployment('http://example.com', output), /HTTPS origin/);
  await assert.rejects(verifyDeployment('https://example.com/unexpected-path', output), /HTTPS origin/);
});
