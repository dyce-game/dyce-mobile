import type { ClientStep, NextStep, SessionResponse } from '@dyce/shared';
import type { ApiClient } from './api-client';

export type Me = {
  userId: string;
  profile: {
    username: string;
    displayName: string;
    isAdult: boolean;
    level: number;
    xp: number;
  } | null;
  nextStep: NextStep;
};

export type UsernameCheck = { available: boolean; suggestions: string[] };

/** Typed wrappers over the auth/profile endpoints of apps/api. */
export function createAuthApi(api: ApiClient) {
  return {
    requestOtp: (phone: string, country?: string) =>
      api.post<{ resendAfterSeconds: number; expiresInSeconds: number }>(
        '/auth/otp/request',
        { phone, country },
        { auth: false },
      ),
    verifyOtp: (phone: string, code: string, country?: string) =>
      api.post<SessionResponse>('/auth/otp/verify', { phone, code, country }, { auth: false }),
    logout: (refreshToken: string) =>
      api.post<void>('/auth/logout', { refreshToken }, { auth: false }),
    me: () => api.get<Me>('/me'),
    checkUsername: (username: string) =>
      api.get<UsernameCheck>(`/profile/username/check?username=${encodeURIComponent(username)}`),
    createProfile: (username: string, displayName?: string) =>
      api.post<Me>('/profile', { username, displayName: displayName || undefined }),
    completeStep: (step: ClientStep) =>
      api.post<{ nextStep: NextStep }>(`/onboarding/steps/${step}`),
    claimWelcomeBonus: () =>
      api.post<{ granted: boolean; balanceKobo: number; nextStep: NextStep }>(
        '/onboarding/welcome-bonus',
      ),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
