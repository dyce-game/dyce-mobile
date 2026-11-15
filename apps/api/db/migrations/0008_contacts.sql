-- Contact matching and friend requests.
-- Raw contact numbers are never stored: matching hashes them in memory and we persist only the ids of
-- the Dyce users that matched (contact_links, created in 0001). This migration adds the abuse limiter
-- for lookups and the indexes the new queries need.

-- How many numbers each user has asked us to look up today (Africa/Lagos day). Matching is a
-- membership oracle ("is this number on Dyce?"), so it is capped per user per day.
CREATE TABLE contact_lookups (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      date NOT NULL,
  lookups  int  NOT NULL DEFAULT 0 CHECK (lookups >= 0),
  PRIMARY KEY (user_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_lookups TO dyce_api;

-- "Who has me in their contacts" (and cascading deletes) look up by the contact side.
CREATE INDEX contact_links_contact_idx ON contact_links (contact_user_id);
-- friendships' primary key is (user_low, user_high); finding all of one user's rows as the high side needs this.
CREATE INDEX friendships_high_idx ON friendships (user_high, status);
CREATE INDEX friendships_requested_by_idx ON friendships (requested_by, created_at);

INSERT INTO app_config (key, value) VALUES
  ('contact_lookups_per_day', '10000'),
  ('friend_requests_per_day', '50')
ON CONFLICT (key) DO NOTHING;
