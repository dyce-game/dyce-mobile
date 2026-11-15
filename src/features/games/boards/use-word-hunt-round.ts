import { useCallback, useEffect, useRef, useState } from 'react';
import { secureStorage } from '@/lib/storage';
import { parseSavedRound, addFound, type SavedRound } from './word-hunt-logic';

/** Rounds seen in this run of the app, so leaving the screen and coming back keeps the clock and the words. */
const memory = new Map<string, SavedRound>();

const keyFor = (matchId: string) => `dyce.wordhunt.${matchId}`;

/**
 * The player's round on this device: when it began and the words found so far. The server only knows when
 * `start` arrived, so the app keeps its own copy (also on disk, for a restart) and a round survives
 * leaving the board. The server still enforces the real clock: this only decides what the screen shows.
 *
 * `playing` is true while the server says this player is mid-round. The round begins when the screen first
 * sees that (right after Start is accepted), or when it is found already running with nothing saved (then
 * the clock restarts here; the server's own clock still applies).
 */
export function useWordHuntRound(matchId: string, playing: boolean, done: boolean) {
  const [round, setRound] = useState<SavedRound | null>(() => memory.get(matchId) ?? null);
  const [ready, setReady] = useState(memory.has(matchId));
  const latest = useRef(round);
  latest.current = round;

  const save = useCallback(
    (next: SavedRound) => {
      memory.set(matchId, next);
      setRound(next);
      void secureStorage.setItem(keyFor(matchId), JSON.stringify(next)).catch(() => {});
    },
    [matchId],
  );

  // Load what was saved on disk (once).
  useEffect(() => {
    if (ready) return;
    let alive = true;
    secureStorage
      .getItem(keyFor(matchId))
      .then((raw) => {
        const saved = parseSavedRound(raw);
        if (saved && alive && !latest.current) {
          memory.set(matchId, saved);
          setRound(saved);
        }
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [matchId, ready]);

  // The round begins.
  useEffect(() => {
    if (playing && ready && !round) save({ startedAt: Date.now(), words: [] });
  }, [playing, ready, round, save]);

  // Sent: nothing more to keep.
  useEffect(() => {
    if (!done) return;
    memory.delete(matchId);
    void secureStorage.removeItem(keyFor(matchId)).catch(() => {});
  }, [done, matchId]);

  const addWord = useCallback(
    (word: string) => {
      const cur = latest.current;
      if (cur) save({ ...cur, words: addFound(cur.words, word) });
    },
    [save],
  );

  return { round, ready, addWord };
}
