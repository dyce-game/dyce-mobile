// Lints the Maestro flows in e2e/ without a device: a dry run that needs neither Maestro nor the app running.
//
//   node scripts/e2e/lint-flows.mjs
//
// Checks, per flow and subflow:
//   - the YAML parses, has an `appId` header and a command list, and every command is a real Maestro command;
//   - `runFlow` / `runScript` files exist (relative to the file that uses them) and scripts parse;
//   - every ${VARIABLE} is defined: by the seed (scripts/e2e/world.mjs), the flow's own env, the caller's env,
//     or an earlier output.* assignment;
//   - every text selector (tapOn, assertVisible, extendedWaitUntil, scrollUntilVisible, when.visible) can be
//     matched by a string the app really contains: an accessibilityLabel, a visible text, a placeholder or a
//     title in src/, app/ or packages/ui/. A typo, or a label that was renamed, is caught here.
// The text check reads the source, so it is a strong hint and not a proof: a label built at run time is matched
// against its template (".+" for each hole), seeded names, usernames, amounts and counts count as holes, and the
// OS permission prompts (subflows/os-permission-*.yaml) are not in the app at all, so they are not checked.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');
const YAML = require('yaml');

const COMMANDS = new Set([
  'launchApp',
  'stopApp',
  'clearState',
  'clearKeychain',
  'openLink',
  'tapOn',
  'doubleTapOn',
  'longPressOn',
  'inputText',
  'eraseText',
  'pressKey',
  'hideKeyboard',
  'back',
  'scroll',
  'scrollUntilVisible',
  'swipe',
  'assertVisible',
  'assertNotVisible',
  'assertTrue',
  'assertWithAI',
  'extendedWaitUntil',
  'waitForAnimationToEnd',
  'takeScreenshot',
  'runFlow',
  'runScript',
  'evalScript',
  'repeat',
  'copyTextFrom',
  'pasteText',
  'setLocation',
  'travel',
  'addMedia',
  'startRecording',
  'stopRecording',
  'setAirplaneMode',
  'toggleAirplaneMode',
  'retry',
  'setOrientation',
  'killApp',
  'inputRandomText',
  'inputRandomNumber',
  'inputRandomEmail',
  'inputRandomPersonName',
  'openBrowser',
]);

// ---- every string the app can show -------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const literals = new Set(); // plain strings
const templates = []; // RegExps for strings with holes; each has a .prefix (the text before the first hole)
function addTemplate(parts) {
  // parts: strings and null (a hole)
  const fixed = parts.filter((p) => p !== null).join('').length;
  const holes = parts.filter((p) => p === null).length;
  // a template that is mostly holes ("${a}, ${b}") would match anything: keep those with real text
  if (fixed < 4 && !(holes >= 2 && fixed >= 2)) return;
  const src = parts
    .map((p) => (p === null ? '.+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  const re = new RegExp('^' + src + '$', 'si');
  re.prefix = parts[0] ?? '';
  templates.push(re);
}
for (const file of [
  ...walk(join(root, 'src')),
  ...walk(join(root, 'app')),
  ...walk(join(root, 'packages', 'ui', 'src')),
  ...walk(join(root, '..', 'dyce-backend', 'packages', 'shared', 'src')).filter((f) =>
    /schemas|bots|games/.test(f),
  ),
]) {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (t) literals.add(t);
    } else if (ts.isTemplateExpression(node)) {
      addTemplate([node.head.text, ...node.templateSpans.flatMap((s) => [null, s.literal.text])]);
    } else if (ts.isJsxText(node)) {
      const t = node.text
        .replace(/&apos;|&#39;|&rsquo;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
      if (t) literals.add(t);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** A flow selector (a regex over a whole label) -> do we know a string that could match it? Returns a reason or null. */
function knownText(pattern) {
  const filled = pattern.replace(/\$\{([^}]+)\}/g, 'X');
  let re;
  try {
    re = new RegExp(`^(?:${filled})$`, 'is');
  } catch {
    return `not a valid regular expression: ${pattern}`;
  }
  // 1. the regex matches a whole string the app has
  for (const lit of literals) if (re.test(lit)) return null;
  // 2. seeded names, usernames, amounts and counts are run-time values in the app: treat them as holes
  const holeify = (t) =>
    t
      .replace(/\b(Alice|Ben|Cara|Dami|Eze|Fola|Tunde|Ngozi) QA\b/g, 'X')
      .replace(/@?\b(tunde|ngozi)\.qa\b/g, 'X')
      .replace(/@X\b/g, 'X')
      .replace(/Ð[\d,.]+[kK]?/g, 'ÐX')
      .replace(/\b\d+\b/g, 'X');
  const alts = holeify(filled)
    .split('|')
    .map((alt) =>
      alt
        .replace(/\\(.)/g, '$1')
        .replace(/[()[\]?]/g, '')
        .trim(),
    )
    .filter(Boolean);
  for (const alt of alts) {
    const wildcard = /\.[*+]/.test(alt);
    const s = alt.replace(/\.[*+]/g, ' ').trim();
    if (/^(X\s*)+$/.test(s)) return null; // the whole label is a run-time value
    if (/^[−-]?ÐX$/.test(s)) return null; // an amount
    const hasHole = /\bX\b|ÐX/.test(s);
    // a literal that contains the sample (the pattern may be a prefix, or a part, of a longer label)
    if (wildcard && s.length > 2)
      for (const lit of literals) if (lit.toLowerCase().includes(s.toLowerCase())) return null;
    // a label built at run time whose fixed start is the template's ("Send Pig" = `Send ${gameName}`)
    if (
      !hasHole &&
      !wildcard &&
      templates.some((t) => t.prefix.length >= 4 && s.startsWith(t.prefix) && t.test(s))
    )
      return null;
    // a label with run-time parts: match the sample (and its leading name as a hole) against the templates
    if (hasHole || wildcard) {
      const heads = /[,.:·]/.test(s) ? [s, s.replace(/^[^,.:·]+/, 'X')] : [s];
      const variants = heads.flatMap((h) => [h, `${h} X`]);
      if (variants.some((v) => templates.some((t) => t.test(v)))) return null;
    }
  }
  return `no string in the app matches "${pattern}"`;
}

// ---- the flows ------------------------------------------------------------------------------------------------
const e2e = join(root, 'e2e');
const worldVars = new Set([
  'API_URL',
  'OTP',
  'NEW_PHONE_ALLOW',
  'NEW_PHONE_DENY',
  ...['ALICE', 'BEN', 'CARA', 'DAMI', 'EZE', 'FOLA', 'TUNDE', 'NGOZI'].flatMap((u) =>
    ['PHONE', 'USERNAME', 'NAME', 'ID', 'TOKEN'].map((f) => `${u}_${f}`),
  ),
]);
const problems = [];
const warn = (file, msg) => problems.push(`${relative(root, file)}: ${msg}`);

function parse(file) {
  try {
    const docs = YAML.parseAllDocuments(readFileSync(file, 'utf8'));
    for (const d of docs) if (d.errors.length) throw new Error(d.errors[0].message);
    const js = docs.map((d) => d.toJS());
    return js.length > 1
      ? { header: js[0] ?? {}, commands: js[1] }
      : { header: {}, commands: js[0] };
  } catch (e) {
    warn(file, `YAML error: ${e.message}`);
    return null;
  }
}

function checkVars(file, text, defined) {
  for (const m of String(text).matchAll(/\$\{([^}]+)\}/g)) {
    // identifiers used that are not output.*, or known
    for (const id of m[1].match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])
      if (!defined.has(id) && !worldVars.has(id))
        warn(file, `\${${id}} is not defined by the seed, the flow's env or the caller`);
  }
}

const isOsPrompt = (file) => /os-permission-/.test(file);

function lintCommands(file, commands, defined, state) {
  if (!Array.isArray(commands)) return warn(file, 'no command list after the `---` line');
  for (const raw of commands) {
    const [name, arg] = typeof raw === 'string' ? [raw, null] : Object.entries(raw)[0];
    if (!COMMANDS.has(name)) warn(file, `unknown Maestro command "${name}"`);
    checkVars(file, JSON.stringify(arg ?? ''), defined);
    const sels = [];
    if (['tapOn', 'doubleTapOn', 'longPressOn', 'assertVisible', 'assertNotVisible'].includes(name))
      sels.push(typeof arg === 'string' ? arg : arg?.text);
    if (name === 'extendedWaitUntil') sels.push(arg?.visible, arg?.notVisible);
    if (name === 'scrollUntilVisible')
      sels.push(typeof arg?.element === 'string' ? arg.element : arg?.element?.text);
    if (!isOsPrompt(file))
      for (const s of sels.filter((s) => typeof s === 'string')) {
        const why = knownText(s);
        if (why) warn(file, `${name}: ${why}`);
      }
    if (name === 'runFlow') {
      const spec = typeof arg === 'string' ? { file: arg } : arg;
      if (typeof spec.when?.visible === 'string' && !isOsPrompt(file)) {
        const why = knownText(spec.when.visible);
        if (why) warn(file, `runFlow when.visible: ${why}`);
      }
      const env = new Set([...defined, ...Object.keys(spec.env ?? {})]);
      if (spec.file) {
        const target = resolve(dirname(file), spec.file);
        if (!existsSync(target)) warn(file, `runFlow file not found: ${spec.file}`);
        else {
          const key = `${target}|${[...env].sort().join()}`;
          if (!state.seen.has(key)) {
            state.seen.add(key);
            const sub = parse(target);
            if (sub)
              lintCommands(
                target,
                sub.commands,
                new Set([...env, ...Object.keys(sub.header.env ?? {})]),
                state,
              );
          }
        }
      }
      if (spec.commands) lintCommands(file, spec.commands, env, state);
    }
    if (name === 'runScript') {
      const f = typeof arg === 'string' ? arg : arg?.file;
      const target = resolve(dirname(file), f ?? '');
      if (!f || !existsSync(target)) warn(file, `runScript file not found: ${f}`);
      else {
        const code = readFileSync(target, 'utf8');
        const scriptEnv = new Set([...defined, ...Object.keys(arg?.env ?? {})]);
        for (const id of new Set(code.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []))
          if (
            /^(API_URL|[A-Z]+_(TOKEN|USERNAME|PHONE|ID|NAME)|BEN_ACTION|BEN_SAYS|OTP)$/.test(id) &&
            !scriptEnv.has(id) &&
            !worldVars.has(id)
          )
            warn(file, `script ${f} needs ${id}, which is not defined here`);
        try {
          new Function(
            'http',
            'json',
            'output',
            ...[...scriptEnv].filter((k) => /^[A-Za-z_]\w*$/.test(k)),
            code,
          );
        } catch (e) {
          warn(target, `script does not parse: ${e.message}`);
        }
      }
    }
  }
}

const flows = readdirSync(e2e).filter((f) => /^\d\d.*\.ya?ml$/.test(f));
let checked = 0;
for (const f of flows) {
  const file = join(e2e, f);
  const flow = parse(file);
  if (!flow) continue;
  checked++;
  if (!flow.header.appId && !flow.header.url)
    warn(file, 'missing `appId` (or `url`) in the header');
  if (!flow.header.name) warn(file, 'missing `name` in the header');
  const defined = new Set([...worldVars, ...Object.keys(flow.header.env ?? {})]);
  lintCommands(file, flow.commands, defined, { seen: new Set() });
}
// subflows linted on their own too (with a generous env), so an unused one is still checked
const subDir = join(e2e, 'subflows');
if (existsSync(subDir))
  for (const f of readdirSync(subDir).filter((f) => /\.ya?ml$/.test(f))) {
    const file = join(subDir, f);
    const flow = parse(file);
    if (!flow) continue;
    checked++;
    lintCommands(file, flow.commands, new Set([...worldVars, 'PHONE', 'NOTIFICATIONS']), {
      seen: new Set(),
    });
  }
// the known-bug flows are reproductions of open bugs: they must stay valid, even though they fail until fixed
const bugDir = join(e2e, 'known-bugs');
if (existsSync(bugDir))
  for (const f of readdirSync(bugDir).filter((f) => /\.ya?ml$/.test(f))) {
    const file = join(bugDir, f);
    const flow = parse(file);
    if (!flow) continue;
    checked++;
    lintCommands(
      file,
      flow.commands,
      new Set([...worldVars, ...Object.keys(flow.header.env ?? {})]),
      { seen: new Set() },
    );
  }

console.log(
  `${checked} flow files checked, ${literals.size} literal strings and ${templates.length} label templates read from the app.`,
);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
  process.exit(1);
}
console.log(
  'OK: all flows parse, every file reference resolves, every variable is defined and every selector text exists in the app.',
);
