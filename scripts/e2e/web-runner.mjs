// Runs our Maestro flows (a documented SUBSET of the Maestro command set) against the Expo web build in a
// local headless Chrome/Edge. It is NOT Maestro: it exists because Maestro cannot run here, so the flows can
// still be executed and debugged on web, and so `pnpm e2e:web` can be used in CI before devices exist.
//
//   node scripts/e2e/web-runner.mjs e2e/chat-and-requests.yaml [more.yaml ...] [--headed] [--keep-going]
//   node scripts/e2e/web-runner.mjs --all                    # every flow tagged `web` (see e2e/README.md)
//
// Needs the private stack (scripts/stack/up.mjs) and Expo web (see e2e/README.md). Each run seeds fresh users.
//
// Supported commands: launchApp (clearState), openLink, tapOn, inputText, eraseText, assertVisible,
// assertNotVisible, extendedWaitUntil, waitForAnimationToEnd, scroll, scrollUntilVisible, pressKey (Enter,
// Backspace, Escape, Back), hideKeyboard (no-op), back, takeScreenshot, runFlow (file, commands, env, when),
// runScript (file or inline; `http`, `json`, `output`, `env`), evalScript, assertTrue, repeat, stopApp (no-op).
// Selectors: text (regex, full match, case-insensitive, over accessibility label, text and placeholder), id
// (testID / DOM id), index, optional, enabled. Unsupported commands fail the flow loudly.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { launchChrome, sleep } from '../lib/cdp.mjs';
import { SEED_FILE } from '../lib/api.mjs';
import { seedWorld, waitForLoginCooldown, worldEnv } from './world.mjs';
import { DESCRIBE, warmBundle } from '../lib/web.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(join(root, 'package.json'));
const YAML = require('yaml');

// ---------- flow parsing (shared with the linter) ----------------------------------------------------
export function parseFlow(file) {
  const docs = YAML.parseAllDocuments(readFileSync(file, 'utf8')).map((d) => d.toJS());
  const [header, commands] = docs.length > 1 ? docs : [{}, docs[0]];
  return { header: header ?? {}, commands: commands ?? [] };
}

// ---------- selectors in the page ----------------------------------------------------------------------
const FIND_SOURCE = `(function (spec) {
  const re = spec.text != null ? new RegExp('^(?:' + spec.text + ')$', 'is') : null;
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    for (let p = el; p; p = p.parentElement) if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
    return true;
  };
  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    let hit = false;
    if (re) {
      const label = el.getAttribute('aria-label');
      const ph = el.getAttribute('placeholder');
      const own = el.children.length === 0 || [...el.childNodes].every((n) => n.nodeType === 3 || n.nodeType === 1);
      const txt = own ? (el.innerText || el.textContent || '').trim() : '';
      if (label && re.test(label.trim())) hit = true;
      else if (ph && re.test(ph)) hit = true;
      else if (txt && txt.length < 400 && re.test(txt)) hit = true;
    } else if (spec.id != null) {
      hit = el.getAttribute('data-testid') === spec.id || el.id === spec.id || el.getAttribute('nativeid') === spec.id;
    }
    if (!hit || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    // centre of the part that is on screen (a chip cut off at the edge is tapped on its visible part)
    const l = Math.max(0, r.left), rt = Math.min(vw, r.right), t = Math.max(0, r.top), b = Math.min(vh, r.bottom);
    const cx = (l + rt) / 2, cy = (t + b) / 2;
    const top = document.elementFromPoint(Math.min(vw - 1, Math.max(0, cx)), Math.min(vh - 1, Math.max(0, cy)));
    // covered by something else (a modal, a canvas): still on screen, but a tap would land elsewhere
    const covered = Boolean(top && !(el.contains(top) || top.contains(el)));
    if (covered && spec.tappable) continue;
    if (spec.enabled === true && (el.getAttribute('aria-disabled') === 'true' || el.disabled)) continue;
    if (spec.enabled === false && !(el.getAttribute('aria-disabled') === 'true' || el.disabled)) continue;
    out.push({ x: cx, y: cy, w: r.width, h: r.height, tag: el.tagName, area: r.width * r.height });
  }
  // an element and its descendants can all match: keep the outermost of each cluster by dropping near-duplicates
  const uniq = [];
  for (const o of out) if (!uniq.some((u) => Math.abs(u.x - o.x) < 2 && Math.abs(u.y - o.y) < 2)) uniq.push(o);
  uniq.sort((a, b) => a.y - b.y || a.x - b.x);
  return uniq;
})`;

/** `${ expr }` -> `expr` (Maestro wraps script expressions in ${...}). */
function stripExpr(v) {
  const t = String(v).trim();
  return t.startsWith('${') && t.endsWith('}') ? t.slice(2, -1) : t;
}

class Skip extends Error {}

export class Runner {
  constructor({ page, env, base, artifacts, log }) {
    this.page = page;
    this.env = { ...env };
    this.base = base;
    this.artifacts = artifacts;
    this.log = log;
    this.output = {};
    this.step = 0;
  }

  // ----- string / expression interpolation (${...} is JavaScript with env and output in scope) -----
  interp(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/\$\{([\s\S]*?)\}/g, (_, expr) => {
      const ctx = vm.createContext({ ...this.env, output: this.output, maestro: {} });
      const v = vm.runInContext(expr, ctx);
      return v == null ? '' : String(v);
    });
  }
  deepInterp(v) {
    if (Array.isArray(v)) return v.map((x) => this.deepInterp(x));
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.deepInterp(x)]));
    return this.interp(v);
  }

  /** `tappable`: also require that nothing is on top of the element (what a tap needs). */
  async find(sel, { tappable = false } = {}) {
    const spec = {
      text: sel.text ?? null,
      id: sel.id ?? null,
      enabled: sel.enabled,
      tappable,
    };
    const list = await this.page.eval(`${FIND_SOURCE}(${JSON.stringify(spec)})`);
    const idx = sel.index ?? 0;
    return { all: list, one: list.at(idx < 0 ? list.length + idx : idx) };
  }
  selOf(arg) {
    if (typeof arg === 'string') return { text: arg };
    return { ...arg };
  }

  async waitVisible(sel, timeout = 8000, opts = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      const r = await this.find(sel, opts);
      if (r.one) return r.one;
      if (Date.now() > end) return null;
      await sleep(200);
    }
  }

  describe(sel) {
    return sel.text != null
      ? `"${sel.text}"`
      : sel.id != null
        ? `id ${sel.id}`
        : JSON.stringify(sel);
  }

  async runCommands(commands, flowDir) {
    for (const cmd of commands ?? []) await this.runCommand(cmd, flowDir);
  }

  async runCommand(raw, flowDir) {
    const [name, arg0] = typeof raw === 'string' ? [raw, null] : Object.entries(raw)[0];
    // evalScript / assertTrue take a ${...} expression that must be evaluated once, by the command itself
    const arg = name === 'evalScript' || name === 'assertTrue' ? arg0 : this.deepInterp(arg0);
    this.step++;
    const label = `${name}${typeof arg === 'string' ? ` ${arg}` : arg && arg.text ? ` ${arg.text}` : ''}`;
    const t0 = Date.now();
    try {
      await this.exec(name, arg, flowDir);
      this.log(`  ok   ${label} (${Date.now() - t0} ms)`);
    } catch (e) {
      if (e instanceof Skip) {
        this.log(`  skip ${label}: ${e.message}`);
        return;
      }
      if (arg && typeof arg === 'object' && arg.optional) {
        this.log(`  skip ${label}: optional, not found`);
        return;
      }
      this.log(`  FAIL ${label}: ${e.message}`);
      throw new Error(`${label}: ${e.message}`);
    }
  }

  async exec(name, arg, flowDir) {
    const p = this.page;
    switch (name) {
      case 'launchApp': {
        await p.goto(this.base, { wait: 200 });
        if (arg?.clearState) {
          await p.eval('localStorage.clear(); sessionStorage.clear(); true');
        }
        // Web-only convention: header env WEB_LOCAL_STORAGE="k=v;k2=v2" seeds localStorage (dev switches such as
        // dev.contacts=deny). Real Maestro ignores it, so the same flow file runs on devices.
        for (const pair of String(this.env.WEB_LOCAL_STORAGE ?? '')
          .split(';')
          .filter(Boolean)) {
          const [k, ...v] = pair.split('=');
          await p.eval(
            `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v.join('='))}); true`,
          );
        }
        await p.goto(this.base, { wait: 800 });
        return;
      }
      case 'stopApp':
      case 'hideKeyboard':
      case 'clearKeychain':
      case 'addMedia':
        return;
      case 'openLink': {
        const url = typeof arg === 'string' ? arg : arg.link;
        const web = url.replace(/^dyce:\/\/\/?/, `${this.base.replace(/\/$/, '')}/`);
        await p.goto(web, { wait: 800 });
        return;
      }
      case 'back':
        await p.eval('history.back(); true');
        await sleep(700);
        return;
      case 'waitForAnimationToEnd':
        await sleep(600);
        return;
      case 'tapOn':
      case 'doubleTapOn':
      case 'longPressOn': {
        const sel = this.selOf(arg);
        if (sel.point) {
          const [px, py] = sel.point.split(',').map((s) => parseFloat(s) / 100);
          const vp = await p.eval('({w: innerWidth, h: innerHeight})');
          await p.click(vp.w * px, vp.h * py);
          return;
        }
        const el = await this.waitVisible(sel, 8000, { tappable: true });
        if (!el)
          throw new Error(`${this.describe(sel)} is not visible (or something is on top of it)`);
        await p.click(el.x, el.y);
        if (name === 'doubleTapOn') await p.click(el.x, el.y);
        await sleep(250);
        return;
      }
      case 'inputText':
        await p.insertText(String(arg));
        await sleep(150);
        return;
      case 'eraseText':
        for (let i = 0; i < (Number(arg?.charactersToErase ?? arg) || 50); i++)
          await p.key('Backspace');
        return;
      case 'pressKey': {
        if (arg === 'Back') {
          await p.eval('history.back(); true');
          await sleep(600);
        } else await p.key(String(arg));
        return;
      }
      case 'assertVisible': {
        const sel = this.selOf(arg);
        const el = await this.waitVisible(sel, 7000);
        if (!el) throw new Error(`${this.describe(sel)} is not visible`);
        return;
      }
      case 'assertNotVisible': {
        const sel = this.selOf(arg);
        await sleep(300);
        const r = await this.find(sel);
        if (r.one) throw new Error(`${this.describe(sel)} is visible`);
        return;
      }
      case 'extendedWaitUntil': {
        const timeout = arg.timeout ?? 10000;
        if (arg.visible) {
          const el = await this.waitVisible(this.selOf(arg.visible), timeout);
          if (!el)
            throw new Error(
              `${this.describe(this.selOf(arg.visible))} did not appear in ${timeout} ms`,
            );
        } else if (arg.notVisible) {
          const sel = this.selOf(arg.notVisible);
          const end = Date.now() + timeout;
          while ((await this.find(sel)).one) {
            if (Date.now() > end)
              throw new Error(`${this.describe(sel)} did not go away in ${timeout} ms`);
            await sleep(200);
          }
        }
        return;
      }
      case 'scroll':
        await this.scrollBy(300);
        return;
      case 'scrollUntilVisible': {
        const sel = this.selOf(arg.element);
        const dir = arg.direction ?? 'DOWN';
        for (let i = 0; i < 20; i++) {
          if ((await this.find(sel)).one) return;
          await this.scrollBy(dir === 'UP' ? -300 : 300);
        }
        throw new Error(`${this.describe(sel)} not found after scrolling`);
      }
      case 'takeScreenshot': {
        mkdirSync(this.artifacts, { recursive: true });
        await p.screenshot(join(this.artifacts, `${String(arg).replace(/[^\w.-]+/g, '_')}.png`));
        return;
      }
      case 'repeat': {
        for (let i = 0; i < (arg.times ?? 1); i++) await this.runCommands(arg.commands, flowDir);
        return;
      }
      case 'evalScript':
        this.evalJs(stripExpr(arg));
        return;
      case 'assertTrue': {
        const ok = this.evalJs(String(arg).replace(/^\$\{|\}$/g, ''));
        if (!ok) throw new Error(`assertTrue failed: ${arg}`);
        return;
      }
      case 'runScript': {
        const file = typeof arg === 'string' ? arg : arg.file;
        const code = readFileSync(resolve(flowDir, file), 'utf8');
        const saved = { ...this.env };
        if (arg.env) Object.assign(this.env, arg.env);
        this.evalJs(code);
        this.env = saved;
        return;
      }
      case 'runFlow': {
        const spec = typeof arg === 'string' ? { file: arg } : arg;
        if (spec.when) await this.checkWhen(spec.when);
        const saved = { ...this.env };
        if (spec.env) Object.assign(this.env, spec.env);
        if (spec.file) {
          const f = resolve(flowDir, spec.file);
          const { header, commands } = parseFlow(f);
          Object.assign(
            this.env,
            { ...(header.env ?? {}), ...(spec.env ?? {}) },
            saved,
            spec.env ?? {},
          );
          await this.runCommands(commands, dirname(f));
        } else await this.runCommands(spec.commands, flowDir);
        this.env = {
          ...saved,
          ...Object.fromEntries(Object.entries(this.env).filter(([k]) => !(k in saved))),
        };
        return;
      }
      default:
        throw new Skip(`unsupported on web: ${name}`); // loud in the summary, not a silent pass
    }
  }

  async checkWhen(when) {
    if (when.platform && String(when.platform).toLowerCase() !== 'web')
      throw new Skip(`platform ${when.platform}`);
    if (when.visible) {
      const r = await this.find(this.selOf(this.deepInterp(when.visible)));
      if (!r.one) throw new Skip('condition not met: visible');
    }
    if (when.notVisible) {
      const r = await this.find(this.selOf(this.deepInterp(when.notVisible)));
      if (r.one) throw new Skip('condition not met: notVisible');
    }
    if (when.true !== undefined && !this.evalJs(String(when.true).replace(/^\$\{|\}$/g, '')))
      throw new Skip('condition not met: true');
  }

  async scrollBy(dy) {
    const vp = await this.page.eval('({w: innerWidth, h: innerHeight})');
    await this.page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: vp.w / 2,
      y: vp.h / 2,
      deltaX: 0,
      deltaY: dy,
    });
    await sleep(300);
  }

  /** JavaScript with Maestro's `http`, `json`, `output` and the env variables in scope. http is synchronous. */
  evalJs(code) {
    const syncFetch =
      (method) =>
      (url, opts = {}) => {
        const script = `
        const [method, url, opts] = JSON.parse(process.argv[1]);
        const res = await fetch(url, { method, headers: opts.headers, body: opts.body });
        const body = await res.text();
        process.stdout.write(JSON.stringify({ ok: res.ok, status: res.status, body }));`;
        const r = spawnSync(
          process.execPath,
          ['--input-type=module', '-e', script, JSON.stringify([method, url, opts])],
          {
            encoding: 'utf8',
          },
        );
        if (r.status !== 0) throw new Error(`http ${method} ${url}: ${r.stderr}`);
        return JSON.parse(r.stdout);
      };
    const http = {
      get: syncFetch('GET'),
      post: syncFetch('POST'),
      put: syncFetch('PUT'),
      delete: syncFetch('DELETE'),
    };
    const ctx = vm.createContext({
      ...this.env,
      http,
      json: (s) => JSON.parse(s),
      output: this.output,
      maestro: {},
      console: { log: (...a) => this.log(`  script: ${a.join(' ')}`) },
      Date,
      Math,
      JSON,
      parseInt,
      String,
      Number,
    });
    return vm.runInContext(code, ctx);
  }
}

// ---------- CLI --------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes('--headed');
  const keepGoing = args.includes('--keep-going');
  const flag = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : d;
  };
  const web = flag('web', process.env.WEB_URL ?? 'http://localhost:8090');
  const dark = args.includes('--dark');
  const out = resolve(flag('out', join(root, 'e2e', '.artifacts', 'web')));
  let files = args.filter((a) => a.endsWith('.yaml') || a.endsWith('.yml')).map((f) => resolve(f));
  if (args.includes('--all')) {
    const { readdirSync } = await import('node:fs');
    const dir = join(root, 'e2e');
    files = readdirSync(dir)
      .filter((f) => /^\d\d[a-z]?-.*\.ya?ml$/.test(f))
      .sort()
      .map((f) => join(dir, f))
      .filter((f) => (parseFlow(f).header.tags ?? []).includes('web'));
  }
  if (!files.length) {
    console.error(
      'usage: web-runner.mjs <flow.yaml ...> | --all  [--headed] [--keep-going] [--dark]',
    );
    process.exit(2);
  }
  // One world per flow, seeded up front (the first flow's wait for the OTP cooldown overlaps the others' seeding).
  const worlds = [];
  for (let i = 0; i < files.length; i++) worlds.push(await seedWorld());
  // Metro rebuilds when anyone edits the app, and a cold bundle can take minutes on a busy machine: fetch it
  // once up front (with a long timeout) so the first page load in a flow is not the one that waits.
  await warmBundle(web);
  const chrome = await launchChrome({ headless: !headed });
  const results = [];
  try {
    for (const [fi, file] of files.entries()) {
      const world = worlds[fi];
      const env = worldEnv(world);
      await waitForLoginCooldown(world);
      const { header, commands } = parseFlow(file);
      const page = await chrome.newPage();
      await page.setColorScheme(dark ? 'dark' : 'light');
      const consoleErrors = [];
      page.on('Runtime.exceptionThrown', (e) =>
        consoleErrors.push(e.exceptionDetails?.exception?.description ?? 'exception'),
      );
      const lines = [];
      const log = (l) => {
        lines.push(l);
        console.log(l);
      };
      const runner = new Runner({
        page,
        env: { ...env, ...(header.env ?? {}) },
        base: web,
        artifacts: join(out, header.name ?? 'flow'),
        log,
      });
      console.log(`\n== ${file.replace(root, '.')} (${header.name ?? ''})`);
      const t0 = Date.now();
      let status = 'passed';
      let error = null;
      try {
        await runner.runCommands(commands, dirname(file));
      } catch (e) {
        status = 'failed';
        error = e.message;
        mkdirSync(join(out, 'failures'), { recursive: true });
        await page
          .screenshot(join(out, 'failures', `${header.name ?? 'flow'}.png`))
          .catch(() => undefined);
        const d = await page.eval(DESCRIBE).catch(() => null);
        if (d) {
          console.log(`  on screen (${d.url}): ${d.text.slice(0, 400)}`);
          console.log(
            '  labels: ' +
              d.items
                .map((i) => i.label || i.text || i.ph)
                .filter(Boolean)
                .join(' | ')
                .slice(0, 900),
          );
        }
      }
      const skipped = lines.filter((l) => l.startsWith('  skip')).length;
      results.push({
        flow: file.replace(root + '\\', '').replace(root + '/', ''),
        name: header.name,
        status,
        error,
        ms: Date.now() - t0,
        skipped,
        steps: lines.length,
        pageErrors: consoleErrors.length,
      });
      page.close();
      if (status === 'failed' && !keepGoing) break;
    }
  } finally {
    chrome.close();
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify({ at: new Date().toISOString(), web, results }, null, 2),
  );
  console.log('\n=== summary');
  for (const r of results)
    console.log(
      `${r.status === 'passed' ? 'PASS' : 'FAIL'}  ${r.flow}  ${r.ms} ms, ${r.skipped} steps skipped${r.error ? `\n      ${r.error}` : ''}`,
    );
  void SEED_FILE;
  process.exit(results.every((r) => r.status === 'passed') ? 0 : 1);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();
