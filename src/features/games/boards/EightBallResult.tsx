import type { ResultExtrasProps } from '../registry/types';
import { ResultStats } from './r3f-common/ResultStats';
import { youFirst } from './r3f-common/board-utils';
import { endNote, groupLeft, groupWord, type EightBallView } from './eight-ball-logic';

/** Under the winner: whose group was which, how many balls each had left, and how the 8 decided it. */
export function EightBallResult({ view, myId, nameOf }: ResultExtrasProps<EightBallView>) {
  const order = youFirst(view.players, myId);
  const [a, b] = order as [string, string];
  const g = (id: string) => view.groups?.[id] ?? null;
  const left = (id: string) => (g(id) ? String(groupLeft(view, g(id) as 'solid' | 'stripe')) : '–');
  const name = (id: string) => (id === myId ? 'You' : nameOf(id));
  return (
    <ResultStats
      myName={name(a)}
      theirName={name(b)}
      rows={[
        { label: 'Group', mine: groupWord(g(a)), theirs: groupWord(g(b)) },
        { label: 'Balls left', mine: left(a), theirs: left(b) },
      ]}
      note={[endNote(view, myId, nameOf), `${view.shots} shots played.`].filter(Boolean).join(' ')}
    />
  );
}
