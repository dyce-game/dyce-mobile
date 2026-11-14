-- Auth and onboarding support.
-- 1) Usernames follow docs/SPEC.md section 4: 3-20 chars of a-z 0-9 . _ ; no leading/trailing dot, no "..".
--    (0001 allowed only a-z 0-9 _ ; the spec wins.)
-- 2) Reserved names are blocked in the database too, so a bug in the API cannot let someone register "admin".
-- 3) profiles.onboarding records steps the CLIENT reports finished (contacts, avatar, notifications).
--    Profile existence and the welcome grant are derived from real data, never from a flag.

ALTER TABLE profiles DROP CONSTRAINT username_format;
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (
  username ~ '^[a-z0-9_][a-z0-9._]{1,18}[a-z0-9_]$' AND username !~ '\.\.'
);

CREATE TABLE reserved_usernames (
  name text PRIMARY KEY CHECK (name = lower(name))
);

INSERT INTO reserved_usernames (name) VALUES
  ('dyce'), ('admin'), ('administrator'), ('support'), ('help'), ('official'), ('staff'),
  ('moderator'), ('mod'), ('system'), ('security'), ('team'), ('root'), ('null'),
  ('undefined'), ('wallet'), ('bank'), ('pool'), ('cash');

CREATE FUNCTION profiles_reject_reserved_username() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM reserved_usernames WHERE name = lower(NEW.username)) THEN
    RAISE EXCEPTION 'dyce:username_reserved';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_reserved_username
  BEFORE INSERT OR UPDATE OF username ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_reject_reserved_username();

ALTER TABLE profiles ADD COLUMN onboarding jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Age can be set once. Without this a minor could retry birth years until one passes.
CREATE FUNCTION profiles_birth_year_set_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.birth_year IS NOT NULL AND NEW.birth_year IS DISTINCT FROM OLD.birth_year THEN
    RAISE EXCEPTION 'dyce:age_already_set';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_birth_year_once
  BEFORE UPDATE OF birth_year ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_birth_year_set_once();

-- Tables created after 0006 need explicit grants (money tables never get blanket grants).
GRANT SELECT ON reserved_usernames TO dyce_api;

-- OTP rate-limit windows scan by phone and time.
CREATE INDEX IF NOT EXISTS otp_challenges_created_idx ON otp_challenges (created_at);
