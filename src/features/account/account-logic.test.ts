import type { DeletionPreview, DisputeView, MatchDisputeInfo } from '@dyce/shared';
import {
  deletionConfirmed,
  deletionRows,
  disputeBadge,
  disputeBlockedText,
  disputeReasonLabel,
  disputeSteps,
  disputeWindowText,
  exportFileName,
  openGamesNote,
} from './account-logic';

const preview: DeletionPreview = {
  username: 'kemdi.plays',
  balanceKobo: 20_000_000,
  openGames: 1,
  graceDays: 30,
};

describe('delete account', () => {
  it('unlocks only on the username, ignoring case, spaces and a leading @', () => {
    expect(deletionConfirmed('kemdi.plays', 'kemdi.plays')).toBe(true);
    expect(deletionConfirmed('  @Kemdi.Plays ', 'kemdi.plays')).toBe(true);
    expect(deletionConfirmed('kemdi', 'kemdi.plays')).toBe(false);
    expect(deletionConfirmed('', 'kemdi.plays')).toBe(false);
    expect(deletionConfirmed('@', '')).toBe(false);
  });

  it('says what happens to the money in real numbers, and never promises a payout', () => {
    const rows = deletionRows(preview);
    expect(rows.map((r) => r.title)).toContain('Dyce Cash is cleared');
    const money = rows.find((r) => r.mark === '₦')!;
    expect(money.body).toContain('₦200,000');
    expect(money.body).toContain('nothing is paid out');
    expect(
      deletionRows({ ...preview, balanceKobo: 0 }).find((r) => r.mark === '₦')!.body,
    ).toContain('already zero');
  });

  it('mentions open games only when there are some', () => {
    expect(openGamesNote({ ...preview, openGames: 0 })).toBeNull();
    expect(openGamesNote(preview)).toContain('1 game is still open');
    expect(openGamesNote({ ...preview, openGames: 3 })).toContain('3 games are still open');
  });
});

describe('download my data', () => {
  it('names the file by date', () => {
    expect(exportFileName(new Date(2026, 10, 5))).toBe('dyce-data-2026-11-05.json');
  });
});

const info = (over: Partial<MatchDisputeInfo>): MatchDisputeInfo => ({
  dispute: null,
  canDispute: true,
  blockedBy: null,
  windowEndsAt: '2026-11-15T12:00:00.000Z',
  ...over,
});
const dispute = (over: Partial<DisputeView>): DisputeView => ({
  id: 'd',
  reference: 'DY-DSP-4F2K9A',
  matchId: 'm',
  status: 'open',
  reason: 'cheat',
  note: null,
  createdAt: '2026-11-14T21:12:00.000Z',
  reviewingAt: null,
  resolvedAt: null,
  decisionNote: null,
  ...over,
});

describe('disputes', () => {
  it('counts down the window in hours, then minutes, and says nothing once it is shut', () => {
    const at = (iso: string) => new Date(iso);
    expect(disputeWindowText(info({}), at('2026-11-15T07:00:00.000Z'))).toBe(
      'You have 5 hours left to dispute this result.',
    );
    expect(disputeWindowText(info({}), at('2026-11-15T11:21:00.000Z'))).toBe(
      'You have 39 minutes left to dispute this result.',
    );
    expect(disputeWindowText(info({}), at('2026-11-15T11:59:30.000Z'))).toBe(
      'You have 1 minute left to dispute this result.',
    );
    expect(disputeWindowText(info({}), at('2026-11-15T12:00:01.000Z'))).toBeNull();
    expect(disputeWindowText(info({ windowEndsAt: null }))).toBeNull();
  });

  it('explains each reason a result cannot be disputed', () => {
    expect(disputeBlockedText(info({ canDispute: false, blockedBy: 'not_pool' }))).toContain(
      'Only Pool',
    );
    expect(disputeBlockedText(info({ canDispute: false, blockedBy: 'not_finished' }))).toContain(
      'finished',
    );
    expect(disputeBlockedText(info({ canDispute: false, blockedBy: 'window_closed' }))).toContain(
      '24 hour',
    );
    expect(disputeBlockedText(info({}))).toBeNull();
  });

  it('tells the status honestly: nothing is frozen, and a decision shows the moderator’s note', () => {
    const open = disputeSteps(dispute({}));
    expect(open.map((s) => s.state)).toEqual(['done', 'now', 'next']);
    expect(open.some((s) => /frozen|held/i.test(s.title + s.body))).toBe(false);

    const reviewing = disputeSteps(
      dispute({ status: 'reviewing', reviewingAt: '2026-11-15T09:00:00.000Z' }),
    );
    expect(reviewing.map((s) => s.state)).toEqual(['done', 'done', 'next']);

    const done = disputeSteps(
      dispute({
        status: 'reversed',
        reviewingAt: '2026-11-15T09:00:00.000Z',
        decisionNote: 'Moves were illegal.',
      }),
    );
    expect(done.map((s) => s.state)).toEqual(['done', 'done', 'done']);
    expect(done[2]!.body).toBe('Moves were illegal.');
    expect(disputeSteps(dispute({ status: 'upheld' }))[2]!.body).toContain('result stands');
  });

  it('labels reasons and badges', () => {
    expect(disputeReasonLabel('disconnect')).toBe('Unfair disconnect');
    expect(disputeBadge('open')).toBe('SUBMITTED');
    expect(disputeBadge('upheld')).toBe('RESULT STANDS');
    expect(disputeBadge('reversed')).toBe('CORRECTED');
  });
});
