// A colour-contrast check that runs inside the page (WCAG 2.x): for every visible element that has its own text,
// the ratio between its text colour and the first opaque background behind it. Normal text needs 4.5:1; large text
// (24 px, or 18.66 px and bold) needs 3:1. Elements over an image or a gradient are skipped and counted, because
// a computed background colour says nothing about them.

// Serialised with toString() and run in the page, so it must not close over anything.
function contrastInPage() {
  const parse = (c) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const bgOf = (el) => {
    // stack of translucent layers up to the first opaque one, composited from the bottom up
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // an image or a gradient
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.99) break;
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (!layers.length || layers[layers.length - 1].a < 0.99)
      base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--)
      base = layers[i].a >= 0.99 ? layers[i] : over(layers[i], base);
    return base;
  };
  const fails = [];
  let checked = 0;
  let skipped = 0;
  const vw = innerWidth;
  const vh = innerHeight;
  for (const el of document.body.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw)
      continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const fg0 = parse(cs.color);
    const bg = bgOf(el);
    if (!fg0 || !bg) {
      skipped++;
      continue;
    }
    const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    checked++;
    if (ratio < need)
      fails.push({
        text: own
          .map((n) => n.textContent.trim())
          .join(' ')
          .slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
        need,
        size: Math.round(size),
        fg: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      });
  }
  return { checked, skipped, fails };
}
export const CONTRAST = `(${contrastInPage.toString()})()`;
