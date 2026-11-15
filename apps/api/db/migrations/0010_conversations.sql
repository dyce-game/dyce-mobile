-- One-to-one chats, the Requests inbox, and unread/read state.
--
-- A direct conversation is unique per pair of people (`direct_key` = "<low id>:<high id>"). Messages to
-- someone you aren't friends with create the conversation with the *recipient's* membership in state
-- 'request': it stays out of their Chat until they accept (or reply). A recipient who ignores it moves to
-- 'declined'; the sender is never told.

ALTER TABLE conversations ADD COLUMN direct_key text;
CREATE UNIQUE INDEX conversations_direct_key_idx ON conversations (direct_key) WHERE direct_key IS NOT NULL;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_direct_key_chk CHECK (kind <> 'direct' OR direct_key IS NOT NULL);

-- Text messages must have a body of a sane size. (Other kinds carry their data in `payload`.)
ALTER TABLE messages
  ADD CONSTRAINT messages_text_body_chk
  CHECK (kind <> 'text' OR (body IS NOT NULL AND char_length(body) BETWEEN 1 AND 4000));

-- Newest-first paging by (created_at, id): the id breaks ties between messages sent in the same instant.
DROP INDEX messages_conversation_idx;
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at DESC, id DESC);

-- "Unread" and the Requests count read the member rows of one user.
CREATE INDEX conversation_members_user_state_idx ON conversation_members (user_id, state, conversation_id);

INSERT INTO app_config (key, value) VALUES
  -- how many messages a stranger can send before the other person has replied or accepted
  ('request_messages_before_accept', '3')
ON CONFLICT (key) DO NOTHING;
