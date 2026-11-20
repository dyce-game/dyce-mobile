import type { CreateSpaceRequest, SpaceConnection, SpaceView, SpacesResponse } from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the Spaces endpoints of dyce-backend (apps/api). */
export function createSpacesApi(api: ApiClient) {
  return {
    /** Your spaces: waiting, live and recently finished. */
    list: () => api.get<SpacesResponse>('/spaces'),
    get: (id: string) => api.get<SpaceView>(`/spaces/${id}`),
    /** `input.id` is chosen by the app, so retrying a failed create can't make two spaces. */
    create: (input: CreateSpaceRequest) => api.post<SpaceView>('/spaces', input),
    /** What a code leads to, before sitting down. */
    lookup: (code: string) => api.get<SpaceView>(`/spaces/lookup?code=${encodeURIComponent(code)}`),
    join: (code: string) => api.post<SpaceView>('/spaces/join', { code }),
    leave: (id: string) => api.post<SpaceView>(`/spaces/${id}/leave`),
    remove: (id: string, userId: string) => api.post<SpaceView>(`/spaces/${id}/remove`, { userId }),
    close: (id: string) => api.post<SpaceView>(`/spaces/${id}/close`),
    start: (id: string) => api.post<SpaceView>(`/spaces/${id}/start`),
    /** Where to open the live connection (the server makes sure the room exists). */
    connect: (id: string) => api.post<SpaceConnection>(`/spaces/${id}/connect`),
  };
}

export type SpacesApi = ReturnType<typeof createSpacesApi>;
