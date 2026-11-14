-- Money functions. All SECURITY DEFINER with a pinned search_path. Errors are raised as
-- 'dyce:<code>' so the API can map them to typed errors. docs/WALLET_AND_QR.md section 2.
--
-- Lock order (prevents deadlocks): match row, then wallets ordered by user_id, then pool escrow.
-- Every function that moves money takes its wallet locks before anything else.

CREATE TYPE ledger_result AS (txn_id uuid, replayed boolean);

-- ---------------------------------------------------------------------------------------------
-- helpers (internal: not granted to the API role)
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION cfg_bigint(p_key text, p_default bigint) RETURNS bigint
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT (value #>> '{}')::bigint FROM app_config WHERE key = p_key), p_default)
$$;

CREATE FUNCTION lagos_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Africa/Lagos')::date $$;

CREATE FUNCTION _replay(p_idem text) RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT id FROM ledger_txns WHERE idempotency_key = p_idem
$$;

CREATE FUNCTION _wallet_account(p_user uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT account_id INTO v FROM wallets WHERE user_id = p_user;
  IF v IS NULL THEN RAISE EXCEPTION 'dyce:no_wallet'; END IF;
  RETURN v;
END;
$$;

CREATE FUNCTION _system_account(p_kind ledger_account_kind) RETURNS uuid
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT id FROM ledger_accounts WHERE kind = p_kind AND owner_user IS NULL AND match_id IS NULL
$$;

CREATE FUNCTION _is_blocked(p_a uuid, p_b uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a)
  )
$$;

CREATE FUNCTION _bump_daily(p_user uuid, p_sent bigint, p_pool_games int, p_pool_staked bigint)
RETURNS void LANGUAGE sql SET search_path = public, pg_temp AS $$
  INSERT INTO daily_usage (user_id, day, sent_kobo, pool_games, pool_staked_kobo)
  VALUES (p_user, lagos_today(), p_sent, p_pool_games, p_pool_staked)
  ON CONFLICT (user_id, day) DO UPDATE SET
    sent_kobo        = daily_usage.sent_kobo + EXCLUDED.sent_kobo,
    pool_games       = daily_usage.pool_games + EXCLUDED.pool_games,
    pool_staked_kobo = daily_usage.pool_staked_kobo + EXCLUDED.pool_staked_kobo
$$;

-- The one posting primitive. p_legs = [{"account": "<uuid>", "amount": <signed kobo>}, ...]
-- Idempotent on p_idem: a repeat returns the original transaction with replayed = true.
CREATE FUNCTION _ledger_post(
  p_kind ledger_txn_kind, p_idem text, p_actor uuid, p_meta jsonb, p_legs jsonb
) RETURNS ledger_result
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_txn uuid;
  v_sum bigint;
BEGIN
  v_txn := _replay(p_idem);
  IF v_txn IS NOT NULL THEN RETURN (v_txn, true); END IF;

  SELECT coalesce(sum((l ->> 'amount')::bigint), 0) INTO v_sum FROM jsonb_array_elements(p_legs) l;
  IF v_sum <> 0 THEN RAISE EXCEPTION 'dyce:unbalanced_txn'; END IF;

  -- 1) wallets, in user_id order
  PERFORM 1 FROM wallets w
    WHERE w.account_id IN (SELECT (l ->> 'account')::uuid FROM jsonb_array_elements(p_legs) l)
    ORDER BY w.user_id FOR UPDATE;
  -- 2) escrow accounts, in id order
  PERFORM 1 FROM ledger_accounts a
    WHERE a.kind = 'pool_escrow'
      AND a.id IN (SELECT (l ->> 'account')::uuid FROM jsonb_array_elements(p_legs) l)
    ORDER BY a.id FOR UPDATE;

  INSERT INTO ledger_txns (kind, idempotency_key, actor_user, meta)
  VALUES (p_kind, p_idem, p_actor, coalesce(p_meta, '{}'::jsonb))
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_txn;
  IF v_txn IS NULL THEN
    -- lost a race with an identical request
    RETURN (_replay(p_idem), true);
  END IF;

  INSERT INTO ledger_entries (txn_id, account_id, amount_kobo)
  SELECT v_txn, (l ->> 'account')::uuid, (l ->> 'amount')::bigint
  FROM jsonb_array_elements(p_legs) l
  WHERE (l ->> 'amount')::bigint <> 0;

  BEGIN
    UPDATE wallets w
       SET balance_kobo = w.balance_kobo + d.delta, updated_at = now()
      FROM (
        SELECT (l ->> 'account')::uuid AS account, sum((l ->> 'amount')::bigint) AS delta
        FROM jsonb_array_elements(p_legs) l GROUP BY 1
      ) d
     WHERE w.account_id = d.account;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'dyce:insufficient_funds';
  END;

  IF EXISTS (
    SELECT 1 FROM ledger_accounts a
    WHERE a.kind = 'pool_escrow'
      AND a.id IN (SELECT (l ->> 'account')::uuid FROM jsonb_array_elements(p_legs) l)
      AND (SELECT coalesce(sum(e.amount_kobo), 0) FROM ledger_entries e WHERE e.account_id = a.id) < 0
  ) THEN
    RAISE EXCEPTION 'dyce:escrow_underflow';
  END IF;

  RETURN (v_txn, false);
END;
$$;

-- Friend-to-friend / request payment core: limits, block check, post, usage.
CREATE FUNCTION _move_between_users(
  p_from uuid, p_to uuid, p_amount bigint, p_kind ledger_txn_kind, p_idem text, p_meta jsonb
) RETURNS ledger_result
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_replay uuid;
  v_used bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'dyce:invalid_amount'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'dyce:self_payment'; END IF;

  v_replay := _replay(p_idem);
  IF v_replay IS NOT NULL THEN RETURN (v_replay, true); END IF;

  -- Lock both wallets up front (user_id order) so limit checks can't race with a concurrent spend.
  PERFORM 1 FROM wallets WHERE user_id IN (p_from, p_to) ORDER BY user_id FOR UPDATE;
  IF (SELECT count(*) FROM wallets WHERE user_id IN (p_from, p_to)) <> 2 THEN
    RAISE EXCEPTION 'dyce:no_wallet';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = p_to AND disabled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'dyce:recipient_unavailable';
  END IF;
  IF _is_blocked(p_from, p_to) THEN RAISE EXCEPTION 'dyce:blocked'; END IF;

  IF p_amount > cfg_bigint('send_limit_kobo', 5000000) THEN RAISE EXCEPTION 'dyce:over_send_limit'; END IF;
  SELECT coalesce(sent_kobo, 0) INTO v_used FROM daily_usage WHERE user_id = p_from AND day = lagos_today();
  IF coalesce(v_used, 0) + p_amount > cfg_bigint('send_daily_limit_kobo', 20000000) THEN
    RAISE EXCEPTION 'dyce:over_daily_limit';
  END IF;

  RETURN _finish_move(p_from, p_to, p_amount, p_kind, p_idem, p_meta);
END;
$$;

CREATE FUNCTION _finish_move(
  p_from uuid, p_to uuid, p_amount bigint, p_kind ledger_txn_kind, p_idem text, p_meta jsonb
) RETURNS ledger_result
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  r ledger_result;
BEGIN
  r := _ledger_post(
    p_kind, p_idem, p_from,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('from_user', p_from, 'to_user', p_to, 'amount_kobo', p_amount),
    jsonb_build_array(
      jsonb_build_object('account', _wallet_account(p_from), 'amount', -p_amount),
      jsonb_build_object('account', _wallet_account(p_to), 'amount', p_amount)
    )
  );
  IF NOT r.replayed THEN PERFORM _bump_daily(p_from, p_amount, 0, 0); END IF;
  RETURN r;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- public API (granted to the API role)
-- ---------------------------------------------------------------------------------------------

-- Welcome grant: once per user, from the system_grant account.
CREATE FUNCTION grant_welcome(p_user uuid) RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_amount bigint := cfg_bigint('welcome_grant_kobo', 20000000);
BEGIN
  RETURN _ledger_post(
    'grant', 'grant:' || p_user, p_user,
    jsonb_build_object('to_user', p_user, 'amount_kobo', v_amount),
    jsonb_build_array(
      jsonb_build_object('account', _system_account('system_grant'), 'amount', -v_amount),
      jsonb_build_object('account', _wallet_account(p_user), 'amount', v_amount)
    )
  );
END;
$$;

CREATE FUNCTION transfer(p_from uuid, p_to uuid, p_amount bigint, p_note text, p_idem text)
RETURNS ledger_result
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT _move_between_users(p_from, p_to, p_amount, 'transfer', p_idem,
                             jsonb_build_object('note', coalesce(p_note, '')))
$$;

CREATE FUNCTION create_payment_request(
  p_requester uuid, p_amount bigint, p_note text, p_target uuid, p_ttl_minutes int
) RETURNS payment_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; -- 32 symbols: 256 % 32 = 0, so no modulo bias
  v_code text;
  v_bytes bytea;
  v_row payment_requests;
  v_open int;
  i int;
  tries int := 0;
BEGIN
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN RAISE EXCEPTION 'dyce:invalid_amount'; END IF;
  IF p_amount IS NOT NULL AND p_amount > cfg_bigint('send_limit_kobo', 5000000) THEN
    RAISE EXCEPTION 'dyce:over_send_limit';
  END IF;
  IF p_ttl_minutes IS NULL OR p_ttl_minutes < 1 THEN RAISE EXCEPTION 'dyce:invalid_ttl'; END IF;
  IF p_target IS NOT NULL AND p_target = p_requester THEN RAISE EXCEPTION 'dyce:self_payment'; END IF;
  IF p_target IS NOT NULL AND _is_blocked(p_requester, p_target) THEN RAISE EXCEPTION 'dyce:blocked'; END IF;

  -- serialise per requester so the open-request cap can't be raced past
  PERFORM 1 FROM users WHERE id = p_requester FOR UPDATE;
  SELECT count(*) INTO v_open FROM payment_requests
   WHERE requester = p_requester AND status = 'open' AND expires_at > now();
  IF v_open >= cfg_bigint('max_open_requests', 10) THEN RAISE EXCEPTION 'dyce:too_many_open_requests'; END IF;

  LOOP
    -- 16 random bytes from a v4 uuid (gen_random_uuid is built in; no pgcrypto needed)
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    FOR i IN 0..9 LOOP
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i + 4) % 32) + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO payment_requests (code, requester, amount_kobo, note, target_user, expires_at)
      VALUES (v_code, p_requester, p_amount, coalesce(p_note, ''), p_target, now() + make_interval(mins => p_ttl_minutes))
      RETURNING * INTO v_row;
      RETURN v_row;
    EXCEPTION WHEN unique_violation THEN
      tries := tries + 1;
      IF tries > 5 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

CREATE FUNCTION cancel_payment_request(p_code text, p_requester uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r payment_requests;
BEGIN
  SELECT * INTO r FROM payment_requests WHERE code = p_code AND requester = p_requester FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:request_not_found'; END IF;
  IF r.status = 'paid' THEN RAISE EXCEPTION 'dyce:request_already_paid'; END IF;
  UPDATE payment_requests SET status = 'cancelled' WHERE id = r.id AND status = 'open';
END;
$$;

-- Marks overdue open requests as expired (called by a scheduled NestJS job). Returns how many.
CREATE FUNCTION expire_payment_requests() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH u AS (
    UPDATE payment_requests SET status = 'expired'
     WHERE status = 'open' AND expires_at <= now() RETURNING 1
  ) SELECT count(*)::int FROM u
$$;

-- Pay a request. For "any amount" requests the payer supplies p_amount; for fixed requests p_amount
-- must be NULL or equal.
CREATE FUNCTION pay_payment_request(p_code text, p_payer uuid, p_amount bigint, p_idem text)
RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_replay uuid;
  r payment_requests;
  v_amount bigint;
  res ledger_result;
BEGIN
  v_replay := _replay(p_idem);
  IF v_replay IS NOT NULL THEN RETURN (v_replay, true); END IF;

  SELECT * INTO r FROM payment_requests WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:request_not_found'; END IF;
  IF r.status = 'paid' THEN RAISE EXCEPTION 'dyce:request_already_paid'; END IF;
  IF r.status = 'cancelled' THEN RAISE EXCEPTION 'dyce:request_cancelled'; END IF;
  IF r.status = 'expired' OR r.expires_at <= now() THEN RAISE EXCEPTION 'dyce:request_expired'; END IF;
  IF r.requester = p_payer THEN RAISE EXCEPTION 'dyce:self_payment'; END IF;
  IF r.target_user IS NOT NULL AND r.target_user <> p_payer THEN RAISE EXCEPTION 'dyce:request_not_for_you'; END IF;

  IF r.amount_kobo IS NOT NULL THEN
    IF p_amount IS NOT NULL AND p_amount <> r.amount_kobo THEN RAISE EXCEPTION 'dyce:amount_mismatch'; END IF;
    v_amount := r.amount_kobo;
  ELSE
    IF p_amount IS NULL THEN RAISE EXCEPTION 'dyce:amount_required'; END IF;
    v_amount := p_amount;
  END IF;

  res := _move_between_users(
    p_payer, r.requester, v_amount, 'request_payment', p_idem,
    jsonb_build_object('request_id', r.id, 'code', r.code, 'note', r.note)
  );
  UPDATE payment_requests
     SET status = 'paid', paid_by = p_payer, txn_id = res.txn_id, amount_kobo = coalesce(amount_kobo, v_amount)
   WHERE id = r.id;
  RETURN res;
END;
$$;

-- Move a player's stake into the match escrow.
CREATE FUNCTION stake_pool(p_match uuid, p_user uuid, p_amount bigint, p_idem text)
RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_replay uuid;
  m matches;
  v_player match_players;
  v_escrow uuid;
  v_games_today int;
  v_staked_today bigint;
  v_first_stake boolean;
  res ledger_result;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'dyce:invalid_amount'; END IF;
  v_replay := _replay(p_idem);
  IF v_replay IS NOT NULL THEN RETURN (v_replay, true); END IF;

  -- Lock order matches settle_match / refund_match: match row, then wallets, then escrow.
  SELECT * INTO m FROM matches WHERE id = p_match FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:match_not_found'; END IF;
  IF m.mode <> 'pool' THEN RAISE EXCEPTION 'dyce:not_a_pool_match'; END IF;
  IF m.status NOT IN ('invited', 'countered', 'active') THEN RAISE EXCEPTION 'dyce:match_closed'; END IF;

  PERFORM 1 FROM wallets WHERE user_id = p_user ORDER BY user_id FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND is_adult) THEN
    RAISE EXCEPTION 'dyce:adult_required';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND pool_frozen) THEN
    RAISE EXCEPTION 'dyce:pool_frozen';
  END IF;

  SELECT * INTO v_player FROM match_players WHERE match_id = p_match AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:not_a_player'; END IF;
  v_first_stake := v_player.staked_kobo = 0;

  SELECT coalesce(pool_games, 0), coalesce(pool_staked_kobo, 0) INTO v_games_today, v_staked_today
    FROM daily_usage WHERE user_id = p_user AND day = lagos_today();
  v_games_today := coalesce(v_games_today, 0);
  v_staked_today := coalesce(v_staked_today, 0);
  IF v_first_stake AND v_games_today + 1 > cfg_bigint('pool_games_per_day', 20) THEN
    RAISE EXCEPTION 'dyce:over_pool_games_limit';
  END IF;
  IF v_staked_today + p_amount > cfg_bigint('pool_staked_per_day_kobo', 10000000) THEN
    RAISE EXCEPTION 'dyce:over_pool_stake_limit';
  END IF;

  SELECT account_id INTO v_escrow FROM pool_escrows WHERE match_id = p_match;
  IF v_escrow IS NULL THEN
    INSERT INTO ledger_accounts (kind, match_id) VALUES ('pool_escrow', p_match)
    ON CONFLICT (match_id) WHERE kind = 'pool_escrow' DO NOTHING;
    SELECT id INTO v_escrow FROM ledger_accounts WHERE kind = 'pool_escrow' AND match_id = p_match;
    INSERT INTO pool_escrows (match_id, account_id) VALUES (p_match, v_escrow) ON CONFLICT DO NOTHING;
  END IF;
  IF (SELECT status FROM pool_escrows WHERE match_id = p_match) <> 'open' THEN
    RAISE EXCEPTION 'dyce:match_closed';
  END IF;

  res := _ledger_post(
    'stake', p_idem, p_user,
    jsonb_build_object('match_id', p_match, 'user', p_user, 'amount_kobo', p_amount),
    jsonb_build_array(
      jsonb_build_object('account', _wallet_account(p_user), 'amount', -p_amount),
      jsonb_build_object('account', v_escrow, 'amount', p_amount)
    )
  );
  IF NOT res.replayed THEN
    UPDATE match_players SET staked_kobo = staked_kobo + p_amount WHERE match_id = p_match AND user_id = p_user;
    PERFORM _bump_daily(p_user, 0, CASE WHEN v_first_stake THEN 1 ELSE 0 END, p_amount);
  END IF;
  RETURN res;
END;
$$;

-- Pay out the escrow by placement. Callers set match_players.placement first (from the engine result).
-- Draw (everyone who staked shares one placement) refunds each stake. Remainders go to first place;
-- tied players split their combined slots equally, the remainder going to the lowest seat.
CREATE FUNCTION settle_match(p_match uuid) RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m matches;
  esc pool_escrows;
  v_pot bigint;
  v_staked bigint;
  v_w int[];
  v_k int;
  v_total_w int;
  v_n int;
  v_slots bigint[] := '{}';
  v_slot_sum bigint := 0;
  v_pos int := 1;
  g record;
  v_size int;
  v_group_total bigint;
  v_share bigint;
  v_rem bigint;
  idx int;
  v_user uuid;
  v_pay bigint;
  v_legs jsonb;
  v_payouts jsonb := '{}'::jsonb;
  v_distinct int;
  v_replay uuid;
  res ledger_result;
  i int;
BEGIN
  SELECT * INTO m FROM matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:match_not_found'; END IF;

  IF m.mode = 'free' THEN
    UPDATE matches SET status = 'finished', finished_at = coalesce(finished_at, now()) WHERE id = p_match;
    RETURN (NULL::uuid, false);
  END IF;

  PERFORM 1 FROM wallets w
    WHERE w.user_id IN (SELECT user_id FROM match_players WHERE match_id = p_match)
    ORDER BY w.user_id FOR UPDATE;

  SELECT * INTO esc FROM pool_escrows WHERE match_id = p_match FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE matches SET status = 'finished', finished_at = coalesce(finished_at, now()) WHERE id = p_match;
    RETURN (NULL::uuid, false);
  END IF;
  IF esc.status <> 'open' THEN
    v_replay := _replay('settle:' || p_match);
    IF v_replay IS NOT NULL THEN RETURN (v_replay, true); END IF;
    RAISE EXCEPTION 'dyce:already_settled';
  END IF;

  SELECT coalesce(sum(amount_kobo), 0) INTO v_pot FROM ledger_entries WHERE account_id = esc.account_id;
  SELECT coalesce(sum(staked_kobo), 0), count(*), count(DISTINCT placement)
    INTO v_staked, v_n, v_distinct FROM match_players WHERE match_id = p_match AND staked_kobo > 0;
  IF v_pot <> v_staked THEN RAISE EXCEPTION 'dyce:escrow_mismatch'; END IF;
  IF v_n = 0 OR v_pot = 0 THEN RAISE EXCEPTION 'dyce:nothing_to_settle'; END IF;
  IF EXISTS (SELECT 1 FROM match_players WHERE match_id = p_match AND staked_kobo > 0 AND placement IS NULL) THEN
    RAISE EXCEPTION 'dyce:placements_missing';
  END IF;

  v_legs := jsonb_build_array(jsonb_build_object('account', esc.account_id, 'amount', -v_pot));

  IF v_distinct = 1 THEN
    -- draw: refund every stake
    FOR g IN SELECT user_id, staked_kobo FROM match_players WHERE match_id = p_match AND staked_kobo > 0 ORDER BY seat LOOP
      v_legs := v_legs || jsonb_build_object('account', _wallet_account(g.user_id), 'amount', g.staked_kobo);
      v_payouts := v_payouts || jsonb_build_object(g.user_id::text, g.staked_kobo);
    END LOOP;
    res := _ledger_post('refund', 'settle:' || p_match, NULL,
                        jsonb_build_object('match_id', p_match, 'draw', true), v_legs);
    UPDATE match_players mp SET payout_kobo = (v_payouts ->> mp.user_id::text)::bigint, result = 'draw'
     WHERE match_id = p_match AND staked_kobo > 0;
  ELSE
    v_w := CASE m.payout_scheme
             WHEN 'winner_all' THEN ARRAY[100]
             WHEN 'p50_30_20' THEN ARRAY[50, 30, 20]
             ELSE ARRAY[60, 40]
           END;
    v_k := least(array_length(v_w, 1), v_n);
    SELECT sum(x) INTO v_total_w FROM unnest(v_w[1:v_k]) x;
    FOR i IN 1..v_k LOOP
      v_slots[i] := (v_pot * v_w[i]) / v_total_w; -- floors (all positive)
      v_slot_sum := v_slot_sum + v_slots[i];
    END LOOP;
    v_slots[1] := v_slots[1] + (v_pot - v_slot_sum); -- rounding remainder goes to first place

    FOR g IN
      SELECT placement, array_agg(user_id ORDER BY seat) AS users
        FROM match_players WHERE match_id = p_match AND staked_kobo > 0
       GROUP BY placement ORDER BY placement
    LOOP
      v_size := array_length(g.users, 1);
      v_group_total := 0;
      FOR i IN v_pos..least(v_pos + v_size - 1, v_k) LOOP
        v_group_total := v_group_total + v_slots[i];
      END LOOP;
      v_share := v_group_total / v_size;
      v_rem := v_group_total - v_share * v_size;
      FOR idx IN 1..v_size LOOP
        v_user := g.users[idx];
        v_pay := v_share + CASE WHEN idx = 1 THEN v_rem ELSE 0 END;
        v_payouts := v_payouts || jsonb_build_object(v_user::text, v_pay);
        IF v_pay > 0 THEN
          v_legs := v_legs || jsonb_build_object('account', _wallet_account(v_user), 'amount', v_pay);
        END IF;
      END LOOP;
      v_pos := v_pos + v_size;
    END LOOP;

    res := _ledger_post('payout', 'settle:' || p_match, NULL,
                        jsonb_build_object('match_id', p_match, 'scheme', m.payout_scheme), v_legs);
    UPDATE match_players mp
       SET payout_kobo = (v_payouts ->> mp.user_id::text)::bigint,
           result = CASE WHEN mp.placement = 1 THEN 'win'::match_result ELSE 'loss'::match_result END
     WHERE match_id = p_match AND staked_kobo > 0;
  END IF;

  UPDATE pool_escrows SET status = 'settled' WHERE match_id = p_match;
  UPDATE matches SET status = 'finished', finished_at = coalesce(finished_at, now()) WHERE id = p_match;
  RETURN res;
END;
$$;

-- Return every stake (expired invite, cancelled space, host-closed space).
CREATE FUNCTION refund_match(p_match uuid, p_reason text) RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m matches;
  esc pool_escrows;
  v_legs jsonb;
  v_pot bigint;
  g record;
  v_replay uuid;
  res ledger_result;
  v_status match_status;
BEGIN
  IF p_reason NOT IN ('expired', 'cancelled') THEN RAISE EXCEPTION 'dyce:invalid_reason'; END IF;
  v_status := p_reason::match_status;

  SELECT * INTO m FROM matches WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:match_not_found'; END IF;

  PERFORM 1 FROM wallets w
    WHERE w.user_id IN (SELECT user_id FROM match_players WHERE match_id = p_match)
    ORDER BY w.user_id FOR UPDATE;

  SELECT * INTO esc FROM pool_escrows WHERE match_id = p_match FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE matches SET status = v_status, finished_at = coalesce(finished_at, now()) WHERE id = p_match;
    RETURN (NULL::uuid, false);
  END IF;
  IF esc.status = 'settled' THEN RAISE EXCEPTION 'dyce:already_settled'; END IF;
  IF esc.status = 'refunded' THEN
    v_replay := _replay('refund:' || p_match);
    RETURN (v_replay, true);
  END IF;

  SELECT coalesce(sum(amount_kobo), 0) INTO v_pot FROM ledger_entries WHERE account_id = esc.account_id;
  IF v_pot = 0 THEN
    UPDATE pool_escrows SET status = 'refunded' WHERE match_id = p_match;
    UPDATE matches SET status = v_status, finished_at = coalesce(finished_at, now()) WHERE id = p_match;
    RETURN (NULL::uuid, false);
  END IF;

  v_legs := jsonb_build_array(jsonb_build_object('account', esc.account_id, 'amount', -v_pot));
  FOR g IN SELECT user_id, staked_kobo FROM match_players WHERE match_id = p_match AND staked_kobo > 0 ORDER BY seat LOOP
    v_legs := v_legs || jsonb_build_object('account', _wallet_account(g.user_id), 'amount', g.staked_kobo);
  END LOOP;

  res := _ledger_post('refund', 'refund:' || p_match, NULL,
                      jsonb_build_object('match_id', p_match, 'reason', p_reason), v_legs);
  UPDATE match_players SET payout_kobo = staked_kobo WHERE match_id = p_match AND staked_kobo > 0;
  UPDATE pool_escrows SET status = 'refunded' WHERE match_id = p_match;
  UPDATE matches SET status = v_status, finished_at = coalesce(finished_at, now()) WHERE id = p_match;
  RETURN res;
END;
$$;

-- Admin-only: undo a transaction by posting its exact opposite. Fails with insufficient_funds if a
-- credited wallet has since spent the money (an admin then resolves it with an 'adjust').
CREATE FUNCTION reverse_txn(p_txn uuid, p_reason text, p_admin uuid) RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t ledger_txns;
  v_legs jsonb;
BEGIN
  SELECT * INTO t FROM ledger_txns WHERE id = p_txn;
  IF NOT FOUND THEN RAISE EXCEPTION 'dyce:txn_not_found'; END IF;
  IF t.kind = 'reversal' THEN RAISE EXCEPTION 'dyce:cannot_reverse_a_reversal'; END IF;

  SELECT jsonb_agg(jsonb_build_object('account', account_id, 'amount', -amount_kobo))
    INTO v_legs FROM ledger_entries WHERE txn_id = p_txn;

  RETURN _ledger_post(
    'reversal', 'reverse:' || p_txn, p_admin,
    jsonb_build_object('reverses', p_txn, 'reason', p_reason), v_legs
  );
END;
$$;

-- Free daily top-up: balance under the threshold, once per Lagos day.
CREATE FUNCTION claim_daily_topup(p_user uuid) RETURNS ledger_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_key text := 'topup:' || p_user || ':' || lagos_today();
  v_balance bigint;
  v_amount bigint := cfg_bigint('topup_amount_kobo', 2000000);
BEGIN
  PERFORM 1 FROM wallets WHERE user_id = p_user ORDER BY user_id FOR UPDATE;
  IF _replay(v_key) IS NOT NULL THEN RAISE EXCEPTION 'dyce:topup_already_claimed'; END IF;
  SELECT balance_kobo INTO v_balance FROM wallets WHERE user_id = p_user;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'dyce:no_wallet'; END IF;
  IF v_balance >= cfg_bigint('topup_threshold_kobo', 1000000) THEN RAISE EXCEPTION 'dyce:balance_too_high'; END IF;
  RETURN _ledger_post(
    'topup', v_key, p_user,
    jsonb_build_object('to_user', p_user, 'amount_kobo', v_amount),
    jsonb_build_array(
      jsonb_build_object('account', _system_account('system_topup'), 'amount', -v_amount),
      jsonb_build_object('account', _wallet_account(p_user), 'amount', v_amount)
    )
  );
END;
$$;

-- Nightly invariant check (called by a scheduled NestJS job). Returns one row per problem.
-- With p_freeze, Pool is frozen for affected users until a human clears it.
CREATE FUNCTION ledger_check_invariants(p_freeze boolean DEFAULT false)
RETURNS TABLE (problem text, ref uuid, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
    SELECT 'unbalanced_txn'::text, e.txn_id, ('sum=' || sum(e.amount_kobo))::text
      FROM ledger_entries e GROUP BY e.txn_id HAVING sum(e.amount_kobo) <> 0;

  RETURN QUERY
    SELECT 'wallet_mismatch'::text, w.user_id,
           ('cached=' || w.balance_kobo || ' ledger=' || coalesce(s.total, 0))::text
      FROM wallets w
      LEFT JOIN (SELECT account_id, sum(amount_kobo) AS total FROM ledger_entries GROUP BY account_id) s
        ON s.account_id = w.account_id
     WHERE w.balance_kobo <> coalesce(s.total, 0);

  RETURN QUERY
    SELECT 'escrow_negative'::text, a.match_id, ('sum=' || sum(e.amount_kobo))::text
      FROM ledger_accounts a JOIN ledger_entries e ON e.account_id = a.id
     WHERE a.kind = 'pool_escrow' GROUP BY a.match_id HAVING sum(e.amount_kobo) < 0;

  IF p_freeze THEN
    UPDATE profiles SET pool_frozen = true
     WHERE id IN (
       SELECT w.user_id FROM wallets w
         LEFT JOIN (SELECT account_id, sum(amount_kobo) AS total FROM ledger_entries GROUP BY account_id) s
           ON s.account_id = w.account_id
        WHERE w.balance_kobo <> coalesce(s.total, 0)
     );
  END IF;
END;
$$;
