import type { ResultExtrasProps } from '../registry/types';
import { ResultStats } from './r3f-common/ResultStats';
import { youFirst } from './r3f-common/board-utils';
import { shooterStats, type BasketballView } from './basketball-logic';

/** Under the winner: shots made out of shots taken, swishes, and the points from the money rack. */
export function BasketballResult({ view, myId, nameOf }: ResultExtrasProps<BasketballView>) {
  const [a, b] = youFirst(view.players, myId) as [string, string];
  const name = (id: string) => (id === myId ? 'You' : nameOf(id));
  const sa = shooterStats(view, a);
  const sb = shooterStats(view, b);
  return (
    <ResultStats
      myName={name(a)}
      theirName={name(b)}
      rows={[
        { label: 'Points', mine: String(view.score[a] ?? 0), theirs: String(view.score[b] ?? 0) },
        {
          label: 'Shots made',
          mine: `${sa.made} of ${sa.taken}`,
          theirs: `${sb.made} of ${sb.taken}`,
        },
        { label: 'Swishes', mine: String(sa.swishes), theirs: String(sb.swishes) },
        { label: 'Money ball makes', mine: String(sa.money), theirs: String(sb.money) },
      ]}
      note="The last rack is the money-ball rack: every make there is worth 2."
    />
  );
}
