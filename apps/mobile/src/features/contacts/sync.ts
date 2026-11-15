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

/**
 * Sends the prepared numbers to the server in batches of at most 500 and merges the answers.
 * The server reports each match by its position within the batch it received, so positions are
 * translated back to the whole list to recover the device contact name. A person reachable through two
 * numbers appears once.
 */
export async function syncContacts(
  prepared: PreparedContacts,
  matchBatch: (numbers: string[]) => Promise<ContactsMatchResponse>,
  onProgress?: (done: number, total: number) => void,
): Promise<SyncedMatch[]> {
  const byUser = new Map<string, SyncedMatch>();
  let offset = 0;
  for (const batch of chunk(prepared.numbers, CONTACT_BATCH_SIZE)) {
    const res = await matchBatch(batch);
    for (const m of res.matches) {
      if (byUser.has(m.user.id)) continue;
      byUser.set(m.user.id, { user: m.user, contactName: prepared.labels[offset + m.index] ?? '' });
    }
    offset += batch.length;
    onProgress?.(offset, prepared.numbers.length);
  }
  return [...byUser.values()].sort((a, b) =>
    (a.contactName || a.user.username).localeCompare(b.contactName || b.user.username),
  );
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
