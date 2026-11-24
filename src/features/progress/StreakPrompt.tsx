import { useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import { shouldPrompt } from './streak-logic';
import { useStreakQuery } from './use-streak';

/**
 * Renders nothing. Mounted on the result of a finished game: if the person's streak has ended and a saver is still
 * on offer, puts the "Streak ended" card in front of them once (design: StreakLost). The server says whether it has
 * been seen, so a second device does not show it again.
 */
export function StreakPrompt({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const streak = useStreakQuery(enabled);
  const shown = useRef(false);
  const prompt = shouldPrompt(streak.data);
  useEffect(() => {
    if (!enabled || !prompt || shown.current) return;
    shown.current = true;
    router.push('/streak' as Href);
  }, [enabled, prompt, router]);
  return null;
}
