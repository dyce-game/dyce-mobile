-- Game catalogue, matches, spaces and progression.

CREATE TYPE game_dimension AS ENUM ('2d', '3d');
CREATE TYPE game_sync AS ENUM ('async', 'live');
CREATE TYPE match_mode AS ENUM ('free', 'pool');
CREATE TYPE match_status AS ENUM (
  'invited', 'countered', 'active', 'finished', 'expired', 'cancelled', 'disputed'
);
CREATE TYPE match_result AS ENUM ('win', 'loss', 'draw', 'forfeit');
CREATE TYPE payout_scheme AS ENUM ('winner_all', 'p50_30_20', 'p60_40');

CREATE TABLE games (
  slug                  text PRIMARY KEY,
  name                  text NOT NULL,
  dimension             game_dimension NOT NULL,
  sync                  game_sync NOT NULL,
  min_players           int NOT NULL CHECK (min_players >= 1),
  max_players           int NOT NULL CHECK (max_players >= min_players),
  categories            text[] NOT NULL DEFAULT '{}',
  supports_pool         boolean NOT NULL DEFAULT true,
  thumbnail_video_path  text,
  poster_path           text,
  enabled               boolean NOT NULL DEFAULT false
);

CREATE TYPE space_visibility AS ENUM ('friends', 'public', 'invite');
CREATE TYPE space_start_rule AS ENUM ('when_full', 'host');
CREATE TYPE space_status AS ENUM ('waiting', 'live', 'ended', 'closed');

CREATE TABLE spaces (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,
  name              text NOT NULL,
  host_id           uuid NOT NULL REFERENCES users(id),
  game_slug         text NOT NULL REFERENCES games(slug),
  mode              match_mode NOT NULL DEFAULT 'free',
  seat_fee_kobo     bigint NOT NULL DEFAULT 0 CHECK (seat_fee_kobo >= 0),
  payout_scheme     payout_scheme NOT NULL DEFAULT 'winner_all',
  max_seats         int NOT NULL CHECK (max_seats >= 2),
  visibility        space_visibility NOT NULL DEFAULT 'friends',
  start_rule        space_start_rule NOT NULL DEFAULT 'host',
  status            space_status NOT NULL DEFAULT 'waiting',
  game_server_room  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE space_members (
  space_id   uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat       int NOT NULL,
  ready      boolean NOT NULL DEFAULT false,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  left_at    timestamptz,
  removed    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE matches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug        text NOT NULL REFERENCES games(slug),
  mode             match_mode NOT NULL DEFAULT 'free',
  stake_kobo       bigint NOT NULL DEFAULT 0 CHECK (stake_kobo >= 0),
  payout_scheme    payout_scheme NOT NULL DEFAULT 'winner_all',
  status           match_status NOT NULL DEFAULT 'invited',
  conversation_id  uuid REFERENCES conversations(id) ON DELETE SET NULL,
  space_id         uuid REFERENCES spaces(id) ON DELETE SET NULL,
  seed             bigint NOT NULL,
  state            jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_version    int NOT NULL DEFAULT 0,
  current_turn     uuid REFERENCES users(id),
  turn_deadline    timestamptz,
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  CHECK (mode = 'pool' OR stake_kobo = 0)
);
CREATE INDEX matches_conversation_idx ON matches (conversation_id, created_at DESC);

CREATE TABLE match_players (
  match_id     uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id),
  seat         int NOT NULL,
  accepted_at  timestamptz,
  staked_kobo  bigint NOT NULL DEFAULT 0 CHECK (staked_kobo >= 0),
  result       match_result,
  placement    int CHECK (placement IS NULL OR placement >= 1),
  payout_kobo  bigint CHECK (payout_kobo IS NULL OR payout_kobo >= 0),
  PRIMARY KEY (match_id, user_id),
  UNIQUE (match_id, seat)
);

-- Append-only move log. The primary key (match_id, seq) gives optimistic concurrency for free.
CREATE TABLE match_moves (
  match_id    uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq         int NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id),
  action      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, seq)
);

CREATE TABLE xp_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      int NOT NULL,
  reason      text NOT NULL,
  match_id    uuid REFERENCES matches(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_idx ON xp_events (user_id, created_at DESC);

CREATE TABLE streaks (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current            int NOT NULL DEFAULT 0,
  best               int NOT NULL DEFAULT 0,
  last_win_date      date,
  saver_expires_at   timestamptz
);

CREATE TABLE badges (
  slug         text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL,
  icon         text NOT NULL
);

CREATE TABLE user_badges (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug  text NOT NULL REFERENCES badges(slug),
  earned_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_slug)
);

-- Weekly leaderboard: refreshed by a NestJS scheduled job every 10 minutes (no pg_cron).
CREATE MATERIALIZED VIEW leaderboard_weekly AS
SELECT x.user_id,
       sum(x.amount)::bigint AS xp_week,
       rank() OVER (ORDER BY sum(x.amount) DESC) AS rank
FROM xp_events x
WHERE x.created_at >= date_trunc('week', now())
GROUP BY x.user_id;
CREATE UNIQUE INDEX leaderboard_weekly_user_idx ON leaderboard_weekly (user_id);
