import { useCallback, useEffect, useState } from 'react';

/**
 * Sends one action at a time: after `send` the buttons stay locked until the room answers (a new state
 * version) or refuses (an error code arrives). The room is the judge, so a button that was pressed twice
 * or a stale tap is harmless; this only stops the double tap from looking like two moves.
 */
export function useSend(
  onMove: (action: unknown) => boolean,
  version: number,
  errorCode: string | null,
): { sending: boolean; send: (action: unknown) => boolean } {
  const [sending, setSending] = useState(false);
  useEffect(() => setSending(false), [version, errorCode]);
  const send = useCallback(
    (action: unknown) => {
      const ok = onMove(action);
      if (ok) setSending(true);
      return ok;
    },
    [onMove],
  );
  return { sending, send };
}
