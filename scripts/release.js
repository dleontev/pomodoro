// AI-assisted release tooling with OpenAI Codex, 2026-10-20.
// Package an identifiable source release and verify its served frontend bytes.
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootFiles = ['package-lock.json', 'package.json', 'server.js'];
const manifestName = 'release-manifest.json';
const publicVersion = 'public/release.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validCommit = commit => typeof commit === 'string' && /^[a-f0-9]{40}$/.test(commit);

function allowedFile(file) {
  return typeof file === 'string' && !file.includes('\\') && !file.includes('\0') &&
    !file.split('/').some(part => !part || part.startsWith('.')) &&
    (rootFiles.includes(file) || file.startsWith('public/'));
}

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not release files: ${relative}`);
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), `${relative}/`));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported release file: ${relative}`);
  }
  return files.sort();
}

export async function packageRelease(root, output, commit) {
  if (!validCommit(commit)) throw new Error('A full Git commit SHA is required');
  if (path.resolve(root) === path.resolve(output)) throw new Error('Release output must differ from the source directory');
  if (path.resolve(output).startsWith(path.resolve(root, 'public') + path.sep)) throw new Error('Release output cannot be inside public');
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Release output must be empty');
  const publicStat = await lstat(path.join(root, 'public'));
  if (!publicStat.isDirectory() || publicStat.isSymbolicLink()) throw new Error('public must be a real directory');
  const sourceFiles = [...rootFiles, ...await filesUnder(path.join(root, 'public'), 'public/')].filter(file => file !== publicVersion);
  for (const file of sourceFiles) {
    if (!allowedFile(file)) throw new Error(`Unexpected source file: ${file}`);
    const source = path.join(root, file);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular file: ${file}`);
    await mkdir(path.dirname(path.join(output, file)), { recursive: true });
    await cp(source, path.join(output, file));
  }
  await writeFile(path.join(output, publicVersion), `${JSON.stringify({ commit })}\n`);
  const files = {};
  for (const file of await filesUnder(output)) files[file] = hash(await readFile(path.join(output, file)));
  await writeFile(path.join(output, manifestName), `${JSON.stringify({ schemaVersion: 1, commit, files }, null, 2)}\n`);
  return verifyPackage(output, commit);
}

export async function verifyPackage(directory, expectedCommit) {
  const manifestPath = path.join(directory, manifestName);
  const stat = await lstat(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('A regular release manifest is required');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !validCommit(manifest.commit) ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Invalid release manifest');
  }
  if (expectedCommit && manifest.commit !== expectedCommit) throw new Error('Unexpected release commit');
  const actualFiles = (await filesUnder(directory)).filter(file => file !== manifestName);
  const expectedFiles = Object.keys(manifest.files).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error('Release contains missing or unlisted files');
  for (const file of [...rootFiles, publicVersion, 'public/index.html']) {
    if (!Object.hasOwn(manifest.files, file)) throw new Error(`Required release file missing: ${file}`);
  }
  for (const file of expectedFiles) {
    if (!allowedFile(file) || !/^[a-f0-9]{64}$/.test(manifest.files[file])) throw new Error(`Invalid release entry: ${file}`);
    if (hash(await readFile(path.join(directory, file))) !== manifest.files[file]) throw new Error(`Release checksum mismatch: ${file}`);
  }
  const version = JSON.parse(await readFile(path.join(directory, publicVersion), 'utf8'));
  if (version.commit !== manifest.commit) throw new Error('Public release version disagrees with the manifest');
  return manifest;
}

export function validateSourceRun(run, repository) {
  if (!Number.isSafeInteger(run?.id) || run.id <= 0 || run.repository?.full_name !== repository ||
      run.head_branch !== 'main' || run.path !== '.github/workflows/release.yml' ||
      run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('Rollback requires a successful main release run from this repository');
  }
  return run.id;
}

export async function verifyDeployment(base, directory, expectedCommit) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS origin (HTTP localhost is allowed for tests)');
  }
  const manifest = await verifyPackage(directory, expectedCommit);
  const request = route => fetch(`${url.origin}${route}`, {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000)
  });
  const health = await request('/health');
  if (health.status !== 200 || (await health.json()).status !== 'ok') throw new Error('Application health check failed');
  await Promise.all(Object.entries(manifest.files).filter(([file]) => file.startsWith('public/')).map(async ([file, expected]) => {
    const route = file === 'public/index.html' ? '/' : '/' + file.slice(7).split('/').map(encodeURIComponent).join('/');
    const response = await request(route);
    if (response.status !== 200 || hash(Buffer.from(await response.arrayBuffer())) !== expected) {
      throw new Error(`Deployed file does not match the release: ${route}`);
    }
  }));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let manifest;
    if (command === 'source-run' && args.length === 2) {
      console.log(validateSourceRun(JSON.parse(await readFile(args[0], 'utf8')), args[1]));
      process.exit(0);
    }
    if (command === 'package' && args.length === 3) manifest = await packageRelease(...args);
    else if (command === 'inspect' && args.length >= 1 && args.length <= 2) manifest = await verifyPackage(...args);
    else if (command === 'verify' && args.length >= 2 && args.length <= 3) manifest = await verifyDeployment(...args);
    else throw new Error('Use package <source> <output> <sha>, inspect <package> [sha], or verify <origin> <package> [sha]');
    console.log(manifest.commit);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
