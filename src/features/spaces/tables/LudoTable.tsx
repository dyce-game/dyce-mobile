import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LiveState, MatchPlayer, MatchView, SpaceView } from '@dyce/shared';
import { Text } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { LudoBoard } from '@/features/games/boards/LudoBoard';
import { parseLudoView } from '@/features/games/boards/ludo-logic';
import type { LiveStatus } from '../live-connection';
import {
  LeaveSheet,
  ON,
  ON_DIM,
  PartyHeader,
  Scene,
  useLeaveSheet,
} from '../party/components/PartyChrome';
import { ResultsPanel } from '../party/components/ResultsPanel';
import { secondsLeft } from '../party-logic';
import { ludoSeatLine, ludoTableMembers } from './ludo-table-logic';

export type LudoTableProps = {
  space: SpaceView;
  myId: string;
  live: LiveState;
  status: LiveStatus;
  receivedAt: number;
  errorCode: string | null;
  onMove: (action: unknown) => boolean;
  onForfeit: () => void;
  onBack: () => void;
  onContinue: () => void;
};

const SCENE = { top: '#1B4A38', bottom: '#07140F', glow: '#2E8F64' };

/**
 * The Ludo room for 3 or 4 (backend ADR-043): the same Ludo board as the chat game, drawn from the room's view of
 * the seat, with the room's seats and the turn clock around it. The room rolls and moves for a seat that is out
 * of time, so the only thing the player does is roll and tap a token. The server decides every roll and move.
 */
export function LudoTable(props: LudoTableProps) {
  const { space, myId, live, status, receivedAt, errorCode, onMove, onForfeit, onBack } = props;
  const view = parseLudoView(live.view);
  const leave = useLeaveSheet();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  // A move is on its way until the table moves on to the next version.
  const [sentAt, setSentAt] = useState<number | null>(null);
  const busy = sentAt !== null && sentAt === live.version;

  const members = ludoTableMembers(space, live);
  const players: MatchPlayer[] = members.map((m) => ({
    userId: m.userId,
    username: m.username,
    displayName: m.displayName,
    avatar: m.avatar,
    seat: m.seat,
    accepted: true,
    result: null,
    placement: null,
    stakedKobo: m.stakedKobo,
    payoutKobo: null,
  }));
  const finished = live.status === 'finished';
  const seconds = secondsLeft(live, receivedAt, now);
  const yourTurn = live.status === 'live' && live.turnUserId === myId;

  return (
    <Scene colors={SCENE}>
      <PartyHeader space={space} onBack={onBack} onMenu={leave.show} />
      <View style={styles.seats} accessibilityLabel="Players">
        {members.map((m) => {
          const line = ludoSeatLine(m, live, myId, seconds);
          return (
            <View
              key={m.userId}
              accessible
              accessibilityLabel={line.spoken}
              style={[styles.seat, line.onTurn ? styles.seatOn : null]}
            >
              <UserAvatar avatar={m.avatar} name={m.displayName || m.username} size={34} />
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: line.onTurn ? ON : ON_DIM }}
              >
                {line.label}
              </Text>
              {line.note ? (
                <Text variant="caption" style={{ color: line.onTurn ? '#FFD27A' : ON_DIM }}>
                  {line.note}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.board}>
        {view ? (
          <LudoBoard
            matchId={live.matchId}
            // The board only draws `view`; the match it is part of is the room.
            match={{ id: live.matchId } as unknown as MatchView}
            view={view}
            players={players}
            myId={myId}
            yourTurn={yourTurn}
            busy={busy}
            moveFailed={errorCode !== null}
            onMove={(action) => {
              if (onMove(action)) setSentAt(live.version);
            }}
          />
        ) : (
          <Text style={{ color: ON_DIM }} accessibilityLiveRegion="polite">
            {status === 'reconnecting' ? 'Reconnecting to the table…' : 'Setting up the table…'}
          </Text>
        )}
      </View>
      {leave.open ? (
        <LeaveSheet
          space={space}
          onLeave={() => {
            leave.hide();
            onForfeit();
          }}
          onStay={leave.hide}
        />
      ) : null}
      {finished ? (
        <ResultsPanel
          space={space}
          live={live}
          myId={myId}
          nameOf={(id) => {
            const m = members.find((x) => x.userId === id);
            return m ? m.displayName || m.username : 'Player';
          }}
          title="Ludo"
          sub="The first home wins; the rest are placed by how far they got."
          onContinue={props.onContinue}
        />
      ) : null}
    </Scene>
  );
}

const styles = StyleSheet.create({
  seats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seat: {
    flex: 1,
    maxWidth: 96,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  seatOn: { borderColor: '#FFD27A', backgroundColor: 'rgba(255,210,122,0.12)' },
  board: { flex: 1 },
});
