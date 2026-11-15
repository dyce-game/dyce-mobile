import type { CreateMatchRequest, GamesResponse, MatchView, SubmitMoveRequest } from '@dyce/shared';
import type { ApiClient } from '../auth/api-client';

/** Typed wrappers over the games and matches endpoints of dyce-backend (apps/api). */
export function createGamesApi(api: ApiClient) {
  return {
    /** The games you can send from a chat. */
    list: () => api.get<GamesResponse>('/games'),
    /** `input.id` is chosen by the app, so retrying a failed send can't send two games. */
    create: (input: CreateMatchRequest) => api.post<MatchView>('/matches', input),
    get: (id: string) => api.get<MatchView>(`/matches/${id}`),
    accept: (id: string) => api.post<MatchView>(`/matches/${id}/accept`),
    decline: (id: string) => api.post<MatchView>(`/matches/${id}/decline`),
    cancel: (id: string) => api.post<MatchView>(`/matches/${id}/cancel`),
    /** Retrying the same move with the same `expectedVersion` is safe. */
    move: (id: string, input: SubmitMoveRequest) =>
      api.post<MatchView>(`/matches/${id}/moves`, input),
  };
}

export type GamesApi = ReturnType<typeof createGamesApi>;
