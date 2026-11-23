import type { ResultExtrasProps } from '../registry/types';
import { ResultStats } from './r3f-common/ResultStats';
import { youFirst } from './r3f-common/board-utils';
import { variantName, type DartsView } from './darts-logic';

/** Under the winner: darts thrown, what each had left, and the finish. */
export function DartsResult({ view, myId, nameOf }: ResultExtrasProps<DartsView>) {
  const [a, b] = youFirst(view.players, myId) as [string, string];
  const name = (id: string) => (id === myId ? 'You' : nameOf(id));
  const left = (id: string) => {
    const done = view.finishedWith[id];
    if (done !== null && done !== undefined) return 'Finished';
    const n = view.left[id] ?? 0;
    return view.variant === '501' ? String(n) : `${n} to go`;
  };
  return (
    <ResultStats
      myName={name(a)}
      theirName={name(b)}
      rows={[
        {
          label: view.variant === '501' ? 'Points left' : 'Numbers left',
          mine: left(a),
          theirs: left(b),
        },
        {
          label: 'Darts thrown',
          mine: String(view.thrown[a] ?? 0),
          theirs: String(view.thrown[b] ?? 0),
        },
      ]}
      note={`${variantName(view.variant)} · ${view.round} ${view.round === 1 ? 'round' : 'rounds'}`}
    />
  );
}
