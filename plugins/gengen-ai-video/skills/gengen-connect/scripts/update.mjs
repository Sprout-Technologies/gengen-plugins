#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, open, unlink, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { resolveCodex } from './connect.mjs';

const exec = promisify(execFile);
const DAY = 86400000;
const HOUR = 3600000;
const PLUGIN = 'gengen-ai-video@gengen';
const MANIFEST = new URL('../../../.codex-plugin/plugin.json', import.meta.url);
const RELEASE = 'https://raw.githubusercontent.com/Sprout-Technologies/gengen-plugins/main/plugins/gengen-ai-video/.codex-plugin/plugin.json';
const SOURCES = new Set(['Sprout-Technologies/gengen-plugins', 'https://github.com/Sprout-Technologies/gengen-plugins', 'https://github.com/Sprout-Technologies/gengen-plugins.git', 'git@github.com:Sprout-Technologies/gengen-plugins.git']);
export const defaultStateDirectory = () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'gengen', 'plugin-updates');
export function compareVersions(a, b) {
  if (![a, b].every(v => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v))) throw new Error('Unsupported version');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
async function readState(directory) {
  try { return JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
async function run(command, args) {
  const { stdout } = await exec(command, args, { timeout: 25000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return stdout.trim();
}
async function releaseVersion() {
  const response = await fetch(RELEASE, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new Error('Release unavailable');
  const text = await response.text();
  if (text.length > 65536) throw new Error('Invalid release metadata');
  const manifest = JSON.parse(text);
  if (manifest.name !== 'gengen-ai-video') throw new Error('Unexpected plugin');
  compareVersions(manifest.version, '0.0.0');
  return manifest.version;
}
async function acquire(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'update.lock');
  // All child commands are bounded. Recover only an abandoned, expired lease.
  try { if (Date.now() - (await stat(path)).mtimeMs > 10 * 60 * 1000) await unlink(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const token = randomUUID();
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') return null; throw error; }
  await file.writeFile(token); await file.close();
  return async () => { try { if (await readFile(path, 'utf8') === token) await unlink(path); } catch { /* Lease already removed. */ } };
}

// Best-effort use-time maintenance, never a daemon, login flow, or video operation.
export async function autoUpdate({ directory = defaultStateDirectory(), currentVersion, getLatest = releaseVersion, execute = run, getCli = resolveCodex, now = Date.now(), disabled = process.env.GENGEN_PLUGIN_AUTO_UPDATE === '0' } = {}) {
  if (disabled) return { status: 'disabled' };
  let release;
  try {
    const previous = await readState(directory);
    if (previous.enabled === false) return { status: 'disabled' };
    if (previous.nextCheckAt > now && previous.nextCheckAt <= now + DAY) return { status: 'cached', version: previous.installedVersion };
    release = await acquire(directory);
    if (!release) return { status: 'busy' };
    const state = await readState(directory);
    if (state.enabled === false) return { status: 'disabled' };
    if (state.nextCheckAt > now && state.nextCheckAt <= now + DAY) return { status: 'cached', version: state.installedVersion };
    const save = async result => {
      await writeFile(join(directory, 'state.json'), JSON.stringify({ ...state, checkedAt: now, nextCheckAt: now + (result.status === 'unavailable' ? HOUR : DAY), ...(result.status === 'updated' ? { installedVersion: result.version } : {}), lastResult: result.status }), { mode: 0o600 });
      return result;
    };
    try {
      const running = currentVersion ?? JSON.parse(await readFile(MANIFEST, 'utf8')).version;
      const latest = await getLatest();
      if (compareVersions(latest, running) <= 0) return await save({ status: 'current', version: running });
      const cli = getCli();
      const json = async args => JSON.parse(await execute(cli, args));
      const marketplaces = await json(['plugin', 'marketplace', 'list', '--json']);
      const marketplace = marketplaces.marketplaces?.find(item => item.name === 'gengen');
      const source = marketplace?.marketplaceSource;
      if (source?.sourceType !== 'git' || !SOURCES.has(source.source) || [source.ref, source.gitRef, source.revision].some(ref => ref && ref !== 'main')) return await save({ status: 'managed_elsewhere' });
      const branch = await execute('git', ['-C', marketplace.root, 'symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '');
      if (branch !== 'main') return await save({ status: 'pinned' });
      const installed = (await json(['plugin', 'list', '--marketplace', 'gengen', '--json'])).installed?.find(item => item.pluginId === PLUGIN);
      if (!installed?.installed || !installed.enabled) return await save({ status: 'not_enabled' });
      if (compareVersions(latest, installed.version) <= 0) return await save({ status: 'current', version: installed.version });
      const refreshed = await json(['plugin', 'marketplace', 'upgrade', 'gengen', '--json']);
      if (!Array.isArray(refreshed.errors) || refreshed.errors.length) throw new Error('Marketplace refresh failed');
      const result = await json(['plugin', 'add', PLUGIN, '--json']);
      if (result.pluginId !== PLUGIN || compareVersions(result.version, latest) < 0) throw new Error('Installation not verified');
      return await save({ status: 'updated', version: result.version, reloadRequired: true });
    } catch { return await save({ status: 'unavailable' }); }
  } catch { return { status: 'unavailable' }; }
  finally { await release?.(); }
}
export async function setAutoUpdate(enabled, directory = defaultStateDirectory()) {
  const release = await acquire(directory);
  if (!release) return { status: 'busy' };
  try {
    const state = await readState(directory);
    await writeFile(join(directory, 'state.json'), JSON.stringify({ ...state, enabled, nextCheckAt: 0 }), { mode: 0o600 });
    return { status: enabled ? 'enabled' : 'disabled' };
  } finally { await release(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--enable', '--disable'].includes(args[0]))) {
    console.error('Usage: node update.mjs [--enable | --disable]'); process.exitCode = 1;
  } else {
    const result = args.length ? await setAutoUpdate(args[0] === '--enable') : await autoUpdate();
    console.log(JSON.stringify(result));
  }
}
