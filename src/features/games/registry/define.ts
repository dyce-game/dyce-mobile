import type { AnyGameEntry, GameEntry } from './types';

/** Types an entry against its own view type, then stores it with the view type erased. */
export function defineGame<V>(entry: GameEntry<V>): AnyGameEntry {
  return entry as unknown as AnyGameEntry;
}
