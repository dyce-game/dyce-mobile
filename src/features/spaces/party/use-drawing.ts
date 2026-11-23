import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasStroke } from '@dyce/games';
import {
  MAX_POINTS,
  MAX_STROKES,
  StrokeBuffer,
  canvasHasRoom,
  keepPoint,
  pointsUsed,
  type Pt,
} from './doodle-logic';
import type { TouchPhase } from './components/DrawingCanvas';

/** How often a stroke being drawn is sent (the room batches to the other seats about every 150 ms). */
const FLUSH_MS = 120;

type Options = {
  /** You are the drawer and the draw phase is on. */
  enabled: boolean;
  /** The turn number: a new turn starts with an empty canvas. */
  turn: number;
  color: number;
  width: number;
  /** Sends one action to the room. */
  send: (action: unknown) => boolean;
};

/**
 * The drawer's side of Doodle Guess. Touches become points (thinned, integer, 0..1000), the stroke is
 * painted locally at once and streamed to the room in chunks of at most 64 points every ~120 ms (the first
 * chunk starts the stroke, the next ones set `cont`). Undo and clear change the local picture and tell the
 * room. The room's own `canvas` messages come back and `drawerStrokes` decides which picture to show.
 */
export function useDrawing(opts: Options) {
  const [local, setLocal] = useState<CanvasStroke[]>([]);
  const localRef = useRef<CanvasStroke[]>([]);
  const changedAt = useRef(0);
  const buffer = useRef<StrokeBuffer | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPt = useRef<Pt | null>(null);
  const nextId = useRef(-1);
  const o = useRef(opts);
  o.current = opts;

  const commit = useCallback((next: CanvasStroke[]) => {
    localRef.current = next;
    changedAt.current = Date.now();
    setLocal(next);
  }, []);

  const flush = useCallback(() => {
    const b = buffer.current;
    if (!b) return;
    for (const a of b.drain()) o.current.send(a);
  }, []);

  const finish = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    flush();
    buffer.current = null;
    lastPt.current = null;
  }, [flush]);

  // A new turn (or no longer drawing): stop what is in flight and start from the room's canvas.
  useEffect(() => {
    finish();
    commit([]);
  }, [opts.turn, finish, commit]);
  useEffect(() => {
    if (!opts.enabled) finish();
  }, [opts.enabled, finish]);
  useEffect(() => finish, [finish]);

  const onTouch = useCallback(
    (phase: TouchPhase, pt: Pt) => {
      if (!o.current.enabled) return;
      if (phase === 'start') {
        finish();
        const cur = localRef.current;
        if (cur.length >= MAX_STROKES || pointsUsed(cur) >= MAX_POINTS) return;
        const b = new StrokeBuffer(o.current.color, o.current.width);
        buffer.current = b;
        lastPt.current = pt;
        b.add(pt);
        commit([
          ...cur,
          { id: nextId.current--, color: o.current.color, width: o.current.width, pts: [pt] },
        ]);
        timer.current = setInterval(flush, FLUSH_MS);
        return;
      }
      const b = buffer.current;
      if (!b) return;
      if (phase === 'move') {
        if (!keepPoint(lastPt.current, pt) || pointsUsed(localRef.current) >= MAX_POINTS) return;
        lastPt.current = pt;
        b.add(pt);
        const cur = localRef.current;
        const active = cur[cur.length - 1];
        if (!active) return;
        commit([...cur.slice(0, -1), { ...active, pts: [...active.pts, pt] }]);
        return;
      }
      // end
      finish();
    },
    [commit, finish, flush],
  );

  const undo = useCallback(() => {
    finish();
    if (localRef.current.length === 0) return;
    commit(localRef.current.slice(0, -1));
    o.current.send({ kind: 'undo' });
  }, [commit, finish]);

  const clear = useCallback(() => {
    finish();
    if (localRef.current.length === 0) return;
    commit([]);
    o.current.send({ kind: 'clear' });
  }, [commit, finish]);

  /** Draws a ready-made stroke (a stamped shape) in one go. False when the canvas is full. */
  const stamp = useCallback(
    (points: Pt[]): boolean => {
      finish();
      if (!canvasHasRoom(localRef.current, points.length)) return false;
      const { color, width } = o.current;
      commit([...localRef.current, { id: nextId.current--, color, width, pts: points }]);
      o.current.send({ kind: 'stroke', points, color, width });
      return true;
    },
    [commit, finish],
  );

  return { local, changedAt, onTouch, undo, clear, stamp, adopt: commit };
}
