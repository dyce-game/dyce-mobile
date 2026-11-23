// Boot smoke for the web export (the guest invite game): serves ./dist the way a static host would and checks that
// the page and its script load, and (when EXPECT_API_URL is set) that the bundle was built against that API.
//
//   pnpm export:web && node tools/release/check-web-export.mjs
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const problems = [];
const check = (ok, msg) => ok || problems.push(msg);

check(
  existsSync(join(dist, 'index.html')),
  'dist/index.html is missing: run `pnpm export:web` first',
);
if (problems.length > 0) fail();

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
check(scripts.length > 0, 'index.html has no <script src>');

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = join(dist, decodeURIComponent((req.url ?? '/').split('?')[0]));
  const file = existsSync(path) && statSync(path).isFile() ? path : join(dist, 'index.html'); // SPA fallback
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const page = await fetch(`${base}/`);
  check(page.status === 200, `GET / answered ${page.status}`);
  const bundles = [];
  for (const src of scripts) {
    const res = await fetch(new URL(src, `${base}/`));
    check(res.status === 200, `GET ${src} answered ${res.status}`);
    bundles.push(await res.text());
  }
  const code = bundles.join('\n');
  check(code.length > 0, 'the JavaScript bundle is empty');
  if (process.env.EXPECT_API_URL) {
    check(
      code.includes(process.env.EXPECT_API_URL),
      `the bundle does not contain ${process.env.EXPECT_API_URL} (built against the wrong API?)`,
    );
  }
} finally {
  server.close();
}

if (problems.length > 0) fail();
console.log(`web export OK: index.html + ${scripts.length} script(s) served and sane`);

function fail() {
  console.error(
    `web export: ${problems.length} problem(s)\n` + problems.map((m) => `  - ${m}`).join('\n'),
  );
  process.exit(1);
}
