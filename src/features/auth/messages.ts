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
    case 'request_pending':
      return "They haven't replied yet. You can send more once they do.";
    case 'message_requests_rate_limited':
      return "You've started a lot of new chats today. Try again tomorrow.";
    case 'insufficient_funds':
      return "You don't have enough Dyce Cash for that.";
    case 'over_send_limit':
      return "That's over the limit for one payment.";
    case 'over_daily_limit':
      return "That would go over today's sending limit. Try again tomorrow.";
    case 'invalid_amount':
      return 'Enter a whole-naira amount above zero.';
    case 'amount_required':
      return 'Enter how much to pay.';
    case 'amount_mismatch':
      return "That isn't the amount that was asked for.";
    case 'self_payment':
      return "You can't pay yourself.";
    case 'recipient_unavailable':
      return "That person can't receive money right now.";
    case 'recipient_not_reachable':
      return 'You can only send money to friends, contacts, or people you chat with.';
    case 'request_not_found':
      return "We couldn't find that request. Check the code and try again.";
    case 'request_already_paid':
      return 'That request has already been paid.';
    case 'request_cancelled':
      return 'That request was cancelled.';
    case 'request_expired':
      return 'That request has expired. Ask for a new code.';
    case 'request_not_for_you':
      return 'That request was made for someone else.';
    case 'too_many_open_requests':
      return 'You have too many open requests. Cancel one first.';
    case 'topup_already_claimed':
      return "You've already claimed today's top-up.";
    case 'balance_too_high':
      return "Top-ups are for when you're running low.";
    case 'transaction_not_found':
      return "We couldn't find that receipt.";
    case 'conversation_not_found':
      return "That chat isn't available.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 90 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`;
}
