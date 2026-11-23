// A tiny Chrome DevTools Protocol client with no dependencies (Node 22 has a global WebSocket).
// Used by the route walker and the Maestro-subset runner. It launches a local headless Chrome or Edge.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  return found;
}

export class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers.get(msg.method) ?? []) h(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  }
  /** Navigates, waits for the load event, then until the app has painted some text (first load ~10 s). */
  async goto(url, { wait = 300, ready = true } = {}) {
    const loaded = new Promise((resolve) => {
      const t = setTimeout(resolve, 30000);
      this.on('Page.loadEventFired', () => {
        clearTimeout(t);
        resolve();
      });
    });
    await this.send('Page.navigate', { url });
    await loaded;
    await sleep(wait);
    if (ready)
      await this.waitFor(
        () => this.eval('document.body && document.body.innerText.trim().length > 0'),
        {
          timeout: 30000,
          what: `${url} to render`,
        },
      ).catch(() => undefined);
  }
  async waitFor(fn, { timeout = 15000, every = 150, what = 'condition' } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      let v;
      try {
        v = await Promise.race([fn(), sleep(5000).then(() => null)]);
      } catch {
        v = null;
      }
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(every);
    }
  }
  async setColorScheme(scheme) {
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    });
  }
  async setViewport(width, height, scale = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false,
    });
  }
  async click(x, y) {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await this.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: type === 'mouseMoved' ? 'none' : 'left',
        clickCount: type === 'mouseMoved' ? 0 : 1,
      });
  }
  async insertText(text) {
    await this.send('Input.insertText', { text });
  }
  async key(key) {
    const codes = { Enter: 13, Backspace: 8, Escape: 27, Tab: 9 };
    const base = { key, windowsVirtualKeyCode: codes[key] ?? 0, code: key };
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      ...base,
      text: key === 'Enter' ? '\r' : undefined,
    });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  async screenshot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
  close() {
    this.ws.close();
  }
}

export async function launchChrome({
  port = 9333,
  width = 390,
  height = 844,
  headless = true,
} = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'dyce-chrome-'));
  const proc = spawn(
    findChrome(),
    [
      headless ? '--headless=new' : '',
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${userData}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      'about:blank',
    ].filter(Boolean),
    { stdio: 'ignore' },
  );
  let version = null;
  for (let i = 0; i < 80 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!version) {
    proc.kill();
    throw new Error('Chrome did not start');
  }
  const newPage = async () => {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const target = await res.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    const page = new Page(ws);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Log.enable');
    await page.setViewport(width, height);
    page.targetId = target.id;
    return page;
  };
  return {
    version: version.Browser,
    newPage,
    close: () => {
      proc.kill();
      setTimeout(() => {
        try {
          rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
        } catch {
          /* Windows keeps cache files locked for a moment; the temp dir is cleaned by the OS later */
        }
      }, 2500).unref?.();
    },
  };
}
