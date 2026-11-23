// Shared pieces of the load scripts: machine description, concurrency pool, latency summaries, process
// sampling (CPU and memory of the API, game server and database), user creation and the result writer.
// Every number printed or saved by the scripts is measured; nothing is estimated.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpus, platform, release, totalmem } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeApi, onboard, readStack, summarize } from '../lib/api.mjs';

export { makeApi, readStack, summarize };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const here = dirname(fileURLToPath(import.meta.url));
export const resultsDir = join(here, 'results');
const backend = resolve(process.env.DYCE_BACKEND ?? join(here, '..', '..', '..', 'dyce-backend'));

/** What the numbers were measured on. The machine was also running other work (see `note`). */
export function machine() {
  const c = cpus();
  return {
    os: `${platform()} ${release()}`,
    cpu: c[0]?.model.trim(),
    logicalCores: c.length,
    memoryGB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
    note: 'one machine runs the load generator, the API, the game server and PostgreSQL together, and other tools were running on it',
  };
}

/** Runs fn(i) for i in 0..n-1 with at most `concurrency` in flight. Returns the results in order. */
export async function pool(n, concurrency, fn) {
  const out = new Array(n);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      out[i] = await fn(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, worker));
  return out;
}

/** Counts of anything by key (status codes, error codes). */
export class Tally {
  constructor() {
    this.m = new Map();
  }
  add(k, by = 1) {
    this.m.set(k, (this.m.get(k) ?? 0) + by);
  }
  toJSON() {
    return Object.fromEntries([...this.m.entries()].sort());
  }
}

/**
 * CPU seconds and working-set MB of some processes, sampled with PowerShell (Windows) or ps. Sampling is
 * asynchronous and one process-list call per sample: a blocking sample would stall the load generator's own event
 * loop and show up as latency in the numbers (an early version did exactly that).
 */
export function sampleProcesses(pids, everyMs = 5000) {
  const live = Object.entries(pids).filter(([, pid]) => Number.isInteger(pid));
  if (!live.length) return { stop: async () => ({}) };
  const win = platform() === 'win32';
  const read = () =>
    new Promise((resolveRead) => {
      const ids = live.map(([, pid]) => pid).join(',');
      const cmd = win ? 'powershell' : 'ps';
      const cmdArgs = win
        ? [
            '-NoProfile',
            '-Command',
            `Get-Process -Id ${ids} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.CPU) $($_.WorkingSet64)" }; "LOAD $((Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average)"`,
          ]
        : ['-o', 'pid=,cputime=,rss=', '-p', ids];
      execFile(cmd, cmdArgs, { encoding: 'utf8' }, (_err, stdout) => {
        const out = {};
        for (const line of String(stdout ?? '').split(/\r?\n/)) {
          const load = /^LOAD\s+([\d.]+)/.exec(line);
          if (load) hostLoad.push(Number(load[1]));
          const m = /^\s*(\d+)\s+([\d.]+)\s+(\d+)/.exec(line);
          if (!m) continue;
          const name = live.find(([, pid]) => pid === Number(m[1]))?.[0];
          if (name)
            out[name] = {
              cpuSeconds: Number(m[2]),
              rssMB: win ? Number(m[3]) / 1048576 : Number(m[3]) / 1024,
            };
        }
        resolveRead(out);
      });
    });
  const hostLoad = []; // whole-machine CPU load %, one reading per sample: the load generator, the stack and other work
  const t0 = Date.now();
  let first = null;
  const peaks = {};
  let stopped = false;
  const ready = read().then((r) => (first = r));
  const loop = (async () => {
    await ready;
    while (!stopped) {
      await new Promise((r) => setTimeout(r, everyMs));
      if (stopped) break;
      const now = await read();
      for (const [k, v] of Object.entries(now)) peaks[k] = Math.max(peaks[k] ?? 0, v.rssMB);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await ready;
      const last = await read();
      void loop;
      const secs = (Date.now() - t0) / 1000;
      const out = {};
      for (const [k, v] of Object.entries(last)) {
        const f = first?.[k];
        out[k] = {
          rssMBEnd: Math.round(v.rssMB),
          rssMBPeakSampled: Math.round(Math.max(peaks[k] ?? 0, v.rssMB)),
          // CPU time used during the run as a share of one core (100 = one full core)
          cpuPercentOfOneCore: f
            ? Math.round(((v.cpuSeconds - f.cpuSeconds) / secs) * 1000) / 10
            : null,
        };
      }
      if (hostLoad.length)
        out.hostCpuLoadPercent = {
          samples: hostLoad.length,
          avg: Math.round((hostLoad.reduce((a, b) => a + b, 0) / hostLoad.length) * 10) / 10,
          max: Math.max(...hostLoad),
        };
      return out;
    },
  };
}

/** Child process ids written by scripts/stack/up.mjs (api, game, db). */
export function stackPids() {
  const s = readStack();
  return { api: s.apiPid, game: s.gamePid, db: s.dbPid };
}

/** Onboards `count` people (run-unique numbers) at the given concurrency. Returns [{ userId, token, ip, ... }]. */
export async function makeUsers(
  count,
  { concurrency = 12, label = 'u', stack = readStack() } = {},
) {
  const api = makeApi(stack.api);
  const base = 1_000_000 + Math.floor(Math.random() * 6_000_000);
  const run = Date.now().toString(36).slice(-4);
  const users = await pool(count, concurrency, async (i) => {
    // an IP of its own per person, as in production, so the per-IP rate limits behave as they would
    return onboard(api, stack.otp, base + i * 3, {
      username: `${label}${run}${i}`,
      displayName: `${label} ${i}`,
    });
  });
  return users;
}

export const heading = (t) => console.log(`\n=== ${t}`);

/** Prints and saves a result as scripts/load/results/<name>-<date>.json. */
export function saveResult(name, data) {
  mkdirSync(resultsDir, { recursive: true });
  const at = new Date().toISOString();
  const doc = { name, at, machine: machine(), ...data };
  const file = join(resultsDir, `${name}-${at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(doc, null, 2));
  console.log(`\nresult saved: ${file}`);
  return doc;
}

/** colyseus.js and @dyce/games from the backend checkout (they are not dependencies of this repo). */
export async function backendModules() {
  const req = createRequire(join(backend, 'apps', 'game-server', 'package.json'));
  const { Client } = req('colyseus.js');
  const games = await import(pathToFileURL(req.resolve('@dyce/games')).href);
  return { Client, games };
}

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** `pg` from the backend checkout (for the diagnostics that look at the database directly). */
export function backendPg() {
  const req = createRequire(join(backend, 'apps', 'api', 'package.json'));
  return req('pg');
}
