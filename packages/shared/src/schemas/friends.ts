import { z } from 'zod';
import type { PublicUser } from './contacts.ts';

/** Path parameter naming another user. */
export const userIdParamSchema = z.uuid();

export type FriendEntry = {
  id: string;
  username: string;
  displayName: string;
  /** ISO timestamp the friendship started. */
  since: string;
};
export type FriendsResponse = { friends: FriendEntry[] };

/** Someone who asked to be your friend. `mutualFriends` is how many friends you share. */
export type IncomingRequest = { user: PublicUser; requestedAt: string; mutualFriends: number };

/** Someone you asked. An ignored request still shows here as pending: the other person's choice stays private. */
export type OutgoingRequest = { user: PublicUser; requestedAt: string };

export type FriendRequestsResponse = {
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
};
