import type { BlocksResponse, ReportRequest, ReportResult } from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the block and report endpoints of dyce-backend (apps/api). */
export function createSafetyApi(api: ApiClient) {
  return {
    blocked: () => api.get<BlocksResponse>('/blocks'),
    /** Silent: the person is not told. */
    block: (userId: string) => api.post<void>('/blocks', { userId }),
    unblock: (userId: string) => api.delete<void>(`/blocks/${userId}`),
    report: (input: Pick<ReportRequest, 'userId' | 'reason'> & Partial<ReportRequest>) =>
      api.post<ReportResult>('/reports', input),
  };
}

export type SafetyApi = ReturnType<typeof createSafetyApi>;
