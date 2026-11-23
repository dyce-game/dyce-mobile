import { useState } from 'react';
import type { LiveState, SpaceView } from '@dyce/shared';
import { Text } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { GameStateCard, OfflineGlyph } from '@/features/games/components/GameStateCard';
import { opponentIssueCopy, tableOfflineCopy } from '@/features/games/games-edge-logic';
import type { LiveStatus } from '../live-connection';
import { liveIssue, sameIssue, type LiveIssue } from '../live-issues-logic';

/**
 * The cards over a live table when a connection is lost (design: GameOffline, GameIssues): yours ("You're offline",
 * the table keeps your seat for 60 seconds) or someone else's ("Amaka lost connection"). The other person's card can
 * be dismissed to keep watching; it comes back if the set of people who are away changes.
 */
export function LiveIssueOverlay({
  space,
  live,
  status,
  myId,
  onRetry,
}: {
  space: SpaceView;
  live: LiveState | null;
  status: LiveStatus;
  myId: string | null;
  onRetry: () => void;
}) {
  const issue = liveIssue(live, status, myId);
  const [dismissed, setDismissed] = useState<LiveIssue>(null);
  if (!issue) return null;
  const pot = space.mode === 'pool' ? space.potKobo : 0;

  if (issue.kind === 'offline') {
    return (
      <GameStateCard
        tone="offline"
        center={<OfflineGlyph color="#0067D6" />}
        {...tableOfflineCopy(pot)}
        primary={{ label: 'Retry now', onPress: onRetry }}
      />
    );
  }
  if (sameIssue(issue, dismissed)) return null;
  const members = issue.userIds.map((id) => space.members.find((m) => m.userId === id));
  const names = members.map((m) => m?.displayName || m?.username || 'Someone');
  const first = members[0];
  return (
    <GameStateCard
      tone="issue"
      center={
        first ? (
          <UserAvatar avatar={first.avatar} name={names[0]!} size={64} />
        ) : (
          <Text variant="title">?</Text>
        )
      }
      {...opponentIssueCopy(names, pot)}
      primary={{ label: 'Keep waiting', onPress: () => setDismissed(issue) }}
    />
  );
}
