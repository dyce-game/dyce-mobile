/** TanStack Query keys. One place so invalidation never drifts. */
export const queryKeys = {
  me: ['me'] as const,
  profile: (username: string) => ['profile', username] as const,
  wallet: ['wallet'] as const,
  walletHistory: (filter: string) => ['wallet', 'history', filter] as const,
  receipt: (txnId: string) => ['wallet', 'receipt', txnId] as const,
  paymentRequest: (code: string) => ['payment-request', code] as const,
  /** Prefix for every conversation list (all / friends / requests). */
  conversationsAll: ['conversations'] as const,
  conversations: (filter: string) => ['conversations', filter] as const,
  conversation: (id: string) => ['conversation', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  requests: ['requests'] as const,
  /** Prefix for everything friends-related: invalidating it refreshes the list and the requests. */
  friends: ['friends'] as const,
  friendRequests: ['friends', 'requests'] as const,
  contactSuggestions: ['contacts', 'suggestions'] as const,
  games: ['games'] as const,
  match: (id: string) => ['match', id] as const,
  spaces: (scope: string) => ['spaces', scope] as const,
  space: (id: string) => ['space', id] as const,
  leaderboard: (scope: string) => ['leaderboard', scope] as const,
  notifications: ['notifications'] as const,
  appConfig: ['app-config'] as const,
} as const;
