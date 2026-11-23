import type { CanvasStroke } from '@dyce/games';
import type { LiveChat, LiveState, SpaceView } from '@dyce/shared';
import type { LiveStatus } from '../live-connection';

/** What the table screen hands every party screen (all from `useLiveTable` and the Space). */
export type PartyScreenProps = {
  space: SpaceView;
  myId: string;
  live: LiveState;
  status: LiveStatus;
  /** Local time `live` arrived: the countdown counts from the server's clock plus the time since. */
  receivedAt: number;
  /** The server's last refusal, cleared by the next state. */
  errorCode: string | null;
  /** Table talk the room let this seat hear, oldest first. */
  chats: LiveChat[];
  /** Doodle Guess: the drawing as the room has it. */
  canvas: CanvasStroke[];
  onMove: (action: unknown) => boolean;
  onChat: (text: string) => boolean;
  onForfeit: () => void;
  onBack: () => void;
  /** Go to the results screen now (the table moves there by itself after a while). */
  onContinue: () => void;
};
