// Static accessibility audit of the app source (no device needed). It reads app/, src/ and packages/ui with the
// TypeScript compiler and lists, with file and line:
//   1. touchables with no accessible name: Pressable, Touch*, TextInput, Switch with no accessibilityLabel / aria-label
//      (a Pressable that wraps visible <Text> children is named by that text on screen readers, so those are listed
//      separately as "named by content only": fine for plain text, worth a look when the label should differ)
//   2. text that opts out of Dynamic Type: allowFontScaling={false}
//   3. maxFontSizeMultiplier below 1.3 (the app promises text grows to 1.3x)
//   4. images with no accessibilityLabel / alt and not hidden from screen readers
//   5. touch targets: hitSlop-less Pressables whose style sets a width or height below 44 (static values only)
//
//   node scripts/qa/a11y-audit.mjs [--json]
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const require = createRequire(join(root, 'package.json'));
const ts = require('typescript');

const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) out.push(p);
  }
  return out;
};

const TOUCH = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'TextInput',
  'Switch',
]);
const NAME_PROPS = new Set([
  'accessibilityLabel',
  'aria-label',
  'accessibilityLabelledBy',
  'aria-labelledby',
  'label',
]);
const found = {
  unnamed: [],
  contentOnly: [],
  noScale: [],
  lowMultiplier: [],
  imageNoLabel: [],
  smallTarget: [],
  spread: [],
};

for (const file of [
  ...walk(join(root, 'app')),
  ...walk(join(root, 'src')),
  ...walk(join(root, 'packages', 'ui', 'src')),
]) {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const at = (node) =>
    `${relative(root, file).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tag = node.tagName.getText(sf);
      const props = new Map(
        node.attributes.properties.filter(ts.isJsxAttribute).map((a) => [a.name.getText(sf), a]),
      );
      const hasSpread = node.attributes.properties.some(ts.isJsxSpreadAttribute);
      const val = (n) => {
        const a = props.get(n);
        return a?.initializer && ts.isJsxExpression(a.initializer)
          ? a.initializer.expression?.getText(sf)
          : a?.initializer?.getText(sf);
      };
      if (TOUCH.has(tag)) {
        // deliberately hidden from screen readers (a gesture surface behind a named control): not a problem
        const hiddenFromAT =
          props.has('accessibilityElementsHidden') ||
          props.has('aria-hidden') ||
          (props.has('accessible') && val('accessible') === 'false');
        const named = hiddenFromAT || [...NAME_PROPS].some((p) => props.has(p));
        if (!named && hasSpread)
          found.spread.push(
            `${at(node)} <${tag}> (props spread in: name may come from the caller)`,
          );
        else if (!named) {
          // does it contain text? (an opening element's parent JsxElement has the children)
          const parent = ts.isJsxOpeningElement(node) ? node.parent : null;
          const hasText = parent && /<Text|<[A-Z]\w*Text|>\s*[A-Za-z]/.test(parent.getText(sf));
          (hasText ? found.contentOnly : found.unnamed).push(`${at(node)} <${tag}>`);
        }
        // a static width / height under 44 in an inline style object, with no hitSlop
        const style = val('style') ?? '';
        const small = /\b(width|height|minWidth|minHeight)\s*:\s*(\d+)\b/g;
        let m;
        while ((m = small.exec(style)))
          if (Number(m[2]) < 44 && !props.has('hitSlop'))
            found.smallTarget.push(`${at(node)} <${tag}> ${m[1]}: ${m[2]}`);
      }
      if (props.has('allowFontScaling') && val('allowFontScaling') === 'false')
        found.noScale.push(`${at(node)} <${tag}>`);
      if (props.has('maxFontSizeMultiplier')) {
        const n = Number(val('maxFontSizeMultiplier'));
        if (Number.isFinite(n) && n < 1.3)
          found.lowMultiplier.push(`${at(node)} <${tag}> maxFontSizeMultiplier=${n}`);
      }
      if (/^(Image|ExpoImage|SvgImage)$/.test(tag)) {
        const named =
          props.has('accessibilityLabel') || props.has('alt') || props.has('aria-label');
        const hidden = props.has('accessible') ? val('accessible') === 'false' : false;
        const ariaHidden =
          props.has('aria-hidden') ||
          props.has('accessibilityElementsHidden') ||
          props.has('importantForAccessibility');
        if (!named && !hidden && !ariaHidden) found.imageNoLabel.push(`${at(node)} <${tag}>`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const sections = [
  ['Touchables with no accessible name (and no text inside)', 'unnamed'],
  ['Touchables named by their visible text only', 'contentOnly'],
  ['Touchables with props spread in (check the caller)', 'spread'],
  ['allowFontScaling={false}', 'noScale'],
  ['maxFontSizeMultiplier below 1.3', 'lowMultiplier'],
  ['Images with no label and not hidden from screen readers', 'imageNoLabel'],
  ['Touch targets with a static size under 44 and no hitSlop', 'smallTarget'],
];
const lines = [
  '# Accessibility audit (static)',
  '',
  `Run ${new Date().toISOString()} over app/, src/ and packages/ui/.`,
  '',
];
for (const [title, key] of sections) {
  lines.push(
    `## ${title}: ${found[key].length}`,
    '',
    ...(found[key].length ? found[key].map((l) => `- ${l}`) : ['None.']),
    '',
  );
}
const out = join(root, 'e2e', '.artifacts', 'a11y');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'a11y-audit.md'), lines.join('\n'));
writeFileSync(join(out, 'a11y-audit.json'), JSON.stringify(found, null, 2));
for (const [title, key] of sections)
  console.log(`${String(found[key].length).padStart(4)}  ${title}`);
console.log(`\nfull list: ${relative(root, join(out, 'a11y-audit.md'))}`);
