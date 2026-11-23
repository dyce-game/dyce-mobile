import { crazyCardsDeck, crazyCardsEngine, whotDeck, type CrazyCardsState } from '@dyce/games';
import { ActorStore } from './actors';
import {
  backArt,
  bounds,
  buildMesh,
  faceArt,
  heartPts,
  leafPts,
  mix,
  dropPts,
  sunPts,
  textPolys,
  textWidth,
} from './card-art';
import { cuesFor, headline, nextAfter } from './cues';
import { TableDirector } from './director';
import { crazyFace, whotFace } from './faces';
import { advance, currentOf, initState, modelFor, nameOf } from './fixtures';
import { MAX_BACKS, cameraRig, discardPose, pose } from './layout';
import type { TableModel } from './model';

describe('card art', () => {
  it('draws every Crazy Cards and Whot! card inside the card and as whole triangles', () => {
    const faces = [...crazyCardsDeck().map(crazyFace), ...whotDeck().map(whotFace)];
    expect(faces.length).toBe(108 + 54);
    for (const f of faces) {
      const polys = faceArt(f);
      const b = bounds(polys);
      expect(b.minX).toBeGreaterThanOrEqual(-0.5 - 1e-6);
      expect(b.maxX).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(-0.75 - 1e-6);
      expect(b.maxY).toBeLessThanOrEqual(0.75 + 1e-6);
      const mesh = buildMesh(polys);
      expect(mesh.positions.length % 9).toBe(0);
      expect(mesh.colors.length).toBe(mesh.positions.length);
      expect(mesh.triangles).toBeGreaterThan(20);
      expect(mesh.triangles).toBeLessThan(2500);
    }
  });

  it('draws the two backs', () => {
    for (const g of ['whot', 'crazy-cards'] as const) {
      const polys = backArt(g);
      expect(buildMesh(polys).triangles).toBeGreaterThan(20);
      const b = bounds(polys);
      expect(b.maxX).toBeLessThanOrEqual(0.5 + 1e-6);
    }
  });

  it('gives each Crazy Cards colour its own mark so colour is not the only signal', () => {
    const marks = [heartPts(), sunPts(), leafPts(), dropPts()];
    for (const m of marks) {
      const b = bounds([{ pts: m, color: '#000', layer: 0 }]);
      expect(b.maxX - b.minX).toBeLessThanOrEqual(1.001);
      expect(b.maxX - b.minX).toBeGreaterThan(0.5);
      expect(b.maxY - b.minY).toBeLessThanOrEqual(1.001);
    }
    const sizes = new Set(marks.map((m) => m.length));
    expect(sizes.size).toBeGreaterThan(1);
  });

  it('lays out text centred and measures it', () => {
    expect(textWidth('20', 0.2)).toBeGreaterThan(textWidth('2', 0.2));
    const polys = textPolys('7', 0, 0, 0.4, '#fff', 1);
    const b = bounds(polys);
    expect((b.minX + b.maxX) / 2).toBeCloseTo(0, 1);
    expect(textPolys('?', 0, 0, 0.4, '#fff', 1)).toEqual([]);
  });

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#ff0000', 0.3)).toBe('#ff0000');
  });
});

describe('tweens', () => {
  it('holds a card still until its turn, then moves it and stops', () => {
    const s = new ActorStore();
    s.place('a', pose({ x: 0 }));
    s.move('a', pose({ x: 1 }), 1000, { delay: 100, duration: 200, ease: 'linear' });
    expect(s.step(1050)).toBe(true);
    expect(s.poseOf('a')!.x).toBe(0);
    expect(s.step(1200)).toBe(true);
    expect(s.poseOf('a')!.x).toBeCloseTo(0.5);
    expect(s.settlesAt()).toBe(1300);
    expect(s.step(1400)).toBe(false);
    expect(s.poseOf('a')!.x).toBe(1);
    expect(s.step(1500)).toBe(false);
  });

  it('lifts a card over the middle of its trip (the arc) and lands flat', () => {
    const s = new ActorStore();
    s.place('a', pose());
    s.move('a', pose({ x: 1 }), 0, { duration: 100, ease: 'linear', arc: 0.2 });
    s.step(50);
    expect(s.poseOf('a')!.y).toBeCloseTo(0.2);
    s.step(100);
    expect(s.poseOf('a')!.y).toBe(0);
  });

  it('a jump (duration 0) lands at once, and a new card starts where it is sent', () => {
    const s = new ActorStore();
    s.move('x', pose({ x: 3 }), 0, { duration: 0 });
    expect(s.poseOf('x')!.x).toBe(3);
    s.move('y', pose({ x: 2 }), 0);
    expect(s.poseOf('y')!.x).toBe(2);
    s.remove('x');
    expect(s.has('x')).toBe(false);
  });

  it('a new trip starts from where the card is now', () => {
    const s = new ActorStore();
    s.place('a', pose({ x: 0 }));
    s.move('a', pose({ x: 10 }), 0, { duration: 100, ease: 'linear' });
    s.step(50);
    s.move('a', pose({ x: 0 }), 50, { duration: 100, ease: 'linear' });
    s.step(100);
    expect(s.poseOf('a')!.x).toBeCloseTo(2.5);
  });
});

const rig = cameraRig(390 / 844);

describe('the director', () => {
  const crazy = (players: string[], seed = 5n) => initState('crazy-cards', players, seed);

  it('deals at the start: cards fly from the draw pile, then the first card turns over', () => {
    const d = new TableDirector(false);
    const m = modelFor('crazy-cards', crazy(['ada', 'bola', 'chi']), 'ada');
    expect(d.update(m, rig, 0)).toBe(true);
    const specs = d.snapshot();
    expect(specs.filter((s) => s.role === 'hand')).toHaveLength(7);
    expect(specs.filter((s) => s.role === 'back')).toHaveLength(2 * MAX_BACKS);
    expect(specs.filter((s) => s.role === 'pile')).toHaveLength(1);
    expect(d.store.step(10)).toBe(true);
    expect(d.store.settlesAt()).toBeGreaterThan(1500);
    d.store.step(10_000);
    expect(d.store.step(10_001)).toBe(false);
    // my cards end up in the fan, the starter on the pile
    const top = specs.find((s) => s.role === 'pile')!;
    expect(top.face!.key).toBe(m.top.key);
    expect(d.store.poseOf(top.id)!.y).toBeLessThan(0.05);
  });

  it('with reduced motion everything is simply there', () => {
    const d = new TableDirector(true);
    d.update(modelFor('crazy-cards', crazy(['ada', 'bola']), 'ada'), rig, 0);
    expect(d.store.step(1)).toBe(false);
    expect(d.snapshot().some((s) => s.role === 'temp')).toBe(false);
  });

  it('joining in the middle puts the table down as it is, without a deal', () => {
    const s = advance('crazy-cards', crazy(['ada', 'bola', 'chi']), 9);
    const d = new TableDirector(false);
    d.update(modelFor('crazy-cards', s, 'bola'), rig, 0);
    expect(d.store.step(1)).toBe(false);
  });

  it('my played card flies to the top of the pile and the hand closes up', () => {
    const players = ['ada', 'bola'];
    let s = crazy(players, 9n);
    const me = currentOf('crazy-cards', s);
    const d = new TableDirector(false);
    const m0 = modelFor('crazy-cards', s, me);
    d.update(m0, rig, 0);
    d.store.step(100_000);
    const pick = m0.hand.find((h) => h.playable)!;
    const id = d.handIds()[m0.hand.indexOf(pick)]!;
    s = crazyCardsEngine.apply(s as CrazyCardsState, me, {
      kind: 'play',
      card: pick.face.raw,
      ...(pick.face.suit === 'wild' ? { color: 'red' } : null),
      call: true,
    } as never);
    const m1 = modelFor('crazy-cards', s, me);
    d.update(m1, rig, 200_000);
    expect(d.pileKeys().pop()).toBe(pick.face.key);
    expect(d.handIds()).not.toContain(id);
    expect(d.handIds()).toHaveLength(m1.hand.length);
    // it travels (arcs over the table), then lies on the pile
    d.store.step(200_000 + 210);
    expect(d.store.poseOf(id)!.y).toBeGreaterThan(0.05);
    d.store.step(200_000 + 5000);
    expect(d.store.poseOf(id)!.y).toBeLessThan(0.05);
    expect(d.store.poseOf(id)!.rx).toBeCloseTo(-Math.PI / 2);
  });

  it('shows the hand and the fans the model says after any run of moves (reconciles)', () => {
    const players = ['ada', 'bola', 'chi', 'dayo'];
    let s = crazy(players, 11n);
    const d = new TableDirector(false);
    let t = 0;
    for (let i = 0; i < 60 && (s as { endReason: unknown }).endReason === null; i++) {
      const m = modelFor('crazy-cards', s, 'chi');
      d.update(m, rig, t);
      t += 5000;
      d.store.step(t - 1);
      const specs = d.snapshot();
      expect(specs.filter((x) => x.role === 'hand')).toHaveLength(m.hand.length);
      expect(
        specs
          .filter((x) => x.role === 'hand')
          .map((x) => x.face!.key)
          .sort(),
      ).toEqual(m.hand.map((h) => h.face.key).sort());
      const backs = specs.filter((x) => x.role === 'back').length;
      expect(backs).toBe(
        m.seats.filter((x) => x.index > 0).reduce((n, x) => n + Math.min(x.count, MAX_BACKS), 0),
      );
      const piles = specs.filter((x) => x.role === 'pile');
      expect(piles.length).toBeGreaterThanOrEqual(1);
      expect(piles.length).toBeLessThanOrEqual(5);
      expect(d.pileKeys().pop()).toBe(m.top.key);
      s = advance('crazy-cards', s, 1);
    }
  });

  it('survives missing several moves at once (a dropped line) and still shows the truth', () => {
    const players = ['ada', 'bola', 'chi'];
    let s = crazy(players, 3n);
    const d = new TableDirector(false);
    d.update(modelFor('crazy-cards', s, 'ada'), rig, 0);
    s = advance('crazy-cards', s, 17);
    const m = modelFor('crazy-cards', s, 'ada');
    d.update(m, rig, 100_000);
    expect(
      d
        .snapshot()
        .filter((x) => x.role === 'hand')
        .map((x) => x.face!.key)
        .sort(),
    ).toEqual(m.hand.map((h) => h.face.key).sort());
    expect(d.pileKeys().pop()).toBe(m.top.key);
  });

  it('turns the other hands over when the game ends', () => {
    const players = ['ada', 'bola'];
    const s = advance('whot', initState('whot', players, 4n), 4000);
    const d = new TableDirector(false);
    const first = modelFor('whot', initState('whot', players, 4n), 'ada');
    d.update(first, rig, 0);
    d.store.step(1e6);
    const end = modelFor('whot', s, 'ada');
    expect(end.over).toBe(true);
    d.update(end, rig, 2e6);
    const theirs = d
      .snapshot()
      .filter(
        (x) => x.role === 'back' || (x.role !== 'hand' && x.role !== 'pile' && x.role !== 'temp'),
      );
    if (end.seats[1]!.count > 0) expect(theirs.some((x) => x.face !== null)).toBe(true);
  });

  it('a played card keeps a steady crooked spot while others land on it', () => {
    expect(discardPose('a1', 0)).toEqual(discardPose('a1', 0));
  });

  it('forgets one-off effect cards when their time is up', () => {
    const d = new TableDirector(false);
    d.update(modelFor('crazy-cards', crazy(['ada', 'bola']), 'ada'), rig, 0);
    expect(d.snapshot().some((s) => s.role === 'temp')).toBe(true);
    expect(d.prune(10_000)).toBe(true);
    expect(d.snapshot().some((s) => s.role === 'temp')).toBe(false);
    expect(d.prune(10_000)).toBe(false);
  });
});

describe('special-card feedback', () => {
  function afterPlay(
    slug: 'crazy-cards',
    find: (m: TableModel) => boolean,
  ): { before: TableModel; after: TableModel } | null {
    for (let seed = 1n; seed < 400n; seed++) {
      let s = initState(slug, ['ada', 'bola', 'chi'], seed);
      for (let i = 0; i < 80; i++) {
        if ((s as { endReason: unknown }).endReason !== null) break;
        const beforeS = s;
        s = advance(slug, s, 1);
        const after = modelFor(slug, s, 'ada');
        if (find(after)) return { before: modelFor(slug, beforeS, 'ada'), after };
      }
    }
    return null;
  }

  it('says who misses a turn after a Skip, and who draws after a Draw Two', () => {
    const skip = afterPlay('crazy-cards', (m) => m.event?.effect === 'skip');
    expect(skip).not.toBeNull();
    const cues = cuesFor(skip!.before, skip!.after, nameOf);
    const c = cues.find((x) => x.kind === 'skip')!;
    expect(c.text).toMatch(/^Skip! .* miss(es)? a turn$/);
    expect(c.seat).toBe(nextAfter(skip!.after, skip!.after.event!.by));

    const two = afterPlay('crazy-cards', (m) => m.event?.effect === 'draw_two');
    const d = cuesFor(two!.before, two!.after, nameOf).find((x) => x.kind === 'draw')!;
    expect(d.text).toMatch(/Draw Two! .* pick(s)? 2 and miss(es)? a turn/);
    expect(d.seat).toBe(two!.after.event!.victim);
  });

  it('announces a Reverse, a chosen colour and a seat on its last card in our words', () => {
    const rev = afterPlay('crazy-cards', (m) => m.event?.effect === 'reverse');
    expect(
      cuesFor(rev!.before, rev!.after, nameOf).some(
        (c) => c.kind === 'reverse' && /other way/.test(c.text),
      ),
    ).toBe(true);
    const wild = afterPlay('crazy-cards', (m) => m.event?.effect === 'wild');
    expect(
      cuesFor(wild!.before, wild!.after, nameOf).some(
        (c) => c.kind === 'wild' && /chose (red|yellow|green|blue)/.test(c.text),
      ),
    ).toBe(true);
    const last = afterPlay('crazy-cards', (m) => m.seats.some((s) => s.lastCard));
    const cs = cuesFor(last!.before, last!.after, nameOf).filter((c) => c.kind === 'last_card');
    expect(cs.length).toBeGreaterThan(0);
    expect(cs[0]!.text).toMatch(/Last card!|last card!/);
    expect(cs[0]!.text).not.toMatch(/uno/i);
  });

  it('has no cues for the first sight of the table, and the loudest comes first', () => {
    const m = modelFor('crazy-cards', initState('crazy-cards', ['ada', 'bola']), 'ada');
    expect(cuesFor(null, m, nameOf)).toEqual([]);
    expect(headline([])).toBeNull();
    const w = afterPlay('crazy-cards', (x) => x.event?.effect === 'skip');
    const cues = cuesFor(w!.before, w!.after, nameOf);
    expect(headline(cues)).toBe(cues[0]);
    expect([...cues].sort((a, b) => a.rank - b.rank)).toEqual(cues);
  });
});
