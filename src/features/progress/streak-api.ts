import type { StreakStatus } from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the streak endpoints of dyce-backend (apps/api, ADR-042). */
export function createStreakApi(api: ApiClient) {
  return {
    /** Your streak, and the one that just ended and can be saved. */
    get: () => api.get<StreakStatus>('/me/streak'),
    /** The "streak lost" screen was seen or dismissed: do not show it again for this loss. */
    seen: () => api.post<{ ok: true }>('/me/streak/seen'),
  };
}
export type StreakApi = ReturnType<typeof createStreakApi>;
