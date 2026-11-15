export type AuthErrorCode =
  | 'validation_failed'
  | 'invalid_phone'
  | 'otp_resend_too_soon'
  | 'otp_rate_limited'
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_locked'
  | 'sms_failed'
  | 'invalid_refresh'
  | 'refresh_reused'
  | 'account_disabled'
  | 'unauthorized'
  | 'profile_required'
  | 'profile_exists'
  | 'username_taken'
  | 'username_reserved'
  | 'age_already_set'
  // social: contacts and friend requests
  | 'contacts_rate_limited'
  | 'friend_requests_rate_limited'
  | 'user_not_found'
  | 'blocked'
  | 'requests_closed'
  | 'cannot_add_self'
  | 'friend_request_not_found';

const STATUS: Record<AuthErrorCode, number> = {
  validation_failed: 422,
  invalid_phone: 422,
  otp_resend_too_soon: 429,
  otp_rate_limited: 429,
  otp_invalid: 400,
  otp_expired: 400,
  otp_locked: 429,
  sms_failed: 502,
  invalid_refresh: 401,
  refresh_reused: 401,
  account_disabled: 403,
  unauthorized: 401,
  profile_required: 409,
  profile_exists: 409,
  username_taken: 409,
  username_reserved: 422,
  age_already_set: 409,
  contacts_rate_limited: 429,
  friend_requests_rate_limited: 429,
  user_not_found: 404,
  blocked: 403,
  requests_closed: 403,
  cannot_add_self: 422,
  friend_request_not_found: 404,
};

/** An expected, user-facing failure. Mapped to `{ code, message, ...details }` by the HTTP filter. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: AuthErrorCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}
