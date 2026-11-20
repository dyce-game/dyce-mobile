import type { ContactsMatchResponse, PublicUser } from '@dyce/shared';
import { prepareContacts } from '@dyce/shared';
import { addAction, syncContacts, syncContactsWithInvitable, withRelationship } from './sync';

const user = (id: string, relationship: PublicUser['relationship'] = 'none'): PublicUser => ({
  id,
  username: `user_${id}`,
  displayName: `User ${id}`,
  avatar: null,
  relationship,
});

/** A fake server: knows which numbers belong to which user, answers like POST /contacts/match. */
function fakeServer(known: Record<string, PublicUser>) {
  const calls: string[][] = [];
  const matchBatch = async (numbers: string[]): Promise<ContactsMatchResponse> => {
    calls.push(numbers);
    return {
      matches: numbers.flatMap((n, index) => (known[n] ? [{ index, user: known[n]! }] : [])),
    };
  };
  return { calls, matchBatch };
}

describe('syncContacts', () => {
  it('recovers the device contact name for each match', async () => {
    const prepared = {
      numbers: ['+2348031111111', '+2348032222222', '+2348033333333'],
      labels: ['Mum', 'Tunde', 'Bank'],
    };
    const { matchBatch } = fakeServer({ '+2348032222222': user('t'), '+2348031111111': user('m') });
    const res = await syncContacts(prepared, matchBatch);
    expect(res.map((r) => [r.contactName, r.user.id])).toEqual([
      ['Mum', 'm'],
      ['Tunde', 't'],
    ]);
  });

  it('batches by 500 and translates positions across batches', async () => {
    const numbers = Array.from({ length: 1234 }, (_, i) => `+23480${String(30000000 + i)}`);
    const labels = numbers.map((_, i) => `Contact ${i}`);
    const { calls, matchBatch } = fakeServer({
      [numbers[3]!]: user('a'), // batch 1
      [numbers[700]!]: user('b'), // batch 2, position 200
      [numbers[1233]!]: user('c'), // batch 3, position 233
    });
    const progress: number[] = [];
    const res = await syncContacts({ numbers, labels }, matchBatch, (done) => progress.push(done));
    expect(calls.map((c) => c.length)).toEqual([500, 500, 234]);
    expect(res.map((r) => r.contactName).sort()).toEqual([
      'Contact 1233',
      'Contact 3',
      'Contact 700',
    ]);
    expect(progress).toEqual([500, 1000, 1234]);
  });

  it('lists a person once even if two of their numbers are in the address book', async () => {
    const prepared = {
      numbers: ['+2348031111111', '+2348032222222'],
      labels: ['Tunde', 'Tunde (work)'],
    };
    const u = user('t');
    const { matchBatch } = fakeServer({ '+2348031111111': u, '+2348032222222': u });
    const res = await syncContacts(prepared, matchBatch);
    expect(res).toHaveLength(1);
    expect(res[0]!.contactName).toBe('Tunde');
  });

  it('does nothing for an empty address book', async () => {
    const { calls, matchBatch } = fakeServer({});
    expect(await syncContacts({ numbers: [], labels: [] }, matchBatch)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('propagates a mid-sync failure (e.g. the daily limit) instead of returning a partial list silently', async () => {
    const numbers = Array.from({ length: 600 }, (_, i) => `+23480${String(30000000 + i)}`);
    let n = 0;
    await expect(
      syncContacts({ numbers, labels: numbers }, async () => {
        if (++n === 2) throw new Error('contacts_rate_limited');
        return { matches: [] };
      }),
    ).rejects.toThrow('contacts_rate_limited');
  });

  it('works end to end with prepareContacts on a messy address book', async () => {
    const prepared = prepareContacts(
      [
        { id: '1', name: 'Tunde', phones: ['0803 111 1111', '+234 803 111 1111'] },
        { id: '2', name: 'Bank', phones: ['737'] },
        { id: '3', name: 'Ngozi', phones: ['0805 222 2222'] },
      ],
      'NG',
    );
    const { calls, matchBatch } = fakeServer({ '+2348052222222': user('n') });
    const res = await syncContacts(prepared, matchBatch);
    expect(calls).toEqual([['+2348031111111', '+2348052222222']]);
    expect(res.map((r) => r.contactName)).toEqual(['Ngozi']);
  });
});

describe('addAction', () => {
  it('maps each relationship to a button', () => {
    expect(addAction('none')).toEqual({ label: 'Add', pressable: true });
    expect(addAction('pending_in')).toEqual({ label: 'Accept', pressable: true });
    expect(addAction('pending_out')).toEqual({ label: 'Requested', pressable: false });
    expect(addAction('friends')).toEqual({ label: 'Friends', pressable: false });
  });
});

describe('withRelationship', () => {
  it('updates only the person who was added', () => {
    const list = [{ user: user('a') }, { user: user('b') }];
    const next = withRelationship(list, 'b', 'pending_out');
    expect(next.map((i) => i.user.relationship)).toEqual(['none', 'pending_out']);
    expect(list[1]!.user.relationship).toBe('none'); // original untouched
  });
});

describe('syncContactsWithInvitable', () => {
  it('returns named contacts nobody on Dyce owns, A-Z, and skips matched or unnamed ones', async () => {
    const prepared = {
      numbers: ['+2348031111111', '+2348032222222', '+2348033333333', '+2348034444444'],
      labels: ['Mum', 'Zainab', 'Bode', ''],
    };
    const { matchBatch } = fakeServer({ '+2348031111111': user('m') });
    const res = await syncContactsWithInvitable(prepared, matchBatch);
    expect(res.matches.map((m) => m.user.id)).toEqual(['m']);
    expect(res.invitable).toEqual([
      { key: '+2348033333333', name: 'Bode', e164: '+2348033333333' },
      { key: '+2348032222222', name: 'Zainab', e164: '+2348032222222' },
    ]);
  });

  it('translates positions across batches', async () => {
    const numbers = Array.from({ length: 700 }, (_, i) => `+23480${String(30000000 + i)}`);
    const prepared = { numbers, labels: numbers.map((_, i) => `C${i}`) };
    const { matchBatch } = fakeServer({ [numbers[600]!]: user('x') });
    const res = await syncContactsWithInvitable(prepared, matchBatch);
    expect(res.invitable).toHaveLength(699);
    expect(res.invitable.some((c) => c.e164 === numbers[600])).toBe(false);
  });
});
