import type {
  AuthMethods,
  AvatarConfig,
  ClientStep,
  NextStep,
  ProfileUpdate,
  RequestPolicy,
  SessionResponse,
} from '@dyce/shared';
import type { ApiClient } from './api-client';

/** How a person can sign back in: with a phone, an email (masked, never the address), or both. */
export type SignInMethods = { phone: boolean; emailHint: string | null };

export type Me = {
  userId: string;
  profile: {
    username: string;
    displayName: string;
    isAdult: boolean;
    level: number;
    xp: number;
    avatar: AvatarConfig | null;
    requestPolicy: RequestPolicy;
  } | null;
  signIn?: SignInMethods;
  nextStep: NextStep;
};

export type UsernameCheck = { available: boolean; suggestions: string[] };

type OtpSent = { resendAfterSeconds: number; expiresInSeconds: number };

/** Typed wrappers over the auth/profile endpoints of dyce-backend (apps/api). */
export function createAuthApi(api: ApiClient) {
  return {
    requestOtp: (phone: string, country?: string) =>
      api.post<OtpSent>('/auth/otp/request', { phone, country }, { auth: false }),
    verifyOtp: (phone: string, code: string, country?: string) =>
      api.post<SessionResponse>('/auth/otp/verify', { phone, code, country }, { auth: false }),
    /** Which ways in the server offers (email can be switched off). */
    methods: () => api.get<AuthMethods>('/auth/methods', { auth: false }),
    requestEmailOtp: (email: string) =>
      api.post<OtpSent>('/auth/email/otp/request', { email }, { auth: false }),
    verifyEmailOtp: (email: string, code: string) =>
      api.post<SessionResponse>('/auth/email/otp/verify', { email, code }, { auth: false }),
    /** Add an email to the account you are signed in to (a code is emailed to it first). */
    requestEmailLink: (email: string) => api.post<OtpSent>('/me/email/request', { email }),
    verifyEmailLink: (email: string, code: string) =>
      api.post<SignInMethods>('/me/email/verify', { email, code }),
    /** Add a phone number to an account that signed up with email. */
    requestPhoneLink: (phone: string, country?: string) =>
      api.post<OtpSent>('/me/phone/request', { phone, country }),
    verifyPhoneLink: (phone: string, code: string, country?: string) =>
      api.post<SignInMethods>('/me/phone/verify', { phone, code, country }),
    logout: (refreshToken: string) =>
      api.post<void>('/auth/logout', { refreshToken }, { auth: false }),
    me: () => api.get<Me>('/me'),
    checkUsername: (username: string) =>
      api.get<UsernameCheck>(`/profile/username/check?username=${encodeURIComponent(username)}`),
    createProfile: (username: string, displayName?: string) =>
      api.post<Me>('/profile', { username, displayName: displayName || undefined }),
    updateProfile: (patch: ProfileUpdate) => api.patch<Me>('/profile', patch),
    setAvatar: (avatar: AvatarConfig) =>
      api.put<{ avatar: AvatarConfig; nextStep: NextStep }>('/profile/avatar', { avatar }),
    completeStep: (step: ClientStep) =>
      api.post<{ nextStep: NextStep }>(`/onboarding/steps/${step}`),
    claimWelcomeBonus: () =>
      api.post<{ granted: boolean; balanceKobo: number; nextStep: NextStep }>(
        '/onboarding/welcome-bonus',
      ),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
