import type {
  CreateDisputeRequest,
  DataExport,
  DeletionPreview,
  DeletionStatus,
  DisputeView,
  MatchDisputeInfo,
} from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the account, export and dispute endpoints of dyce-backend (ADR-037). */
export function createAccountApi(api: ApiClient) {
  return {
    /** The Delete account screen: what deleting does to you, and whether a request is already waiting. */
    deletion: () => api.get<{ status: DeletionStatus; preview: DeletionPreview }>('/me/deletion'),
    /** Starts the grace period. You type your username to confirm. Every session ends. */
    requestDeletion: (username: string) => api.post<DeletionStatus>('/me/delete', { username }),
    cancelDeletion: () => api.post<DeletionStatus>('/me/delete/cancel'),
    /** Your own data as one document. Limited to a few downloads an hour. */
    exportData: () => api.get<DataExport>('/me/export'),
    /** Where a Pool result stands for you: your dispute, and whether you still can. */
    dispute: (matchId: string) => api.get<MatchDisputeInfo>(`/matches/${matchId}/dispute`),
    openDispute: (matchId: string, input: CreateDisputeRequest) =>
      api.post<DisputeView>(`/matches/${matchId}/dispute`, input),
  };
}

export type AccountApi = ReturnType<typeof createAccountApi>;
