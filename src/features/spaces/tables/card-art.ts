import type { Face } from './faces';

/**
 * The card faces and backs as flat polygons, built from numbers (no images, no canvas, no fonts): so the same
 * cards draw on the phone's GL surface and in the browser, in one draw call per side. A card is 1 wide and
 * 1.5 tall, centred on the origin, y up. Layers keep paint in order (a higher layer sits above a lower one).
 *
 * Crazy Cards is our own design: a full-colour face with a big mark for the colour (heart, sun, leaf, drop),
 * a white number and the corner index, a dark "Crazy card" with a four-colour wheel. Whot! follows the
 * design's paper cards. No other game's card art is copied. Pure, tested for shape and bounds.
 */

export type Pt = readonly [number, number];
export type Poly = {
  pts: Pt[];
  color: string;
  /** If set, the colour fades from `color` (top) to `color2` (bottom) over the card. */
  color2?: string;
  layer: number;
};

// ---- colour ---------------------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = (i: 0 | 1 | 2) => Math.round(x[i] + (y[i] - x[i]) * t);
  return `#${[c(0), c(1), c(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const CRAZY_PALETTE = {
  red: ['#F2545B', '#D7262E', '#8E1218'],
  yellow: ['#FFD95A', '#F2B90F', '#A87A00'],
  green: ['#4CC27A', '#1F9A4E', '#0E5A2C'],
  blue: ['#4D93F0', '#1C6DD0', '#0D3F84'],
} as const;

const PAPER = '#F8F1E2';
const MAROON = '#6A1424';
const MAROON_FILL = '#7A1E2E';
const CREAM = '#F3E6CC';
const WILD_BODY = ['#3A3330', '#15120F'] as const;

// ---- geometry helpers -------------------------------------------------------------------------------

const rad = (d: number): number => (d * Math.PI) / 180;

export function circlePts(cx: number, cy: number, r: number, n = 28): Pt[] {
  return Array.from(
    { length: n },
    (_, i) =>
      [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)] as Pt,
  );
}

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });
}

export function roundedRect(cx: number, cy: number, w: number, h: number, r: number, n = 5): Pt[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return [
    ...arc(x1 - r, y1 - r, r, r, 0, 90, n),
    ...arc(x0 + r, y1 - r, r, r, 90, 180, n),
    ...arc(x0 + r, y0 + r, r, r, 180, 270, n),
    ...arc(x1 - r, y0 + r, r, r, 270, 360, n),
  ];
}

const rect = (cx: number, cy: number, w: number, h: number): Pt[] => [
  [cx - w / 2, cy - h / 2],
  [cx + w / 2, cy - h / 2],
  [cx + w / 2, cy + h / 2],
  [cx - w / 2, cy + h / 2],
];

const rotate = (pts: Pt[], deg: number, cx = 0, cy = 0): Pt[] => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return pts.map(
    ([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c] as Pt,
  );
};
const scalePts = (pts: Pt[], k: number, cx = 0, cy = 0): Pt[] =>
  pts.map(([x, y]) => [cx + x * k, cy + y * k] as Pt);
const movePts = (pts: Pt[], dx: number, dy: number): Pt[] =>
  pts.map(([x, y]) => [x + dx, y + dy] as Pt);

/** A thick line along `path` as small convex polygons (one per segment, a joint at each bend). */
export function strokePath(path: Pt[], width: number, closed = false): Pt[][] {
  const out: Pt[][] = [];
  const hw = width / 2;
  const n = path.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    out.push([
      [a[0] + nx, a[1] + ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny],
    ]);
  }
  const joints = closed ? path : path;
  for (const p of joints) out.push(circlePts(p[0], p[1], hw, 6));
  return out;
}

// ---- the stroke font: 0-9, + and the letters of WHOT, on a 4 x 6 grid --------------------------------

const GLYPH_W = 4;
const GLYPH_H = 6;
const SIX: Pt[][] = [
  [
    [3.5, 5.5],
    [2.6, 6],
    [1.5, 5.6],
    [0.6, 4.4],
    [0.2, 2.8],
    [0.2, 2.0],
  ],
  [...arc(2, 2.05, 1.85, 2.05, 0, 360, 20)],
];
const flip180 = (g: Pt[][]): Pt[][] =>
  g.map((l) => l.map(([x, y]) => [GLYPH_W - x, GLYPH_H - y] as Pt));

const GLYPHS: Record<string, { lines: Pt[][]; closed?: boolean[]; w: number }> = {
  '0': { lines: [arc(2, 3, 1.75, 2.85, 0, 360, 22)], closed: [true], w: GLYPH_W },
  '1': {
    lines: [
      [
        [0.7, 4.7],
        [2.3, 6],
        [2.3, 0],
      ],
    ],
    w: GLYPH_W,
  },
  '2': {
    lines: [[...arc(2, 4.2, 1.8, 1.8, 165, -35, 12), [0.2, 0], [3.9, 0]]],
    w: GLYPH_W,
  },
  '3': {
    lines: [
      [...arc(1.95, 4.35, 1.7, 1.65, 155, -90, 12), ...arc(1.9, 1.35, 1.95, 1.35, 90, -160, 12)],
    ],
    w: GLYPH_W,
  },
  '4': {
    lines: [
      [
        [3, 0],
        [3, 6],
        [0.1, 1.9],
        [4, 1.9],
      ],
    ],
    w: GLYPH_W,
  },
  '5': {
    lines: [[[3.6, 6], [0.9, 6], [0.55, 3.5], ...arc(1.9, 2.1, 1.9, 2.1, 140, -145, 12)]],
    w: GLYPH_W,
  },
  '6': { lines: SIX, closed: [false, true], w: GLYPH_W },
  '7': {
    lines: [
      [
        [0.2, 6],
        [3.9, 6],
        [1.5, 0],
      ],
    ],
    w: GLYPH_W,
  },
  '8': {
    lines: [arc(2, 4.55, 1.5, 1.45, 0, 360, 18), arc(2, 1.65, 1.85, 1.65, 0, 360, 18)],
    closed: [true, true],
    w: GLYPH_W,
  },
  '9': { lines: flip180(SIX), closed: [false, true], w: GLYPH_W },
  '+': {
    lines: [
      [
        [2, 1.2],
        [2, 4.8],
      ],
      [
        [0.2, 3],
        [3.8, 3],
      ],
    ],
    w: GLYPH_W,
  },
  W: {
    lines: [
      [
        [0, 6],
        [1, 0],
        [2, 4],
        [3, 0],
        [4, 6],
      ],
    ],
    w: GLYPH_W,
  },
  H: {
    lines: [
      [
        [0.3, 0],
        [0.3, 6],
      ],
      [
        [3.7, 0],
        [3.7, 6],
      ],
      [
        [0.3, 3],
        [3.7, 3],
      ],
    ],
    w: GLYPH_W,
  },
  O: { lines: [arc(2, 3, 1.9, 2.9, 0, 360, 22)], closed: [true], w: GLYPH_W },
  T: {
    lines: [
      [
        [0, 6],
        [4, 6],
      ],
      [
        [2, 6],
        [2, 0],
      ],
    ],
    w: GLYPH_W,
  },
};

/** The width of `text` at glyph height `h`. */
export function textWidth(text: string, h: number): number {
  const u = h / GLYPH_H;
  const advance = (GLYPH_W + 1.1) * u;
  const n = [...text].filter((c) => GLYPHS[c]).length;
  return n === 0 ? 0 : n * advance - 1.1 * u;
}

/** `text` as thick strokes centred on (cx, cy), `h` tall. Unknown characters are skipped. */
export function textPolys(
  text: string,
  cx: number,
  cy: number,
  h: number,
  color: string,
  layer: number,
  weight = 0.17,
): Poly[] {
  const u = h / GLYPH_H;
  const advance = (GLYPH_W + 1.1) * u;
  const total = textWidth(text, h);
  let x0 = cx - total / 2;
  const out: Poly[] = [];
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    g.lines.forEach((line, li) => {
      const path = line.map(([x, y]) => [x0 + x * u, cy - h / 2 + y * u] as Pt);
      for (const pts of strokePath(path, h * weight, g.closed?.[li] ?? false))
        out.push({ pts, color, layer });
    });
    x0 += advance;
  }
  return out;
}

// ---- the marks --------------------------------------------------------------------------------------

/** A heart in a 1 x 1 box centred on the origin. */
export function heartPts(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (2 * Math.PI * i) / 40;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x / 34, (y + 2.5) / 34]);
  }
  return pts;
}

/** A sun: a round middle with eight points, in a 1 x 1 box. */
export function sunPts(): Pt[] {
  return Array.from({ length: 24 }, (_, i) => {
    const a = (2 * Math.PI * i) / 24;
    const r = i % 3 === 0 ? 0.5 : 0.31;
    return [r * Math.cos(a), r * Math.sin(a)] as Pt;
  });
}

/** A leaf (a pointed oval turned 45 degrees), in a 1 x 1 box. */
export function leafPts(): Pt[] {
  const n = 10;
  const up = Array.from(
    { length: n + 1 },
    (_, i) => [-0.5 + i / n, 0.26 * Math.sin((Math.PI * i) / n)] as Pt,
  );
  const down = Array.from(
    { length: n - 1 },
    (_, i) => [0.5 - (i + 1) / n, -0.26 * Math.sin((Math.PI * (n - 1 - i)) / n)] as Pt,
  );
  return rotate([...up, ...down], 45);
}

/** A drop, point up, in a 1 x 1 box. */
export function dropPts(): Pt[] {
  const r = 0.34;
  const cy = -0.16;
  const tip: Pt = [0, 0.5];
  const d = tip[1] - cy;
  const beta = Math.acos(r / d);
  const start = Math.PI / 2 - beta;
  const pts: Pt[] = [tip];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const a = start - ((2 * Math.PI - 2 * beta) * i) / steps;
    pts.push([r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

const MARK: Record<'red' | 'yellow' | 'green' | 'blue', () => Pt[]> = {
  red: heartPts,
  yellow: sunPts,
  green: leafPts,
  blue: dropPts,
};

/** The five Whot! shapes in a 1 x 1 box. The cross is two bars; every polygon is star-shaped about its middle. */
export function whotShapePolys(
  shape: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  layer: number,
): Poly[] {
  const place = (pts: Pt[]): Pt[] => movePts(scalePts(pts, size), cx, cy);
  switch (shape) {
    case 'circle':
      return [{ pts: place(circlePts(0, 0, 0.45, 28)), color, layer }];
    case 'triangle':
      return [
        {
          pts: place([
            [0, 0.46],
            [0.5, -0.4],
            [-0.5, -0.4],
          ]),
          color,
          layer,
        },
      ];
    case 'cross':
      return [
        { pts: place(rect(0, 0, 0.3, 0.92)), color, layer },
        { pts: place(rect(0, 0, 0.92, 0.3)), color, layer },
      ];
    case 'square':
      return [{ pts: place(rect(0, 0, 0.82, 0.82)), color, layer }];
    default: {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = Math.PI / 2 + (Math.PI * i) / 5;
        const r = i % 2 === 0 ? 0.5 : 0.21;
        return [r * Math.cos(a), r * Math.sin(a)] as Pt;
      });
      return [{ pts: place(pts), color, layer }];
    }
  }
}

function pie(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  color: string,
  layer: number,
): Poly {
  return { pts: [[cx, cy], ...arc(cx, cy, r, r, a0, a1, 8)], color, layer };
}

/** The four-colour wheel of the Crazy card. */
function wheel(cx: number, cy: number, r: number, layer: number): Poly[] {
  const cols = [
    CRAZY_PALETTE.red[1],
    CRAZY_PALETTE.blue[1],
    CRAZY_PALETTE.green[1],
    CRAZY_PALETTE.yellow[1],
  ];
  return [
    ...cols.map((c, i) => pie(cx, cy, r, 90 - i * 90, 0 - i * 90, c, layer)),
    { pts: circlePts(cx, cy, r * 1.0, 28), color: '#FFFFFF', layer: layer - 0.5 },
  ];
}

// ---- a Crazy Cards face -----------------------------------------------------------------------------

type Ink = { main: string; shadow: string };

/** The symbol for a Crazy card's value, `size` tall, centred on (cx, cy): the number, or the picture for an action. */
function crazySymbol(
  value: string,
  wild: boolean,
  cx: number,
  cy: number,
  size: number,
  ink: Ink,
  layer: number,
): Poly[] {
  const out: Poly[] = [];
  const p = (pts: Pt[], color: string, l: number): Poly => ({ pts, color, layer: l });
  if (value === 'skip') {
    const r = size * 0.42;
    out.push(...ringPolys(cx, cy, r, r * 0.74, ink.main, layer));
    out.push(p(movePts(rotate(rect(0, 0, size * 0.1, r * 1.9), 45), cx, cy), ink.main, layer));
  } else if (value === 'reverse') {
    const w = size * 0.2;
    const up = (dx: number, dir: 1 | -1): Poly[] => [
      p(
        movePts(rect(0, 0, w * 0.5, size * 0.58), cx + dx, cy - dir * size * 0.03),
        ink.main,
        layer,
      ),
      p(
        movePts(
          [
            [-w * 0.95, 0],
            [w * 0.95, 0],
            [0, dir * size * 0.34],
          ],
          cx + dx,
          cy + dir * size * 0.26,
        ),
        ink.main,
        layer,
      ),
    ];
    out.push(...up(-size * 0.2, 1), ...up(size * 0.2, -1));
  } else if (value === 'draw_two') {
    out.push(...textPolys('+2', cx, cy, size * 0.72, ink.main, layer, 0.19));
  } else if (value === 'draw_four') {
    out.push(...wheel(cx, cy + size * 0.2, size * 0.22, layer));
    out.push(...textPolys('+4', cx, cy - size * 0.2, size * 0.46, ink.main, layer));
  } else if (wild) {
    out.push(...wheel(cx, cy, size * 0.4, layer));
  } else {
    out.push(...textPolys(value, cx, cy, size * 0.82, ink.main, layer, 0.19));
  }
  return out;
}

function ringPolys(
  cx: number,
  cy: number,
  r1: number,
  r0: number,
  color: string,
  layer: number,
  n = 24,
): Poly[] {
  const out: Poly[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const b = (2 * Math.PI * (i + 1)) / n;
    out.push({
      pts: [
        [cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)],
        [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)],
        [cx + r1 * Math.cos(b), cy + r1 * Math.sin(b)],
        [cx + r0 * Math.cos(b), cy + r0 * Math.sin(b)],
      ],
      color,
      layer,
    });
  }
  return out;
}

function withShadow(polys: Poly[], shadow: string, layer: number, d = 0.014): Poly[] {
  return [
    ...polys.map((p) => ({ ...p, pts: movePts(p.pts as Pt[], d, -d), color: shadow, layer })),
    ...polys,
  ];
}

const rot180 = (polys: Poly[]): Poly[] =>
  polys.map((p) => ({ ...p, pts: p.pts.map(([x, y]) => [-x, -y] as Pt) }));

function borderPolys(
  w: number,
  h: number,
  inset: number,
  width: number,
  color: string,
  layer: number,
): Poly[] {
  return strokePath(roundedRect(0, 0, w - 2 * inset, h - 2 * inset, 0.06, 4), width, true).map(
    (pts) => ({ pts, color, layer }),
  );
}

function crazyFace(suit: string, value: string): Poly[] {
  const wild = suit === 'wild';
  const col = wild ? null : CRAZY_PALETTE[suit as keyof typeof CRAZY_PALETTE];
  const top = wild ? WILD_BODY[0] : col![0];
  const bottom = wild ? WILD_BODY[1] : col![2];
  const out: Poly[] = [
    { pts: roundedRect(0, 0, 1, 1.5, 0.09), color: top, color2: bottom, layer: 0 },
  ];
  out.push(...borderPolys(1, 1.5, 0.045, 0.016, mix(top, '#FFF3DC', 0.6), 1));
  const yellow = suit === 'yellow';
  const ink: Ink = {
    main: yellow ? '#4A3000' : '#FFFFFF',
    shadow: yellow ? mix(col![1], '#FFF3DC', 0.35) : mix(bottom, '#000000', 0.35),
  };
  if (col) {
    const tint = mix(col[1], '#FFFFFF', yellow ? 0.32 : 0.2);
    out.push({ pts: scalePts(MARK[suit as keyof typeof MARK](), 0.78), color: tint, layer: 2 });
  }
  const centre = crazySymbol(
    value,
    wild,
    0,
    wild && value === 'draw_four' ? -0.02 : 0,
    0.62,
    ink,
    4,
  );
  out.push(...(value === 'wild' ? centre : withShadow(centre, ink.shadow, 3)));
  const corner: Poly[] = [];
  const small = crazySymbol(value, wild, -0.3, 0.57, 0.2, ink, 5);
  corner.push(...small);
  if (col)
    corner.push({
      pts: movePts(scalePts(MARK[suit as keyof typeof MARK](), 0.13), -0.3, 0.4),
      color: ink.main,
      layer: 5,
    });
  out.push(...corner, ...rot180(corner));
  return out;
}

// ---- a Whot! face -----------------------------------------------------------------------------------

function whotFaceArt(shape: string, n: number): Poly[] {
  const out: Poly[] = [
    { pts: roundedRect(0, 0, 1, 1.5, 0.09), color: PAPER, color2: '#EBDDBF', layer: 0 },
  ];
  out.push(...borderPolys(1, 1.5, 0.05, 0.012, mix(PAPER, MAROON, 0.45), 1));
  const isWhot = shape === 'whot';
  const num = String(n);
  const nh = num.length > 1 ? 0.17 : 0.2;
  const corner: Poly[] = [...textPolys(num, -0.285, 0.57, nh, MAROON, 3, 0.18)];
  corner.push(...whotShapePolys(isWhot ? 'star' : shape, -0.285, 0.38, 0.14, MAROON, 3));
  out.push(...corner, ...rot180(corner));
  if (isWhot) {
    out.push(...whotShapePolys('star', 0, 0.1, 0.36, MAROON_FILL, 3));
    out.push(...textPolys('WHOT', 0, -0.3, 0.13, MAROON, 3, 0.2));
  } else {
    out.push(...whotShapePolys(shape, 0, 0, 0.52, MAROON_FILL, 3));
  }
  return out;
}

// ---- backs ------------------------------------------------------------------------------------------

/** The back of a card: Whot! maroon with a cream diamond, Crazy Cards ink with the four-colour wheel. */
export function backArt(game: 'whot' | 'crazy-cards'): Poly[] {
  if (game === 'whot') {
    return [
      { pts: roundedRect(0, 0, 1, 1.5, 0.09), color: '#7E1C2E', color2: MAROON, layer: 0 },
      ...borderPolys(1, 1.5, 0.05, 0.014, CREAM, 1),
      { pts: rotate(rect(0, 0, 0.5, 0.5), 45), color: CREAM, layer: 2 },
      ...textPolys('WHOT', 0, 0, 0.1, MAROON, 3, 0.22),
    ];
  }
  return [
    { pts: roundedRect(0, 0, 1, 1.5, 0.09), color: '#2A2420', color2: '#0F0D0B', layer: 0 },
    ...borderPolys(1, 1.5, 0.05, 0.014, CREAM, 1),
    ...wheel(0, 0, 0.3, 3),
    ...ringPolys(0, 0, 0.36, 0.31, CREAM, 2),
  ];
}

/** The front of a card. */
export function faceArt(face: Face): Poly[] {
  return face.game === 'whot'
    ? whotFaceArt(face.suit, Number(face.rank))
    : crazyFace(face.suit, face.rank);
}

// ---- turning polygons into triangles -----------------------------------------------------------------

/** Spacing between paint layers. Zero: layers are painted in order on one plane (the renderer's polygon offset keeps them above the body), so no depth precision is spent on them. */
export const LAYER_Z = 0;

const toLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export type MeshData = { positions: number[]; colors: number[]; triangles: number };

/**
 * Triangles with a colour at every corner, in card units (1 wide) with z for the layer. Each polygon is fanned
 * from its middle, which works for every shape above (they are all star-shaped about their middle). Colours are
 * converted to linear so the renderer's sRGB output shows the colours as written.
 */
export function buildMesh(polys: readonly Poly[]): MeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  let triangles = 0;
  const pushVertex = (
    x: number,
    y: number,
    z: number,
    top: [number, number, number],
    bottom: [number, number, number] | null,
  ) => {
    positions.push(x, y, z);
    let rgb = top;
    if (bottom) {
      const t = Math.max(0, Math.min(1, (0.75 - y) / 1.5));
      rgb = [
        top[0] + (bottom[0] - top[0]) * t,
        top[1] + (bottom[1] - top[1]) * t,
        top[2] + (bottom[2] - top[2]) * t,
      ];
    }
    colors.push(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));
  };
  for (const poly of polys) {
    const n = poly.pts.length;
    if (n < 3) continue;
    const top = hexToRgb(poly.color);
    const bottom = poly.color2 ? hexToRgb(poly.color2) : null;
    const z = poly.layer * LAYER_Z;
    let mx = 0;
    let my = 0;
    for (const [x, y] of poly.pts) {
      mx += x;
      my += y;
    }
    mx /= n;
    my /= n;
    for (let i = 0; i < n; i++) {
      const a = poly.pts[i]!;
      const b = poly.pts[(i + 1) % n]!;
      // counter-clockwise, so the face looks towards +z
      const cw = (a[0] - mx) * (b[1] - my) - (a[1] - my) * (b[0] - mx) < 0;
      pushVertex(mx, my, z, top, bottom);
      pushVertex(cw ? b[0] : a[0], cw ? b[1] : a[1], z, top, bottom);
      pushVertex(cw ? a[0] : b[0], cw ? a[1] : b[1], z, top, bottom);
      triangles++;
    }
  }
  return { positions, colors, triangles };
}

/** The card's solid body (drawn first, writes depth) and its art (painted over it in layer order). */
export function splitArt(polys: readonly Poly[]): { body: Poly[]; art: Poly[] } {
  const body = polys.filter((p) => p.layer === 0);
  const art = polys.filter((p) => p.layer > 0).sort((a, b) => a.layer - b.layer);
  return { body, art };
}

/** A card face's bounding box (for tests: nothing may be drawn outside the card). */
export function bounds(polys: readonly Poly[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of polys)
    for (const [x, y] of p.pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  return { minX, maxX, minY, maxY };
}
