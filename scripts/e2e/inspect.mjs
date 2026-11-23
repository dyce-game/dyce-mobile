// Authoring aid: signs a seeded person in, opens a route on the web build and prints what is on screen
// (labels and text), i.e. what a Maestro `text:` selector can match. Not part of the test run.
//   node scripts/e2e/inspect.mjs /wallet [--as alice] [--dark]
import { launchChrome } from '../lib/cdp.mjs';
import { DESCRIBE, readSeed, signInPage } from '../lib/web.mjs';

const args = process.argv.slice(2);
// (Git Bash rewrites a leading-slash argument into a Windows path, so a route may also be given without it.)
const raw = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--as') ?? 'chat';
const route = '/' + raw.split('/').filter(Boolean).join('/');
const as = args.includes('--as') ? args[args.indexOf('--as') + 1] : 'alice';
const seed = readSeed();
const base = process.env.WEB_URL ?? seed.webOrigin;
const chrome = await launchChrome();
const page = await chrome.newPage();
if (args.includes('--dark')) await page.setColorScheme('dark');
await signInPage(page, base, seed.users[as]);
await page.goto(base + route, { wait: 1200 });
const d = await page.eval(DESCRIBE);
console.log(d.url, '\n', d.text, '\n');
for (const i of d.items)
  console.log(
    `[${i.role}] label=${JSON.stringify(i.label)} text=${JSON.stringify(i.text)}${i.ph ? ` placeholder=${i.ph}` : ''}`,
  );
chrome.close();
