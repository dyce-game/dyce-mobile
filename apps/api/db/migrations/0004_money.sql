-- Money: double-entry ledger, wallets, payment requests, pool escrow, disputes.
-- Units are integer kobo (bigint). Dyce Cash is virtual: nothing here models withdrawal or purchase.
-- docs/WALLET_AND_QR.md sections 2, 4, 5.

CREATE TYPE ledger_account_kind AS ENUM (
  'user_wallet', 'pool_escrow', 'system_grant', 'system_topup', 'system_adjust'
);
CREATE TYPE ledger_txn_kind AS ENUM (
  'grant', 'topup', 'transfer', 'request_payment', 'stake', 'payout', 'refund', 'reversal', 'adjust'
);

CREATE TABLE ledger_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        ledger_account_kind NOT NULL,
  -- NOTE: no ON DELETE CASCADE. The ledger must outlive a user; account deletion anonymises the user row.
  owner_user  uuid REFERENCES users(id),
  match_id    uuid REFERENCES matches(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'user_wallet') = (owner_user IS NOT NULL)),
  CHECK ((kind = 'pool_escrow') = (match_id IS NOT NULL))
);
CREATE UNIQUE INDEX ledger_accounts_wallet_key ON ledger_accounts (owner_user) WHERE kind = 'user_wallet';
CREATE UNIQUE INDEX ledger_accounts_escrow_key ON ledger_accounts (match_id) WHERE kind = 'pool_escrow';
CREATE UNIQUE INDEX ledger_accounts_system_key ON ledger_accounts (kind)
  WHERE kind IN ('system_grant', 'system_topup', 'system_adjust');

-- The three system accounts are the only accounts allowed to run "negative" (they are the sources of money).
INSERT INTO ledger_accounts (kind) VALUES ('system_grant'), ('system_topup'), ('system_adjust');

CREATE TABLE ledger_txns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             ledger_txn_kind NOT NULL,
  idempotency_key  text NOT NULL UNIQUE,
  actor_user       uuid REFERENCES users(id),
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- A user gets exactly one welcome grant, enforced independently of the idempotency key.
CREATE UNIQUE INDEX ledger_one_grant_per_user ON ledger_txns ((meta ->> 'to_user')) WHERE kind = 'grant';
-- A transaction can be reversed at most once.
CREATE UNIQUE INDEX ledger_one_reversal_per_txn ON ledger_txns ((meta ->> 'reverses')) WHERE kind = 'reversal';

CREATE TABLE ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id        uuid NOT NULL REFERENCES ledger_txns(id),
  account_id    uuid NOT NULL REFERENCES ledger_accounts(id),
  amount_kobo   bigint NOT NULL CHECK (amount_kobo <> 0), -- signed
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_txn_idx ON ledger_entries (txn_id);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id);

-- Cached balance, updated in the same transaction as the entries. Can never go negative.
CREATE TABLE wallets (
  user_id        uuid PRIMARY KEY REFERENCES users(id),
  account_id     uuid NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  balance_kobo   bigint NOT NULL DEFAULT 0 CONSTRAINT wallets_balance_non_negative CHECK (balance_kobo >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Every user gets a wallet (with a ledger account) the moment they exist.
CREATE FUNCTION create_wallet_for_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_account uuid;
BEGIN
  INSERT INTO ledger_accounts (kind, owner_user) VALUES ('user_wallet', NEW.id) RETURNING id INTO v_account;
  INSERT INTO wallets (user_id, account_id) VALUES (NEW.id, v_account);
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_create_wallet AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_wallet_for_user();

-- Append-only: ledger rows are never updated or deleted. Corrections are new (reversal) transactions.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dyce:ledger_is_append_only';
END;
$$;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_txns_append_only BEFORE UPDATE OR DELETE ON ledger_txns
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_txns_no_truncate BEFORE TRUNCATE ON ledger_txns
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_append_only();

-- Double-entry invariant, checked at COMMIT: the entries of every transaction sum to zero
-- and every transaction has at least one entry.
CREATE FUNCTION ledger_txn_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  -- to_jsonb(NEW) lets one function serve both tables without referencing a column that may not exist.
  v_txn uuid := CASE TG_TABLE_NAME
    WHEN 'ledger_entries' THEN (to_jsonb(NEW) ->> 'txn_id')::uuid
    ELSE (to_jsonb(NEW) ->> 'id')::uuid
  END;
  v_sum bigint;
  v_count int;
BEGIN
  SELECT coalesce(sum(amount_kobo), 0), count(*) INTO v_sum, v_count FROM ledger_entries WHERE txn_id = v_txn;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'dyce:txn_without_entries';
  END IF;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'dyce:unbalanced_txn';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_txn_balanced();
CREATE CONSTRAINT TRIGGER ledger_txns_have_entries AFTER INSERT ON ledger_txns
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_txn_balanced();

CREATE TABLE daily_usage (
  user_id            uuid NOT NULL REFERENCES users(id),
  day                date NOT NULL, -- Africa/Lagos calendar day
  pool_games         int NOT NULL DEFAULT 0,
  pool_staked_kobo   bigint NOT NULL DEFAULT 0,
  sent_kobo          bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TYPE payment_request_status AS ENUM ('open', 'paid', 'expired', 'cancelled');

CREATE TABLE payment_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-7]{10}$'),
  requester     uuid NOT NULL REFERENCES users(id),
  amount_kobo   bigint CHECK (amount_kobo IS NULL OR amount_kobo > 0), -- NULL = "any amount"
  note          text NOT NULL DEFAULT '',
  target_user   uuid REFERENCES users(id),
  status        payment_request_status NOT NULL DEFAULT 'open',
  expires_at    timestamptz NOT NULL,
  paid_by       uuid REFERENCES users(id),
  txn_id        uuid REFERENCES ledger_txns(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'paid' OR (paid_by IS NOT NULL AND txn_id IS NOT NULL))
);
CREATE INDEX payment_requests_requester_idx ON payment_requests (requester, status);

CREATE TYPE escrow_status AS ENUM ('open', 'settled', 'refunded');

CREATE TABLE pool_escrows (
  match_id    uuid PRIMARY KEY REFERENCES matches(id),
  account_id  uuid NOT NULL UNIQUE REFERENCES ledger_accounts(id),
  status      escrow_status NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE dispute_status AS ENUM ('open', 'reviewing', 'upheld', 'reversed');

CREATE TABLE disputes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid NOT NULL REFERENCES matches(id),
  user_id           uuid NOT NULL REFERENCES users(id),
  reason            text NOT NULL,
  note              text,
  status            dispute_status NOT NULL DEFAULT 'open',
  resolution_txn    uuid REFERENCES ledger_txns(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  UNIQUE (match_id, user_id)
);
