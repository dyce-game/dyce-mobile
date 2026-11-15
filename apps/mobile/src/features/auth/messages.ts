import { ApiError } from './api-client';

/** Short, warm, plain copy for every error the auth endpoints can return. No slang in system copy. */
export function authErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  const retry =
    typeof err.details.retryAfterSeconds === 'number' ? err.details.retryAfterSeconds : null;
  switch (err.code) {
    case 'network':
      return "Can't reach Dyce. Check your connection and try again.";
    case 'invalid_phone':
      return "That doesn't look like a valid mobile number.";
    case 'otp_resend_too_soon':
      return retry
        ? `Please wait ${retry}s before asking for another code.`
        : 'Please wait a moment before asking for another code.';
    case 'otp_rate_limited':
      return retry
        ? `Too many codes requested. Try again in ${formatWait(retry)}.`
        : 'Too many codes requested. Try again later.';
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    case 'sms_failed':
      return "We couldn't send the code. Please try again.";
    case 'otp_invalid': {
      const left = err.details.attemptsRemaining;
      return typeof left === 'number'
        ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : "That code isn't right.";
    }
    case 'otp_expired':
      return 'That code expired. Get a new one.';
    case 'otp_locked':
      return 'Too many wrong tries. Get a new code.';
    case 'account_disabled':
      return 'This account is unavailable. Contact support.';
    case 'username_taken':
      return 'That name is taken.';
    case 'username_reserved':
      return 'That name is reserved. Try another.';
    case 'validation_failed':
      return 'Please check what you typed.';
    case 'contacts_rate_limited':
      return retry
        ? `You've checked a lot of contacts today. Try again in ${formatWait(retry)}.`
        : "You've checked a lot of contacts today. Try again tomorrow.";
    case 'friend_requests_rate_limited':
      return "You've sent a lot of requests today. Try again tomorrow.";
    case 'user_not_found':
      return "We couldn't find that person.";
    case 'blocked':
      return "You've blocked this person. Unblock them first.";
    case 'requests_closed':
      return "They aren't taking new requests right now.";
    case 'cannot_add_self':
      return "That's you!";
    case 'friend_request_not_found':
      return "That request isn't there any more.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 90 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`;
}
