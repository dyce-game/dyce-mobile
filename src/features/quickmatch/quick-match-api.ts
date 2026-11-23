import type { QuickMatchState, QuickMatchTicket, StartQuickMatchRequest } from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the quick match endpoints of dyce-backend (apps/api). */
export function createQuickMatchApi(api: ApiClient) {
  return {
    /** Your open search (or the one that just ended) and the games you can quick match. */
    state: () => api.get<QuickMatchState>('/quick-match'),
    /** Joins the queue. Repeating the same search returns the same ticket. */
    join: (input: StartQuickMatchRequest) => api.post<QuickMatchTicket>('/quick-match', input),
    cancel: (id: string) => api.post<QuickMatchTicket>(`/quick-match/${id}/cancel`),
    accept: (id: string) => api.post<QuickMatchTicket>(`/quick-match/${id}/accept`),
    decline: (id: string) => api.post<QuickMatchTicket>(`/quick-match/${id}/decline`),
  };
}

export type QuickMatchApi = ReturnType<typeof createQuickMatchApi>;
