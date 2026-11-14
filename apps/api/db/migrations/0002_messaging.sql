-- Messaging. Stranger messages stay in Requests: conversation_members.state = 'request'.

CREATE TYPE conversation_kind AS ENUM ('direct', 'group', 'bot', 'sms');
CREATE TYPE member_role AS ENUM ('member', 'admin');
CREATE TYPE member_state AS ENUM ('active', 'request', 'declined', 'left');
CREATE TYPE message_kind AS ENUM (
  'text', 'voice', 'image', 'game', 'money_sent', 'money_request', 'poll', 'system', 'sms_invite'
);

CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             conversation_kind NOT NULL,
  title            text,
  photo_url        text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz
);

CREATE TABLE conversation_members (
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             member_role NOT NULL DEFAULT 'member',
  state            member_state NOT NULL DEFAULT 'active',
  last_read_at     timestamptz,
  muted_until      timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id, state);

CREATE TABLE messages (
  id               uuid PRIMARY KEY, -- client-generated for optimistic UI
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  kind             message_kind NOT NULL,
  body             text,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to         uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  edited_at        timestamptz,
  deleted_at       timestamptz
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at DESC);

CREATE TABLE reactions (
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       text NOT NULL, -- member of a fixed set, rendered as an icon
  PRIMARY KEY (message_id, user_id)
);

CREATE TYPE sms_invite_status AS ENUM ('sent', 'opened', 'played', 'joined');

CREATE TABLE sms_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_hash  bytea NOT NULL,
  game_slug   text,
  match_id    uuid,
  token       text NOT NULL UNIQUE,
  status      sms_invite_status NOT NULL DEFAULT 'sent',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_invites_inviter_idx ON sms_invites (inviter_id, created_at DESC);
