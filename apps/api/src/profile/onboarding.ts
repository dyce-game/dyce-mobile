import type pg from 'pg';
import { nextOnboardingStep, type NextStep, type OnboardingState } from '@dyce/shared';

type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

/**
 * Onboarding progress is derived from real data so a killed/restarted app resumes at the right
 * step: the profile exists, the welcome grant really happened (ledger), and the client-reported
 * steps (contacts, avatar, notifications) are stored in profiles.onboarding.
 */
export async function loadOnboardingState(db: Queryable, userId: string): Promise<OnboardingState> {
  const r = await db.query(
    `SELECT (p.id IS NOT NULL) AS has_profile,
            coalesce((p.onboarding ->> 'contacts')::boolean, false) AS contacts,
            (coalesce((p.onboarding ->> 'avatar')::boolean, false)
              OR coalesce(p.avatar <> '{}'::jsonb, false)) AS avatar,
            coalesce((p.onboarding ->> 'notifications')::boolean, false) AS notifications,
            EXISTS (SELECT 1 FROM ledger_txns t WHERE t.idempotency_key = 'grant:' || u.id) AS bonus
       FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  const row = r.rows[0] as
    | {
        has_profile: boolean;
        contacts: boolean;
        avatar: boolean;
        notifications: boolean;
        bonus: boolean;
      }
    | undefined;
  return {
    hasProfile: row?.has_profile ?? false,
    contacts: row?.contacts ?? false,
    avatar: row?.avatar ?? false,
    bonusGranted: row?.bonus ?? false,
    notifications: row?.notifications ?? false,
  };
}

export async function loadNextStep(db: Queryable, userId: string): Promise<NextStep> {
  return nextOnboardingStep(await loadOnboardingState(db, userId));
}
