import {
  CONTACT_BATCH_SIZE,
  chunk,
  type ContactsMatchResponse,
  type PreparedContacts,
  type PublicUser,
  type Relationship,
} from '@dyce/shared';

export type SyncedMatch = {
  user: PublicUser;
  /** The name from the device address book. It never leaves the phone. */
  contactName: string;
};

/** A person from the address book who is not on Dyce: someone to text an invite to. */
export type InvitableContact = { key: string; name: string; e164: string };

export type SyncResult = { matches: SyncedMatch[]; invitable: InvitableContact[] };

/**
 * Sends the prepared numbers to the server in batches of at most 500 and merges the answers.
 * The server reports each match by its position within the batch it received, so positions are
 * translated back to the whole list to recover the device contact name. A person reachable through two
 * numbers appears once. Numbers nobody on Dyce owns come back as `invitable` (named, A-Z), kept on the
 * device only: the server has not stored them.
 */
export async function syncContactsWithInvitable(
  prepared: PreparedContacts,
  matchBatch: (numbers: string[]) => Promise<ContactsMatchResponse>,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncResult> {
  const byUser = new Map<string, SyncedMatch>();
  const matched = new Set<number>();
  let offset = 0;
  for (const batch of chunk(prepared.numbers, CONTACT_BATCH_SIZE)) {
    const res = await matchBatch(batch);
    for (const m of res.matches) {
      matched.add(offset + m.index);
      if (byUser.has(m.user.id)) continue;
      byUser.set(m.user.id, { user: m.user, contactName: prepared.labels[offset + m.index] ?? '' });
    }
    offset += batch.length;
    onProgress?.(offset, prepared.numbers.length);
  }
  const matches = [...byUser.values()].sort((a, b) =>
    (a.contactName || a.user.username).localeCompare(b.contactName || b.user.username),
  );
  const invitable: InvitableContact[] = [];
  prepared.numbers.forEach((e164, i) => {
    const name = prepared.labels[i]?.trim();
    // A saved number with no name (a short code, a bank) is not a person to invite.
    if (!matched.has(i) && name) invitable.push({ key: e164, name, e164 });
  });
  invitable.sort((a, b) => a.name.localeCompare(b.name));
  return { matches, invitable };
}

/** Matches only (no invitable list); see syncContactsWithInvitable. */
export async function syncContacts(
  prepared: PreparedContacts,
  matchBatch: (numbers: string[]) => Promise<ContactsMatchResponse>,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncedMatch[]> {
  return (await syncContactsWithInvitable(prepared, matchBatch, onProgress)).matches;
}

export type AddAction = { label: string; pressable: boolean };

/** What the button next to a person says, and whether it can be pressed. */
export function addAction(relationship: Relationship): AddAction {
  switch (relationship) {
    case 'none':
      return { label: 'Add', pressable: true };
    case 'pending_in':
      return { label: 'Accept', pressable: true };
    case 'pending_out':
      return { label: 'Requested', pressable: false };
    case 'friends':
      return { label: 'Friends', pressable: false };
  }
}

/** The relationship after a successful add/accept, as reported by the server. */
export function withRelationship<T extends { user: PublicUser }>(
  items: T[],
  userId: string,
  relationship: Relationship,
): T[] {
  return items.map((i) => (i.user.id === userId ? { ...i, user: { ...i.user, relationship } } : i));
}
