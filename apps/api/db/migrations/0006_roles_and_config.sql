-- Application role + default config.
-- The API connects as a login role that is a member of `dyce_api`. That role can read and write
-- ordinary tables but has NO direct write access to money tables: it can only call the functions.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dyce_api') THEN
    CREATE ROLE dyce_api NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO dyce_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dyce_api;

-- Money tables: read-only for the API role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  ledger_accounts, ledger_txns, ledger_entries, wallets, pool_escrows, payment_requests, daily_usage
FROM dyce_api;

-- match_players carries stakes and payouts: the API may not set those columns directly.
REVOKE INSERT, UPDATE ON match_players FROM dyce_api;
GRANT INSERT (match_id, user_id, seat, accepted_at) ON match_players TO dyce_api;
GRANT UPDATE (accepted_at, result, placement) ON match_players TO dyce_api;

-- Functions: nobody by default, then an explicit allow-list of the public money API.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  grant_welcome(uuid),
  transfer(uuid, uuid, bigint, text, text),
  create_payment_request(uuid, bigint, text, uuid, int),
  cancel_payment_request(text, uuid),
  expire_payment_requests(),
  pay_payment_request(text, uuid, bigint, text),
  stake_pool(uuid, uuid, bigint, text),
  settle_match(uuid),
  refund_match(uuid, text),
  claim_daily_topup(uuid),
  ledger_check_invariants(boolean)
TO dyce_api;
-- reverse_txn is admin tooling: intentionally NOT granted to dyce_api.

-- Default config. Mirrors packages/shared/src/config.ts; the database value wins.
INSERT INTO app_config (key, value) VALUES
  ('welcome_grant_kobo',        '20000000'),
  ('send_limit_kobo',           '5000000'),
  ('send_daily_limit_kobo',     '20000000'),
  ('topup_threshold_kobo',      '1000000'),
  ('topup_amount_kobo',         '2000000'),
  ('max_open_requests',         '10'),
  ('qr_expiry_minutes',         '15'),
  ('chat_request_expiry_days',  '7'),
  ('stranger_requests_per_day', '20'),
  ('money_requests_per_day',    '30'),
  ('sms_invites_per_day',       '50'),
  ('stranger_scans_per_day',    '20'),
  ('pool_games_per_day',        '20'),
  ('pool_staked_per_day_kobo',  '10000000'),
  ('integrity_required',        'false'),
  ('match_invite_ttl_hours',    '24')
ON CONFLICT (key) DO NOTHING;
