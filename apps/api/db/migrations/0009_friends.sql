-- Friends list and accept / ignore.
--
-- "declined" is what the Friend requests screen calls "Ignore". The requester is NOT told: to them the
-- request still looks pending, and they can't send another one (the row already exists). If the person
-- who ignored later adds them back, that is treated as accepting.
-- Note: a new enum value can't be used in the same transaction that adds it, so nothing here uses it.
ALTER TYPE friendship_status ADD VALUE IF NOT EXISTS 'declined';

-- When the request was answered (accepted or ignored). "Friends since" uses this, falling back to created_at.
ALTER TABLE friendships ADD COLUMN responded_at timestamptz;
