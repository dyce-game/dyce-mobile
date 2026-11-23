import { ActorStore } from './actors';
import type { Face } from './faces';
import {
  LYING_RX,
  MAX_BACKS,
  backFan,
  deckTopPose,
  discardPose,
  handLayout,
  pose,
  seatPhi,
  type CameraRig,
  type Pose,
} from './layout';
import type { TableModel } from './model';

/**
 * The director turns "the table changed" into card movements: the deal and shuffle at the start, a played
 * card flying to the pile, cards coming off the draw pile into a hand, a penalty pick, the pile being
 * reshuffled, opponents' hands turning over at the end. It never decides what is true: after any event it
 * reconciles every hand, fan and the pile with the model, so even a missed update (a dropped line) ends up
 * showing exactly what the server's view says. Pure (time is passed in), so it is tested without a renderer.
 *
 * With reduced motion every move is a jump.
 */

export type ActorRole = 'hand' | 'pile' | 'back' | 'temp';
export type ActorSpec = { id: string; role: ActorRole; face: Face | null; removeAt?: number };

type Handle = { id: string; key: string };

const FLIGHT_MS = 420;
const DRAW_MS = 420;
const DEAL_GAP_MS = 45;
const PILE_MAX = 4;

export class TableDirector {
  readonly store = new ActorStore();
  private specs = new Map<string, ActorSpec>();
  private hand: Handle[] = [];
  private pile: Handle[] = [];
  private opp = new Map<string, string[]>();
  private prev: TableModel | null = null;
  private counter = 0;
  private changed = false;

  constructor(private reduced = false) {}

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** The cards to draw, in a steady order. */
  snapshot(): ActorSpec[] {
    return [...this.specs.values()];
  }

  /** Takes the "list of cards changed" flag (so the scene re-renders only when it must). */
  takeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  /** Index in the hand of the actor for tap handling: the actor's id for the i-th card of the hand. */
  handIds(): string[] {
    return this.hand.map((h) => h.id);
  }

  /** The cards in the discard pile, bottom first. */
  pileKeys(): string[] {
    return this.pile.map((p) => p.key);
  }

  /** The card behind an actor id, if it is in your hand. */
  handKeyOf(id: string): string | null {
    return this.hand.find((h) => h.id === id)?.key ?? null;
  }

  // ---- the one entry point ------------------------------------------------------------------------

  /**
   * Shows `m`. `pickedIndex` is the card in your hand you are holding up (-1 for none).
   * Returns true when the set of cards changed.
   */
  update(m: TableModel, rig: CameraRig, now: number, pickedIndex = -1): boolean {
    const prev = this.prev;
    this.prev = m;
    const first = prev === null;
    const ev = m.event;
    const newEvent = !first && ev !== null && ev.seq !== (prev.event?.seq ?? -1);
    const snap = this.reduced || (first && ev !== null);
    const dealing = first && ev === null && !this.reduced;

    let delayOf: (seatIndex: number, n: number) => number = () => 0;
    let afterDeal = 0;
    if (dealing) {
      this.riffle(now);
      const total = m.seats.reduce((s, x) => s + Math.min(x.count, 99), 0);
      const start = 560;
      delayOf = (seatIndex, n) => start + (n * m.seats.length + seatIndex) * DEAL_GAP_MS;
      afterDeal = start + total * DEAL_GAP_MS + 200;
    } else if (newEvent) {
      const wait = ev && ev.kind === 'play' && !this.reduced ? FLIGHT_MS - 40 : 0;
      delayOf = (_s, n) => wait + n * 110;
    }

    if (newEvent && ev) this.applyEvent(m, ev, now);
    if (prev && m.deckCount > prev.deckCount + 1) this.riffle(now);

    this.reconcileHand(m, rig, now, pickedIndex, snap, delayOf);
    this.reconcileOpponents(m, now, snap, delayOf);
    this.reconcilePile(m, now, snap, dealing ? afterDeal : 0);
    return this.takeChanged();
  }

  /** Re-fans the hand (a card picked up or put down, a new screen size). */
  relayoutHand(m: TableModel, rig: CameraRig, now: number, pickedIndex: number): void {
    this.layoutHand(m, rig, now, pickedIndex, this.reduced ? 0 : 160);
  }

  /** Forgets cards that were only there for an effect and whose time is up. */
  prune(now: number): boolean {
    let any = false;
    for (const s of [...this.specs.values()]) {
      if (s.removeAt !== undefined && s.removeAt <= now) {
        this.drop(s.id);
        any = true;
      }
    }
    if (any) this.changed = true;
    return any;
  }

  // ---- events -------------------------------------------------------------------------------------

  private applyEvent(m: TableModel, ev: NonNullable<TableModel['event']>, now: number): void {
    if (ev.kind !== 'play' || !ev.card) return;
    const seat = m.seats.find((s) => s.id === ev.by);
    if (!seat) return;
    const card = ev.card;
    let id: string | null = null;
    if (seat.index === 0) {
      const h = this.hand.findIndex((x) => x.key === card.key);
      if (h >= 0) {
        id = this.hand[h]!.id;
        this.hand.splice(h, 1);
      }
    } else {
      const list = this.opp.get(seat.id) ?? [];
      id = list.pop() ?? null;
      this.opp.set(seat.id, list);
    }
    if (id === null) {
      // Nothing of theirs was on the table yet (just joined): the card appears at their seat.
      id = this.spawn('pile', card);
      const phi = seatPhi(seat.index, m.seats.length);
      this.store.place(id, backFan(1, phi)[0] ?? pose());
    }
    const spec = this.specs.get(id)!;
    this.specs.set(id, { ...spec, role: 'pile', face: card });
    this.changed = true;
    this.pile.push({ id, key: card.key });
    this.fly(id, now);
    // the same card, the pile's index counts the cards already there
  }

  private fly(id: string, now: number): void {
    const index = Math.min(this.pile.length - 1, PILE_MAX);
    this.store.move(id, discardPose(id, index), now, {
      duration: this.reduced ? 0 : FLIGHT_MS,
      ease: 'out',
      arc: 0.24,
    });
  }

  // ---- reconciling with the model -----------------------------------------------------------------

  private layoutHand(
    m: TableModel,
    rig: CameraRig,
    now: number,
    pickedIndex: number,
    duration: number,
  ): void {
    const playable = new Set(m.hand.flatMap((h, i) => (h.playable ? [i] : [])));
    const slots = handLayout(this.hand.length, rig, { picked: pickedIndex, playable });
    this.hand.forEach((h, i) => {
      const slot = slots[i];
      if (slot) this.store.move(h.id, slot, now, { duration, ease: 'out' });
    });
  }

  private reconcileHand(
    m: TableModel,
    rig: CameraRig,
    now: number,
    pickedIndex: number,
    snap: boolean,
    delayOf: (seatIndex: number, n: number) => number,
  ): void {
    const pool = new Map<string, string[]>();
    for (const h of this.hand) pool.set(h.key, [...(pool.get(h.key) ?? []), h.id]);
    const next: Handle[] = [];
    const fresh: { id: string; i: number }[] = [];
    m.hand.forEach(({ face }, i) => {
      const ids = pool.get(face.key);
      const reuse = ids?.shift();
      if (reuse) {
        next.push({ id: reuse, key: face.key });
      } else {
        const id = this.spawn('hand', face);
        next.push({ id, key: face.key });
        fresh.push({ id, i });
      }
    });
    for (const ids of pool.values()) for (const id of ids) this.drop(id);
    this.hand = next;

    const playable = new Set(m.hand.flatMap((h, i) => (h.playable ? [i] : [])));
    const slots = handLayout(next.length, rig, { picked: pickedIndex, playable });
    const top = deckTopPose(m.deckCount);
    next.forEach((h, i) => {
      const slot = slots[i];
      if (!slot) return;
      const f = fresh.find((x) => x.id === h.id);
      if (f) {
        if (snap) this.store.place(h.id, slot);
        else {
          this.store.place(h.id, top);
          this.store.move(h.id, slot, now, {
            delay: delayOf(0, fresh.indexOf(f)),
            duration: DRAW_MS,
            ease: 'out',
            from: top,
            arc: 0.16,
          });
        }
      } else {
        this.store.move(h.id, slot, now, { duration: snap ? 0 : 240, ease: 'out' });
      }
    });
  }

  private reconcileOpponents(
    m: TableModel,
    now: number,
    snap: boolean,
    delayOf: (seatIndex: number, n: number) => number,
  ): void {
    const top = deckTopPose(m.deckCount);
    for (const seat of m.seats) {
      if (seat.index === 0) continue;
      const phi = seatPhi(seat.index, m.seats.length);
      const want = Math.min(seat.count, MAX_BACKS);
      const fan = backFan(seat.count, phi);
      const list = this.opp.get(seat.id) ?? [];
      while (list.length > want) this.drop(list.pop()!);
      let n = 0;
      const fresh = new Set<string>();
      while (list.length < want) {
        const id = this.spawn('back', null);
        list.push(id);
        fresh.add(id);
        const slot = fan[list.length - 1]!;
        if (snap) this.store.place(id, slot);
        else {
          this.store.place(id, top);
          this.store.move(id, slot, now, {
            delay: delayOf(seat.index, n),
            duration: DRAW_MS,
            ease: 'out',
            from: top,
            arc: 0.14,
          });
        }
        n++;
      }
      list.forEach((id, i) => {
        const slot = fan[i];
        if (slot && !fresh.has(id))
          this.store.move(id, slot, now, { duration: snap ? 0 : 240, ease: 'out' });
      });
      this.opp.set(seat.id, list);

      // The game is over: their cards turn over.
      if (m.over && seat.revealed) {
        list.forEach((id, i) => {
          const face = seat.revealed![i];
          if (!face) return;
          const spec = this.specs.get(id);
          if (spec && spec.face?.key !== face.key) {
            this.specs.set(id, { ...spec, face });
            this.changed = true;
            const to: Pose = { ...(this.store.poseOf(id) ?? fan[i]!), flip: 0 };
            this.store.move(id, to, now, {
              delay: snap ? 0 : 200 + i * 120,
              duration: snap ? 0 : 380,
              ease: 'inout',
            });
          }
        });
      }
    }
  }

  private reconcilePile(m: TableModel, now: number, snap: boolean, startDelay: number): void {
    const top = this.pile[this.pile.length - 1];
    if (!top || top.key !== m.top.key) {
      // Not what the table says (joined late, or the very start): put the right card down.
      for (const p of this.pile) this.drop(p.id);
      this.pile = [];
      const id = this.spawn('pile', m.top);
      this.pile.push({ id, key: m.top.key });
      const target = discardPose(id, 0);
      if (snap) this.store.place(id, target);
      else {
        const from = deckTopPose(m.deckCount);
        this.store.place(id, from);
        this.store.move(id, target, now, {
          delay: startDelay,
          duration: FLIGHT_MS,
          ease: 'out',
          from,
          arc: 0.18,
        });
      }
    }
    if (this.pile.length > PILE_MAX) {
      while (this.pile.length > PILE_MAX) this.drop(this.pile.shift()!.id);
      this.pile.forEach((p, i) => {
        if (i < this.pile.length - 1) this.store.place(p.id, discardPose(p.id, i));
      });
    }
  }

  // ---- effects ------------------------------------------------------------------------------------

  /** A quick riffle at the draw pile: a handful of cards flick in from both sides. */
  private riffle(now: number): void {
    if (this.reduced) return;
    const m = this.prev;
    const top = deckTopPose(m?.deckCount ?? 60);
    for (let i = 0; i < 10; i++) {
      const id = this.spawn('temp', null, now + 520 + i * 30 + 200);
      const side = i % 2 === 0 ? -1 : 1;
      const from = { ...top, x: top.x + side * 0.16, y: top.y + 0.03 + i * 0.002, ry: side * 0.3 };
      this.store.place(id, from);
      this.store.move(id, { ...top, y: top.y + 0.004 * (i % 3) }, now, {
        delay: i * 30,
        duration: 170,
        ease: 'out',
        from,
        arc: 0.05,
      });
    }
  }

  // ---- bookkeeping --------------------------------------------------------------------------------

  private spawn(role: ActorRole, face: Face | null, removeAt?: number): string {
    const id = `a${++this.counter}`;
    this.specs.set(id, { id, role, face, ...(removeAt !== undefined ? { removeAt } : null) });
    this.store.place(id, pose({ rx: LYING_RX }));
    this.changed = true;
    return id;
  }

  private drop(id: string): void {
    this.specs.delete(id);
    this.store.remove(id);
    this.changed = true;
  }
}
