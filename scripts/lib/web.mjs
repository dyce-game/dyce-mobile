// Helpers for driving the Expo web build: signing a seeded person in (localStorage) and describing a page.
import { readFileSync } from 'node:fs';
import { SEED_FILE } from './api.mjs';

export const readSeed = () => JSON.parse(readFileSync(SEED_FILE, 'utf8'));

/** Puts a session in localStorage as the app stores it, so the next load is signed in. */
export async function signInPage(page, base, user) {
  await page.goto(base, { wait: 300 });
  const session = {
    tokens: { accessToken: user.token, refreshToken: user.refreshToken },
    userId: user.userId,
    nextStep: 'done',
    country: 'NG',
  };
  await page.eval(
    `localStorage.setItem('dyce.session.v1', ${JSON.stringify(JSON.stringify(session))}); true`,
  );
}

// Runs inside the page (serialised with toString), so it must not close over anything.
function describeInPage() {
  const vw = innerWidth;
  const vh = innerHeight;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  const items = [];
  const sel =
    '[aria-label],[role=button],[role=link],[role=tab],[role=switch],[role=radio],[role=checkbox],input,textarea,button,a,[tabindex]';
  for (const el of document.body.querySelectorAll(sel)) {
    if (!vis(el)) continue;
    const text = (el.innerText || '').trim().split(/\s+/).join(' ');
    items.push({
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      label: el.getAttribute('aria-label'),
      text: text.slice(0, 60),
      ph: el.getAttribute('placeholder'),
      tabbable: el.tabIndex >= 0,
    });
  }
  return {
    url: location.pathname,
    text: document.body.innerText.trim().split(/\n+/).join(' | ').slice(0, 900),
    items,
  };
}
export const DESCRIBE = `(${describeInPage.toString()})()`;

/** Requests the page and its JS bundle once so Metro has it built (it can take minutes on a busy machine). */
export async function warmBundle(base, log = console.log) {
  const t0 = Date.now();
  try {
    const html = await (await fetch(base, { signal: AbortSignal.timeout(300_000) })).text();
    const src = /src="([^"]*\.bundle[^"]*)"/.exec(html)?.[1];
    if (src) {
      const res = await fetch(new URL(src, base), { signal: AbortSignal.timeout(480_000) });
      await res.arrayBuffer();
      if (!res.ok) log(`warning: the web bundle returned ${res.status}`);
    }
    log(`web bundle ready in ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (e) {
    log(`warning: could not warm the web bundle (${e.message})`);
  }
}
