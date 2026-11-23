import { formatNaira } from '@dyce/shared';
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
    case 'search_rate_limited':
      return 'You have searched a lot today. Try again tomorrow.';
    case 'account_muted':
      return 'Your messages are paused for now. You can still play games.';
    case 'account_suspended':
      return 'This account is suspended. Contact support if you think this is a mistake.';
    case 'integrity_check_failed':
      return "We couldn't check that this device is safe for Pool. Update the app from the store and try again, or play for free.";
    case 'reports_rate_limited':
      return "You've sent a lot of reports today. Try again tomorrow.";
    case 'conversation_not_found':
      return "That chat isn't available.";
    case 'not_group_admin':
      return 'Only group admins can do that.';
    case 'group_full':
      return 'This group is full (50 people).';
    case 'group_id_taken':
      return 'Something went wrong making the group. Try again.';
    case 'group_member_not_friend':
      return 'You can only add your friends to a group.';
    case 'groups_rate_limited':
      return "You've made a lot of groups today. Try again tomorrow.";
    case 'message_not_found':
      return 'That message is gone.';
    case 'cannot_delete_message':
      return 'You can only delete your own messages for everyone, and not cards.';
    case 'delete_window_closed':
      return 'It has been more than 15 minutes, so you can only delete it for yourself.';
    case 'invalid_vote':
      return "That option isn't in the poll.";
    case 'not_a_group':
      return 'That only works in a group.';
    case 'last_admin':
      return 'Make someone else an admin before you step down.';
    case 'game_not_found':
      return "That game isn't available.";
    case 'match_not_found':
      return "That game isn't there any more.";
    case 'match_requires_friends':
      return 'You can send games to friends. Add them as a friend first.';
    case 'pool_not_available':
      return "Pool isn't available yet. Play Free for now.";
    case 'pool_not_supported':
      return "This game can't be played for Dyce Cash yet. Play it free.";
    case 'invalid_stake': {
      const { minStakeKobo: min, maxStakeKobo: max } = err.details;
      return typeof min === 'number' && typeof max === 'number'
        ? `Pick a stake between ${formatNaira(min)} and ${formatNaira(max)}.`
        : "That stake isn't allowed.";
    }
    case 'adult_required':
      return 'Pools are for people who are 18 or older. You can still play free.';
    case 'pool_frozen':
      return 'Pool is paused on your account. You can still play free. Contact support to find out why.';
    case 'over_pool_stake_limit':
      return "That would go over today's pool limit. It resets at midnight.";
    case 'over_pool_games_limit':
      return "You've played the most pool games for today. They reset at midnight.";
    case 'counter_not_allowed':
      return "They didn't allow counter-offers on this one.";
    case 'opponent_cannot_stake':
      return "They can't cover that stake right now. Try again later, or decline.";
    case 'match_closed':
      return 'That game has already ended.';
    case 'match_not_open':
      return 'That game has already moved on.';
    case 'cannot_accept_own_invite':
      return 'You sent this one. Wait for them to accept.';
    case 'open_invites_limit':
      return 'You have a few games waiting for a reply in this chat. Wait for an answer first.';
    case 'not_your_turn':
      return "It isn't your turn yet.";
    case 'stale_version':
      return 'The game moved on. Showing the latest.';
    case 'invalid_action':
    case 'illegal_move':
      return "That move isn't allowed.";
    case 'space_not_found':
      return "That space isn't there. Check the code and try again.";
    case 'space_id_taken':
      return 'Something went wrong opening that space. Please try again.';
    case 'space_full':
      return 'That space is full.';
    case 'space_not_open':
      return 'That space has already started or closed.';
    case 'space_live':
      return "The game has started. Leave from the table, and you'll forfeit.";
    case 'space_friends_only':
      return "That space is for the host's friends. Ask them to add you.";
    case 'space_removed':
      return 'The host removed you from that space.';
    case 'not_space_host':
      return 'Only the host can do that.';
    case 'not_enough_players':
      return "There aren't enough players to start yet.";
    case 'invalid_seats':
      return "That game doesn't play with that many seats.";
    case 'invalid_payout':
      return 'Pick a payout that fits the number of seats.';
    case 'spaces_limit':
      return "You're in a lot of spaces already. Leave one first.";
    case 'invalid_options':
      return "That game doesn't have that option.";
    case 'resign_not_supported':
      return "You can't resign this game. Leave it from the table instead.";
    case 'dispute_not_allowed':
      return 'Only a finished Pool result that you played can be disputed.';
    case 'dispute_window_closed':
      return 'The 24 hour window for disputing this result has closed.';
    case 'dispute_exists':
      return 'You already disputed this result.';
    case 'disputes_rate_limited':
      return "You've opened a few disputes today. Wait for those to be reviewed.";
    case 'username_mismatch':
      return "That isn't your username. Type it exactly as it appears.";
    case 'quick_match_unavailable':
      return "That game can't be quick matched yet. Open a space for it instead.";
    case 'quick_match_active':
      return "You're already looking for a match. Stop that search first.";
    case 'quick_match_not_found':
      return "That search isn't there any more.";
    case 'quick_match_expired':
      return 'That match ran out of time.';
    case 'quick_match_rate_limited':
      return "You've searched a lot this hour. Take a short break and try again.";
    case 'quick_match_cooldown':
      return 'You skipped a few matches. Wait a few minutes before searching again.';
    case 'room_unavailable':
      return "The table isn't ready. Try again in a moment.";
    case 'already_on_dyce':
      return 'They are already on Dyce. Add them as a friend instead.';
    case 'invite_rate_limited':
      return "You've sent a lot of invites today. They reset at midnight.";
    case 'invite_number_limited':
      return 'That number has had enough invites for today. Try again tomorrow.';
    case 'invite_too_soon':
      return retry
        ? `You just invited them. You can send another in ${formatWait(retry)}.`
        : 'You just invited them. Give it a minute.';
    case 'invite_not_found':
      return "This invite link isn't valid. Ask for a new one.";
    case 'invite_expired':
      return 'This invite has expired. Ask them to send a new one.';
    case 'invite_used':
      return 'This invite has already been used.';
    case 'guest_already_played':
      return 'This invite was already played on another device or tab.';
    case 'guest_unauthorized':
      return 'This round timed out. Start again from the invite link.';
    case 'guest_game_unavailable':
      return "This game can't be played in a browser yet. Get Dyce to play it.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 90 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`;
}
