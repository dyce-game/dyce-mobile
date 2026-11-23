import type { ResultExtrasProps } from '../registry/types';
import { ResultStats } from './r3f-common/ResultStats';
import { youFirst } from './r3f-common/board-utils';
import { archerStats, type ArcheryView } from './archery-logic';

/** Under the winner: points, Xs (the tie-break), arrows in the gold and the best arrow. */
export function ArcheryResult({ view, myId, nameOf }: ResultExtrasProps<ArcheryView>) {
  const [a, b] = youFirst(view.players, myId) as [string, string];
  const name = (id: string) => (id === myId ? 'You' : nameOf(id));
  const sa = archerStats(view, a);
  const sb = archerStats(view, b);
  return (
    <ResultStats
      myName={name(a)}
      theirName={name(b)}
      rows={[
        { label: 'Points', mine: String(view.score[a] ?? 0), theirs: String(view.score[b] ?? 0) },
        { label: 'X (tie-break)', mine: String(sa.xs), theirs: String(sb.xs) },
        { label: 'Arrows in the gold', mine: String(sa.gold), theirs: String(sb.gold) },
        { label: 'Best arrow', mine: String(sa.best), theirs: String(sb.best) },
        { label: 'Missed', mine: String(sa.misses), theirs: String(sb.misses) },
      ]}
      note={`${view.ends} ends of ${view.arrowsPerEnd} arrows at 30 m. Equal points: more Xs wins.`}
    />
  );
}
