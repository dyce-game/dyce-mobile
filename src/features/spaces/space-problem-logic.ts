import { formatNaira, type SpaceView } from '@dyce/shared';

/**
 * The words of the Space edge-state screens (design: RoomFull, RoomHostLeft, RoomRemoved; SPEC section 7 "Edge
 * cases"): the space is full, the host closed it (or it timed out unstarted), or you were removed. Each says what
 * happened to your money in plain words, from what the server says it did (`SpaceView.exit`, a 409 `space_full`).
 * Pure, so it is unit tested.
 */
export type SpaceProblemKind = 'full' | 'host_closed' | 'expired' | 'removed' | 'left';

export type SpaceProblemCopy = {
  kind: SpaceProblemKind;
  /** The glyph in the coloured tile. */
  glyph: string;
  tile: string;
  title: string;
  body: string;
  /** The green pill about money. */
  money: string | null;
  cta: string;
};

type Facts = {
  /** The space's name, if the server told us. */
  name?: string | null;
  hostName?: string | null;
  gameName?: string | null;
  seats?: number | null;
  refundedKobo?: number;
};

export function spaceProblem(kind: SpaceProblemKind, f: Facts = {}): SpaceProblemCopy {
  const refunded = f.refundedKobo ?? 0;
  const back = refunded > 0 ? `${formatNaira(refunded)} refunded to your wallet` : null;
  switch (kind) {
    case 'full':
      return {
        kind,
        glyph: f.seats ? `${f.seats}/${f.seats}` : 'Full',
        tile: '#C2410C',
        title: 'This space is full',
        body: 'Someone took the last seat. Ask the host to make room, or try another space.',
        money: 'Nothing was charged',
        cta: 'Back to spaces',
      };
    case 'host_closed':
      return {
        kind,
        glyph: '↩',
        tile: '#B33416',
        title: 'The host closed the space',
        body: `${f.hostName ?? 'The host'} ended the space before the game started. Every seat fee goes straight back.`,
        money: back ?? 'Nothing was charged',
        cta: 'Start your own space',
      };
    case 'expired':
      return {
        kind,
        glyph: '!',
        tile: '#B33416',
        title: 'This space timed out',
        body: 'Nobody started the game in time, so the space closed. Every seat fee goes straight back.',
        money: back ?? 'Nothing was charged',
        cta: 'Start your own space',
      };
    case 'removed':
      return {
        kind,
        glyph: '×',
        tile: '#6F655B',
        title: 'You were removed',
        body: 'The host removed you from this space. You can’t rejoin it, but you can play anyone else.',
        money:
          refunded > 0 ? `Your ${formatNaira(refunded)} entry was refunded` : 'Nothing was charged',
        cta: 'Back to spaces',
      };
    case 'left':
      return {
        kind,
        glyph: '↩',
        tile: '#6F655B',
        title: 'You left this space',
        body: 'Your seat is free for someone else.',
        money: back,
        cta: 'Back to spaces',
      };
  }
}

/** Which edge-state a space you no longer sit in should show, or null when it isn't one (still seated, etc.). */
export function problemForSpace(space: SpaceView): SpaceProblemCopy | null {
  if (space.seated) return null;
  const x = space.exit;
  if (x) {
    return spaceProblem(x.reason, {
      hostName: x.hostName,
      refundedKobo: x.refundedKobo,
      name: space.name,
    });
  }
  if (space.status === 'closed') return spaceProblem('host_closed', { refundedKobo: 0 });
  return spaceProblem('left');
}

/** What the join screen knows after a failed join, from the API's error code and details. */
export function problemForJoinError(
  code: string,
  details: Record<string, unknown> = {},
): SpaceProblemCopy | null {
  if (code === 'space_full') {
    return {
      ...spaceProblem('full', {
        name: typeof details.name === 'string' ? details.name : null,
        seats: typeof details.seats === 'number' ? details.seats : null,
      }),
      body: `Someone took the last seat${typeof details.name === 'string' ? ` in ${details.name}` : ''}. Ask the host to make room, or try another space.`,
    };
  }
  if (code === 'space_removed') return spaceProblem('removed');
  return null;
}
