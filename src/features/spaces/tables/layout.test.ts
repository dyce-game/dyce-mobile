import {
  CARD_W,
  DECK_AT,
  DISCARD_AT,
  MAX_BACKS,
  backFan,
  cameraRig,
  chipLayout,
  deckHeight,
  discardPose,
  ease,
  handCardShare,
  handLayout,
  handStripPts,
  hash01,
  lerpPose,
  onTable,
  opponentOffsets,
  pose,
  project,
  projectPct,
  seatPhi,
  TABLE_R,
} from './layout';

describe('the camera', () => {
  it('fits the whole round table across a phone screen', () => {
    const rig = cameraRig(390 / 844);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const p = project(rig, onTable(a, 1.16));
      expect(Math.abs(p.x)).toBeLessThan(1);
      expect(Math.abs(p.y)).toBeLessThan(1);
    }
  });

  it('puts the table in the upper part of a portrait screen, your edge below its middle', () => {
    const rig = cameraRig(390 / 844);
    const centre = projectPct(rig, [0, 0, 0]);
    expect(centre.top).toBeGreaterThan(25);
    expect(centre.top).toBeLessThan(55);
    expect(projectPct(rig, onTable(Math.PI, 1)).top).toBeLessThan(centre.top);
    expect(projectPct(rig, onTable(0, 1)).top).toBeGreaterThan(centre.top);
  });

  it('fits a wide screen by its height', () => {
    const rig = cameraRig(1.8);
    expect(Math.abs(project(rig, onTable(Math.PI, 1.16)).y)).toBeLessThan(1);
    expect(project(rig, onTable(0, 1.16)).y).toBeGreaterThan(-1);
  });

  it('projects the point it looks at to the middle of the screen', () => {
    const rig = cameraRig(0.5);
    const c = project(rig, rig.target);
    expect(c.x).toBeCloseTo(0, 5);
    expect(c.y).toBeCloseTo(0, 5);
  });
});

describe('seats around the table', () => {
  it('you are at the near edge and one opponent sits straight across', () => {
    expect(seatPhi(0, 2)).toBe(0);
    expect(onTable(seatPhi(0, 3), 1)[2]).toBeCloseTo(1);
    const [x, , z] = onTable(seatPhi(1, 2), 1);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });

  it('the next player is on your left and the rest follow clockwise to your right', () => {
    const xs = [1, 2, 3].map((i) => onTable(seatPhi(i, 4), 1)[0]);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
    expect(xs[0]).toBeLessThan(0);
    expect(xs[2]).toBeGreaterThan(0);
  });

  it('spreads up to six seats symmetrically along the far side', () => {
    for (let m = 1; m <= 5; m++) {
      const o = opponentOffsets(m);
      expect(o).toHaveLength(m);
      expect(o[0]! + o[m - 1]!).toBeCloseTo(0);
      expect(Math.max(...o.map(Math.abs))).toBeLessThanOrEqual((80 * Math.PI) / 180 + 1e-9);
    }
    expect(opponentOffsets(0)).toEqual([]);
  });

  it('fans at most six card backs, centred on the seat, backs towards the table', () => {
    expect(backFan(2, Math.PI)).toHaveLength(2);
    expect(backFan(11, Math.PI)).toHaveLength(MAX_BACKS);
    const fan = backFan(3, Math.PI);
    expect(fan[0]!.x + fan[2]!.x).toBeCloseTo(2 * fan[1]!.x);
    expect(fan.every((p) => p.flip === Math.PI)).toBe(true);
  });
});

describe('six seats', () => {
  it('keeps every opponent name chip on a phone screen and clear of the others', () => {
    for (const aspect of [0.46, 0.56]) {
      const rig = cameraRig(aspect);
      for (let total = 2; total <= 6; total++) {
        const spots = Array.from({ length: total - 1 }, (_, k) =>
          projectPct(rig, onTable(seatPhi(k + 1, total), TABLE_R + 0.16, 0.25)),
        );
        const chips = chipLayout(spots, 375);
        expect(chips).toHaveLength(total - 1);
        for (const c of chips) {
          const px = (c.left / 100) * 375;
          expect(px - c.width / 2).toBeGreaterThanOrEqual(0);
          expect(px + c.width / 2).toBeLessThanOrEqual(375);
          expect(c.width).toBeGreaterThanOrEqual(56);
          expect(c.top).toBeGreaterThan(5);
        }
        // chips at the same height never overlap sideways
        for (let i = 0; i < chips.length; i++) {
          for (let j = i + 1; j < chips.length; j++) {
            if (Math.abs(chips[i]!.top - chips[j]!.top) > 4) continue;
            const dx = (Math.abs(chips[i]!.left - chips[j]!.left) / 100) * 375;
            expect(dx).toBeGreaterThanOrEqual(Math.min(chips[i]!.width, chips[j]!.width) - 1);
          }
        }
      }
    }
    expect(chipLayout([], 375)).toEqual([]);
  });
});

describe('your hand', () => {
  const rig = cameraRig(390 / 844);

  it('is in order left to right, centred, and every card stays on screen', () => {
    for (let n = 1; n <= 24; n++) {
      const hand = handLayout(n, rig);
      expect(hand).toHaveLength(n);
      const xs = hand.map((p) => project(rig, [p.x, p.y, p.z]));
      for (let i = 1; i < n; i++) expect(xs[i]!.x).toBeGreaterThan(xs[i - 1]!.x);
      expect(xs[0]!.x + xs[n - 1]!.x).toBeCloseTo(0, 1);
      const share = handCardShare(n, rig.aspect);
      expect(Math.abs(xs[0]!.x) + share).toBeLessThanOrEqual(0.96);
    }
  });

  it('draws cards as big as the screen allows for a small hand and smaller for a big one', () => {
    expect(handCardShare(3, 0.46)).toBeGreaterThan(handCardShare(15, 0.46));
    expect(handCardShare(1, 0.46)).toBeLessThanOrEqual(0.22);
    expect(handCardShare(40, 0.46)).toBeGreaterThanOrEqual(0.06);
  });

  it('lifts the card you picked and nudges the playable ones', () => {
    const base = handLayout(5, rig);
    const lifted = handLayout(5, rig, { picked: 2, playable: new Set([1, 3]) });
    const y = (p: { x: number; y: number; z: number }) => project(rig, [p.x, p.y, p.z]).y;
    expect(y(lifted[2]!)).toBeGreaterThan(y(base[2]!) + 0.05);
    expect(y(lifted[1]!)).toBeGreaterThan(y(base[1]!));
    expect(y(lifted[0]!)).toBeCloseTo(y(base[0]!), 5);
  });

  it('rolls the outer cards outwards and sizes cards to the screen', () => {
    const hand = handLayout(7, rig);
    expect(hand[0]!.rz).toBeGreaterThan(0);
    expect(hand[6]!.rz).toBeLessThan(0);
    expect(hand[3]!.rz).toBeCloseTo(0);
    expect(hand[3]!.s * CARD_W).toBeGreaterThan(0.05);
    expect(handLayout(0, rig)).toEqual([]);
  });

  it('reports how wide each visible strip is, so a big hand falls back to the list', () => {
    expect(handStripPts(5, 390, rig.aspect)).toBeGreaterThan(44);
    expect(handStripPts(20, 390, rig.aspect)).toBeLessThan(44);
  });
});

describe('piles and motion', () => {
  it('a thin deck is low and a full deck tall but capped', () => {
    expect(deckHeight(0)).toBeLessThan(deckHeight(30));
    expect(deckHeight(30)).toBeLessThan(deckHeight(108));
    expect(deckHeight(5000)).toBeLessThanOrEqual(0.085);
  });

  it('lands a card in the same crooked spot every time', () => {
    const a = discardPose('a7', 2);
    expect(discardPose('a7', 2)).toEqual(a);
    expect(Math.abs(a.x - DISCARD_AT[0])).toBeLessThan(0.03);
    expect(discardPose('a7', 3).y).toBeGreaterThan(a.y);
    expect(DECK_AT[0]).toBeLessThan(DISCARD_AT[0]);
    expect(hash01('x')).toBeGreaterThanOrEqual(0);
    expect(hash01('x')).toBeLessThan(1);
  });

  it('eases from 0 to 1 and never leaves that range', () => {
    for (const k of ['linear', 'out', 'inout', 'back'] as const) {
      expect(ease(k, 0)).toBeCloseTo(0);
      expect(ease(k, 1)).toBeCloseTo(1);
      expect(ease(k, 2)).toBeCloseTo(1);
    }
    expect(lerpPose(pose({ x: 0, flip: 0 }), pose({ x: 2, flip: Math.PI }), 0.5)).toMatchObject({
      x: 1,
      flip: Math.PI / 2,
    });
  });
});
