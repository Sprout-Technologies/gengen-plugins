#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://gengen.farm/api/mcp';
const RESOURCE = 'ui://gengen/ai-project-v1.html';
export const LOGIN_ARGS = ['mcp', 'login', 'gengen', '--scopes', 'openid', '--oauth-client-registration', 'dcr'];
const RETRY = 'To try again in Codex, use $gengen-connect or ask "Reconnect GENGEN".';

export function resolveCodex(explicit) {
  const candidates = explicit ? [explicit] : [
    ...(process.platform === 'darwin' ? [
      '/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
      '/Applications/Codex.app/Contents/Resources/codex',
      '/Applications/ChatGPT.app/Contents/Resources/codex',
    ] : []), 'codex',
  ];
  for (const candidate of candidates) {
    try {
      const help = execFileSync(candidate, ['mcp', 'login', '--help'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] });
      if (help.includes('--oauth-client-registration')) return candidate;
    } catch { /* Try the next installed CLI without changing the user's installation. */ }
  }
  throw new Error('A current Codex CLI is required. Use the GenGen connection controls in Codex or pass --codex with its CLI path.');
}

export function checkConfiguration(cli) {
  let config;
  try {
    config = JSON.parse(execFileSync(cli, ['mcp', 'get', 'gengen', '--json'], {
      encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    throw new Error('The installed GENGEN MCP server was not found. Install and enable GenGen in Codex first.');
  }
  if (!config.enabled || config.transport?.url !== ENDPOINT) {
    throw new Error('Enable the GenGen plugin with its official https://gengen.farm/api/mcp connection before authorizing.');
  }
}

// A fresh app-server uses Codex's own credentials; never extract bearer tokens.
export function startRpc(cli, timeoutMs = 60_000) {
  const child = spawn(cli, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let nextId = 0;
  let ended = false;
  function fail(error = new Error('Codex connection check stopped. Update Codex and retry.')) {
    ended = true;
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }
  child.once('error', () => fail());
  child.once('exit', () => fail());
  child.stdin.on('error', () => fail());
  lines.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method && message.id !== undefined) {
      // This check never grants permission or accepts an unexpected host request.
      child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unsupported during connection check' } }) + '\n');
      return;
    }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(`Codex could not complete ${item.method}. Reconnect GENGEN or update Codex, then retry.`));
    else item.resolve(message.result);
  });
  const stop = () => { fail(); lines.close(); child.stdin.destroy(); child.kill(); };
  const interrupted = () => {
    fail(Object.assign(new Error('GENGEN connection check was cancelled.'), { code: 'CANCELLED' }));
    stop();
  };
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  return {
    request(method, params) {
      if (ended) return Promise.reject(new Error('Codex connection check is no longer running.'));
      return new Promise((resolveResult, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('The GENGEN connection check timed out. Check your network and retry.'));
        }, timeoutMs);
        pending.set(id, { resolve: resolveResult, reject, timer, method });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    },
    notify(method) { child.stdin.write(JSON.stringify({ method }) + '\n'); },
    close() {
      process.removeListener('SIGINT', interrupted);
      process.removeListener('SIGTERM', interrupted);
      stop();
    },
  };
}

export async function verifyConnection(cli, rpcFactory = startRpc) {
  const rpc = rpcFactory(cli);
  try {
    await rpc.request('initialize', { clientInfo: { name: 'gengen-connection-check', version: '1.0.0' }, capabilities: { experimentalApi: true, explicitGatewayOauth: true } });
    rpc.notify('initialized');
    const result = await rpc.request('mcpServerStatus/list', { serverName: 'gengen', detail: 'full' });
    const server = result?.data?.find(item => item.name === 'gengen');
    if (!server || server.authStatus !== 'oAuth') throw new Error('GENGEN needs account authorization in Codex.');
    if (server.httpOrigin !== new URL(ENDPOINT).origin || server.toolsError ||
        !Object.values(server.tools || {}).some(tool => tool.name === 'get_ai_workflow')) {
      throw new Error('GENGEN authenticated tool discovery failed.');
    }
    // Discovery can be cached. Require a live authenticated resource request too.
    const panel = await rpc.request('mcpServer/resource/read', { server: 'gengen', uri: RESOURCE });
    if (!panel?.contents?.some(item => item.uri === RESOURCE && typeof item.text === 'string' && item.text.length > 0)) {
      throw new Error('GENGEN did not return its authenticated project panel.');
    }
  } finally { rpc.close(); }
}

export function login(cli, timeoutMs = 300_000) {
  return new Promise((resolveLogin, reject) => {
    const child = spawn(cli, LOGIN_ARGS, { stdio: 'inherit' });
    let timedOut = false;
    let cancelled = false;
    const cancel = () => { cancelled = true; child.kill(); };
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
    }
    child.once('error', () => { cleanup(); reject(new Error('Codex could not start browser authorization.')); });
    child.once('exit', code => {
      cleanup();
      if (code === 0 && !timedOut && !cancelled) resolveLogin();
      else reject(new Error(timedOut ? 'GENGEN authorization timed out. Start a fresh authorization attempt.' : 'GENGEN authorization did not complete.'));
    });
  });
}

export async function connect({ cli, checkOnly = false, reauthorize = false, verify = verifyConnection, authorize = login, write = console.log }) {
  if (!reauthorize) {
    try {
      write('Checking the GENGEN connection...');
      await verify(cli);
      write('Connected to GENGEN. Authenticated tools and project panel verified.');
      return;
    } catch (error) { if (checkOnly || error.code === 'CANCELLED') throw error; }
  }
  write('Opening GENGEN authorization in your browser. Keep this command running while you sign in and approve the connection.');
  await authorize(cli);
  write('Authorization returned. Verifying the GENGEN connection...');
  await verify(cli);
  write('Connected to GENGEN. Authenticated tools and project panel verified.');
}

export async function main(args = process.argv.slice(2)) {
  let explicit;
  const remaining = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--codex' && args[i + 1]) explicit = args[++i];
    else remaining.push(args[i]);
  }
  if (remaining.some(arg => !['--check', '--reauthorize'].includes(arg)) || (remaining.includes('--check') && remaining.includes('--reauthorize'))) {
    throw new Error('Usage: node connect.mjs [--check | --reauthorize] [--codex /path/to/codex]');
  }
  const cli = resolveCodex(explicit);
  checkConfiguration(cli);
  await connect({ cli, checkOnly: remaining.includes('--check'), reauthorize: remaining.includes('--reauthorize') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`GENGEN connection not verified: ${error.message}\n${RETRY}`);
    process.exitCode = 1;
  });
}
