// Walks every route of the app on the Expo web build, in light and dark, as a signed-in seeded person (and
// the signed-out routes signed out), and records what a person would hit: console errors and warnings,
// uncaught exceptions, failed network requests, API responses of 400 or more, blank pages and redirects.
//
//   node scripts/qa/walk-routes.mjs                    # both themes, writes e2e/.artifacts/route-walk/
//   node scripts/qa/walk-routes.mjs --shots            # also a screenshot per route and theme
//   node scripts/qa/walk-routes.mjs --contrast         # also the WCAG text-contrast check on every page
//   node scripts/qa/walk-routes.mjs --only wallet      # routes whose URL contains "wallet"
//   node scripts/qa/walk-routes.mjs --width 360 --height 640
//
// Needs the private stack (scripts/stack/up.mjs) and Expo web on WEB_URL (default http://localhost:8090) built with
// EXPO_PUBLIC_API_URL pointing at that stack. Routes come from app/ on disk: a route with no entry in
// `urlsFor` below is reported as "not walked", so a new screen cannot be forgotten silently.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../lib/cdp.mjs';
import { makeApi } from '../lib/api.mjs';
import { DESCRIBE, signInPage, warmBundle } from '../lib/web.mjs';
import { CONTRAST } from '../lib/contrast.mjs';
import { seedWorld } from '../e2e/world.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const web = flag('web', process.env.WEB_URL ?? 'http://localhost:8090');
const width = Number(flag('width', 390));
const height = Number(flag('height', 844));
const only = flag('only', '');
const shots = args.includes('--shots');
const contrast = args.includes('--contrast'); // also check text colour contrast on every page (WCAG 2.x)
const out = resolve(flag('out', join(root, 'e2e', '.artifacts', 'route-walk')));

// ---- routes on disk ----------------------------------------------------------------------------------------
function listRoutes(dir, base = '') {
  const routes = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes.push(...listRoutes(p, `${base}/${name}`));
    else if (/\.tsx$/.test(name) && !name.startsWith('_')) {
      const stem = name.replace(/\.tsx$/, '');
      routes.push(stem === 'index' ? base || '/' : `${base}/${stem}`);
    }
  }
  return routes;
}
// groups like (tabs) and (auth) are not part of the URL
const fileRoutes = listRoutes(join(root, 'app'))
  .map((r) => r.replace(/\/\([^)]+\)/g, '') || '/')
  .sort();

// ---- data for the dynamic segments ---------------------------------------------------------------------------
async function prepare() {
  const w = await seedWorld();
  const api = makeApi(w.api);
  const { alice, ben, cara } = w.users;
  const as = (u) => ({ token: u.token, ip: `10.9.9.${(u.userId.charCodeAt(0) % 200) + 1}` });
  const ok = async (p, what) => {
    const r = await p;
    if (r.status < 200 || r.status >= 300) throw new Error(`${what}: ${r.status} ${r.text}`);
    return r.json;
  };
  const ids = { username: ben.username };
  const convs = await ok(
    api.call('GET', '/conversations?filter=friends', as(alice)),
    'conversations',
  );
  ids.conversationId = convs.conversations.find((c) => c.peer?.username === ben.username).id;
  // a QR request (Ben asks anyone), a payment (Ben pays Alice) for a receipt
  const req = await ok(
    api.call('POST', '/wallet/requests', {
      ...as(ben),
      body: { amountKobo: 50000, note: 'walk', delivery: 'qr' },
    }),
    'request',
  );
  ids.code = (req.request ?? req).code;
  await ok(
    api.call('POST', '/wallet/send', {
      ...as(ben),
      body: {
        toUserId: alice.userId,
        amountKobo: 10000,
        note: 'walk',
        idempotencyKey: `walk-${randomUUID()}`,
      },
    }),
    'send',
  );
  const hist = await ok(api.call('GET', '/wallet/history', as(alice)), 'history');
  ids.txnId = hist.items[0].id;
  // a group (alice, ben, cara)
  const group = await ok(
    api.call('POST', '/conversations/groups', {
      ...as(alice),
      body: { id: randomUUID(), title: 'Walk group', memberIds: [ben.userId, cara.userId] },
    }),
    'group',
  );
  ids.groupId = group.id ?? group.conversation?.id;
  // a live match (Free Pig, accepted) and a finished one (Ben resigns)
  const mk = async (resign) => {
    const id = randomUUID();
    await ok(
      api.call('POST', '/matches', {
        ...as(alice),
        body: { id, conversationId: ids.conversationId, gameSlug: '_example', mode: 'free' },
      }),
      'match',
    );
    await ok(api.call('POST', `/matches/${id}/accept`, as(ben)), 'accept');
    if (resign) await ok(api.call('POST', `/matches/${id}/resign`, as(ben)), 'resign');
    return id;
  };
  ids.matchId = await mk(false);
  ids.finishedMatchId = await mk(true);
  // a space (Whot, Free, host starts) and its join code
  const space = await ok(
    api.call('POST', '/spaces', {
      ...as(alice),
      body: {
        id: randomUUID(),
        name: 'Walk space',
        gameSlug: 'whot',
        maxSeats: 2,
        visibility: 'friends',
        startRule: 'host',
      },
    }),
    'space',
  );
  ids.spaceId = space.id;
  ids.spaceCode = space.code;
  // an SMS invite for the guest web game
  const inv = await api.call('POST', '/invites', {
    ...as(alice),
    body: { phone: '0803 555 0123', country: 'NG', gameSlug: 'word-hunt' },
  });
  ids.inviteToken = inv.json?.token ?? null;
  return { world: w, ids };
}

/** [url, who] for every dynamic or static route. `who` is 'in' (signed in as Alice) or 'out'. */
function urlsFor(route, ids) {
  const sub = (s) => s;
  const table = {
    '/welcome': ['out'],
    '/phone': ['out'],
    '/username': ['in'],
    '/r/[code]': [`/r/${ids.code}`, 'in'],
    '/s/[code]': [`/s/${ids.spaceCode}`, 'in'],
    '/u/[username]': [`/u/${ids.username}`, 'in'],
    '/i/[token]': ids.inviteToken ? [`/i/${ids.inviteToken}`, 'out'] : null,
    '/i/[token]/play': ids.inviteToken ? [`/i/${ids.inviteToken}/play`, 'out'] : null,
    '/i/[token]/join': ids.inviteToken ? [`/i/${ids.inviteToken}/join`, 'out'] : null,
    '/c/[conversationId]': [`/c/${ids.conversationId}`, 'in'],
    '/chat-info/[conversationId]': [`/chat-info/${ids.conversationId}`, 'in'],
    '/group-info/[conversationId]': [`/group-info/${ids.groupId}`, 'in'],
    '/group-add/[conversationId]': [`/group-add/${ids.groupId}`, 'in'],
    '/dispute/[matchId]': [`/dispute/${ids.finishedMatchId}`, 'in'],
    '/g/[matchId]': [`/g/${ids.matchId}`, 'in'],
    '/g/[matchId]/result': [`/g/${ids.finishedMatchId}/result`, 'in'],
    '/onboarding/[step]': [`/onboarding/bonus`, 'in'],
    '/settings/legal/[doc]': [`/settings/legal/terms`, 'in'],
    '/space/[spaceId]': [`/space/${ids.spaceId}`, 'in'],
    '/space/[spaceId]/result': [`/space/${ids.spaceId}/result`, 'in'],
    '/wallet/pay/[code]': [`/wallet/pay/${ids.code}`, 'in'],
    '/wallet/receipt/[txnId]': [`/wallet/receipt/${ids.txnId}`, 'in'],
    '/wallet/request/[code]': [`/wallet/request/${ids.code}`, 'in'],
  };
  void sub;
  if (route in table) {
    const t = table[route];
    if (!t) return null;
    return t.length === 1 ? [route, t[0]] : t;
  }
  if (route.includes('[')) return null; // a dynamic route nobody wrote a value for: "not walked"
  return [route, 'in'];
}

// ---- the walk ------------------------------------------------------------------------------------------------------
await warmBundle(web);
const { world, ids } = await prepare();
const alice = world.users.alice;
const chrome = await launchChrome({ width, height });
const page = await chrome.newPage();
mkdirSync(out, { recursive: true });

let events = [];
page.on('Runtime.consoleAPICalled', (e) => {
  const text = e.args.map((a) => a.value ?? a.description ?? '').join(' ');
  if (e.type === 'error') events.push({ kind: 'console.error', text: text.slice(0, 300) });
  else if (e.type === 'warning') events.push({ kind: 'console.warn', text: text.slice(0, 300) });
});
page.on('Runtime.exceptionThrown', (e) =>
  events.push({
    kind: 'exception',
    text: (e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text ?? '').slice(
      0,
      300,
    ),
  }),
);
page.on('Log.entryAdded', (e) => {
  if (e.entry.level === 'error')
    events.push({ kind: 'log.error', text: `${e.entry.text} ${e.entry.url ?? ''}`.slice(0, 300) });
});
const reqUrl = new Map();
page.on('Network.requestWillBeSent', (e) =>
  reqUrl.set(e.requestId, `${e.request.method} ${e.request.url}`),
);
page.on('Network.loadingFailed', (e) => {
  if (e.canceled) return;
  events.push({
    kind: 'request.failed',
    text: `${reqUrl.get(e.requestId) ?? e.requestId}: ${e.errorText}`,
  });
});
page.on('Network.responseReceived', (e) => {
  if (e.response.status >= 400 && !/\/(favicon|manifest)/.test(e.response.url))
    events.push({
      kind: `http.${e.response.status}`,
      text: `${reqUrl.get(e.requestId) ?? ''}`.slice(0, 200),
    });
});

const rows = [];
const notWalked = [];
for (const route of fileRoutes) {
  const t = urlsFor(route, ids);
  if (!t) {
    notWalked.push(route);
    continue;
  }
  const [url, who] = t;
  if (only && !url.includes(only)) continue;
  for (const scheme of ['light', 'dark']) {
    await page.setColorScheme(scheme);
    events = [];
    const t0 = Date.now();
    if (who === 'in') await signInPage(page, web, alice);
    else {
      await page.goto(web, { wait: 200 });
      await page.eval('localStorage.clear(); true');
    }
    events = []; // the sign-in page load is not part of this route
    await page.goto(web + url, { wait: 1500 });
    await sleep(800);
    const d = await page.eval(DESCRIBE).catch(() => ({ url: '?', text: '', items: [] }));
    // a web page that never paints text is a blank screen
    const blank = d.text.length < 3;
    const unlabeled = d.items.filter(
      (i) =>
        ['button', 'link', 'tab', 'switch', 'radio', 'checkbox'].includes(i.role) &&
        !i.label &&
        !i.text,
    ).length;
    if (shots)
      await page
        .screenshot(join(out, `${url.replace(/[^\w]+/g, '_') || 'root'}.${scheme}.png`))
        .catch(() => undefined);
    rows.push({
      route,
      url,
      who,
      scheme,
      finalPath: d.url,
      redirected: d.url !== url.split('?')[0],
      blank,
      textStart: d.text.slice(0, 100),
      unlabeledControls: unlabeled,
      contrast: contrast ? await page.eval(CONTRAST).catch(() => null) : null,
      events: [...new Map(events.map((e) => [`${e.kind}|${e.text}`, e])).values()],
      ms: Date.now() - t0,
    });
    process.stdout.write(
      `${blank ? 'BLANK' : 'ok   '} ${scheme.padEnd(5)} ${url}${d.url !== url ? ` -> ${d.url}` : ''}  (${rows.at(-1).events.length} events)\n`,
    );
  }
}
chrome.close();

// ---- report ---------------------------------------------------------------------------------------------------------
const bad = rows.filter((r) => r.blank || r.events.some((e) => e.kind !== 'console.warn'));
const lines = [
  `# Route walk`,
  ``,
  `Run ${new Date().toISOString()} on the Expo web build at ${web} (${width}x${height}), API ${world.api}.`,
  `${fileRoutes.length} routes on disk, ${new Set(rows.map((r) => r.route)).size} walked in light and dark (${rows.length} page loads), ${notWalked.length} not walked.`,
  ``,
  `| Route | Theme | Final path | Blank | Events (errors / warnings) | Unlabelled controls |`,
  `| --- | --- | --- | --- | --- | --- |`,
  ...rows.map((r) => {
    const errs = r.events.filter((e) => e.kind !== 'console.warn').length;
    const warns = r.events.length - errs;
    return `| ${r.url} | ${r.scheme} | ${r.finalPath}${r.redirected ? ' (redirected)' : ''} | ${r.blank ? 'YES' : ''} | ${errs} / ${warns} | ${r.unlabeledControls} |`;
  }),
  ``,
  ...(contrast
    ? [
        `## Text contrast (WCAG 2.x: 4.5:1, large text 3:1)`,
        ``,
        `| Route | Theme | Checked | Skipped (image or gradient behind) | Failing |`,
        `| --- | --- | --- | --- | --- |`,
        ...rows
          .filter((r) => r.contrast)
          .map(
            (r) =>
              `| ${r.url} | ${r.scheme} | ${r.contrast.checked} | ${r.contrast.skipped} | ${r.contrast.fails.length} |`,
          ),
        ``,
        ...rows
          .filter((r) => r.contrast?.fails.length)
          .flatMap((r) => [
            `### ${r.url} (${r.scheme})`,
            ...r.contrast.fails
              .slice(0, 12)
              .map(
                (f) =>
                  `- ${f.ratio}:1 (needs ${f.need}) ${f.size}px "${f.text}" ${f.fg} on ${f.bg}`,
              ),
            ``,
          ]),
      ]
    : []),
  `## Pages with problems`,
  ``,
  ...(bad.length
    ? bad.flatMap((r) => [
        `### ${r.url} (${r.scheme})`,
        ...(r.blank ? ['- blank page'] : []),
        ...r.events.map((e) => `- ${e.kind}: ${e.text}`),
        ``,
      ])
    : [`None.`]),
  `## Routes not walked`,
  ``,
  ...(notWalked.length ? notWalked.map((r) => `- ${r}`) : [`None.`]),
  ``,
];
writeFileSync(join(out, 'route-walk.md'), lines.join('\n'));
writeFileSync(
  join(out, 'route-walk.json'),
  JSON.stringify({ at: new Date().toISOString(), web, width, height, rows, notWalked }, null, 2),
);
console.log(
  `\n${rows.length} page loads, ${bad.length} with problems, ${notWalked.length} routes not walked. Report: ${relative(root, join(out, 'route-walk.md'))}`,
);
process.exit(0);
