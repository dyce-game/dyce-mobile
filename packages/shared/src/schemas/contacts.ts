import { z } from 'zod';
import { normalizePhone } from '../phone.ts';

/** Contacts are matched in batches of at most this many numbers (docs: batch in chunks of 500). */
export const CONTACT_BATCH_SIZE = 500;

/** E.164: "+" then 7-15 digits, no leading zero. Devices send already-normalised numbers. */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export const contactsMatchSchema = z.object({
  numbers: z.array(z.string().regex(E164_PATTERN, 'Invalid number')).min(1).max(CONTACT_BATCH_SIZE),
});
export type ContactsMatchRequest = z.infer<typeof contactsMatchSchema>;

export const friendRequestSchema = z.object({ userId: z.uuid() });

/** How the signed-in user relates to someone else. */
export type Relationship = 'none' | 'friends' | 'pending_out' | 'pending_in';

/** What any signed-in user may learn about another user. Never includes a phone number. */
export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  relationship: Relationship;
};

/** `index` is the position of the matched number in the request's `numbers` array. */
export type ContactMatch = { index: number; user: PublicUser };
export type ContactsMatchResponse = { matches: ContactMatch[] };
export type ContactSuggestionsResponse = { suggestions: PublicUser[] };

// ---- device contacts -> numbers to send ---------------------------------------------------------

export type DeviceContact = { id: string; name: string; phones: string[] };

export type PreparedContacts = {
  /** Unique E.164 numbers, in a stable order. */
  numbers: string[];
  /** `labels[i]` is the device contact name for `numbers[i]` (names never leave the device). */
  labels: string[];
};

/**
 * Normalises device contacts to unique E.164 numbers. Invalid numbers are dropped, duplicates (the same
 * person saved twice, or in different formats) are merged keeping the first name, and the user's own
 * number is removed. Pure, so the exact rules are unit-tested.
 */
export function prepareContacts(
  contacts: DeviceContact[],
  defaultCountry?: string,
  ownE164?: string,
): PreparedContacts {
  const seen = new Map<string, string>();
  for (const contact of contacts) {
    for (const raw of contact.phones) {
      const e164 = normalizePhone(raw, defaultCountry);
      if (!e164 || e164 === ownE164 || seen.has(e164)) continue;
      seen.set(e164, contact.name);
    }
  }
  return { numbers: [...seen.keys()], labels: [...seen.values()] };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
