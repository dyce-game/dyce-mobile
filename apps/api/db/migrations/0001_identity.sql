-- Identity, auth and social graph.
-- Phone numbers are NEVER stored in plaintext: only a salted HMAC of the E.164 number (users.phone_hash).
-- The salt is a server secret held by the API. This table replaces ARCHITECTURE section 3 `phone_hashes`.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash    bytea NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);

CREATE TYPE request_policy AS ENUM ('everyone', 'fof', 'nobody');

CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username        text NOT NULL,
  display_name    text NOT NULL DEFAULT '',
  avatar          jsonb NOT NULL DEFAULT '{}'::jsonb,
  level           int NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp              int NOT NULL DEFAULT 0 CHECK (xp >= 0),
  is_adult        boolean NOT NULL DEFAULT false,
  birth_year      int CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100),
  city            text,
  show_online     boolean NOT NULL DEFAULT true,
  request_policy  request_policy NOT NULL DEFAULT 'everyone',
  pool_frozen     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')
);
-- Case-insensitive uniqueness without the citext extension (usernames are stored lowercase anyway).
CREATE UNIQUE INDEX profiles_username_lower_key ON profiles (lower(username));

-- Phone OTP challenges. code_hash is a hash of the 6-digit code; attempts are capped by the API.
CREATE TABLE otp_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash   bytea NOT NULL,
  code_hash    bytea NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_phone_idx ON otp_challenges (phone_hash, created_at DESC);

-- Rotating refresh tokens. A reused (already replaced) token revokes its whole family.
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,
  token_hash   bytea NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid REFERENCES refresh_tokens(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Result of contact matching (owner's contacts that are Dyce users).
CREATE TABLE contact_links (
  owner_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, contact_user_id),
  CHECK (owner_id <> contact_user_id)
);

CREATE TYPE friendship_status AS ENUM ('pending', 'accepted');

-- user_low < user_high so each pair has exactly one row.
CREATE TABLE friendships (
  user_low      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        friendship_status NOT NULL DEFAULT 'pending',
  requested_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high),
  CHECK (requested_by IN (user_low, user_high))
);

CREATE TABLE blocks (
  blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

CREATE TABLE reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  conversation_id  uuid,
  message_id       uuid,
  reason           text NOT NULL,
  note             text,
  status           report_status NOT NULL DEFAULT 'open',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token)
);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE app_config (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
