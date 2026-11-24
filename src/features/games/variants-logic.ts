import type { GameInfo, GameOption, MatchOptions } from '@dyce/shared';

/**
 * Per-match variants (backend ADR-041): the switch a game offers on the mode sheet before it is sent, such as
 * "Ayo or Mancala (Kalah)", "501 or Around the clock", "Classic or Salvo". The server says what each game offers
 * (`GameInfo.options`) and which variants can be played for stakes; this only picks and describes. No React.
 */
export type Picks = Record<string, string | number | boolean>;

export const optionsOf = (game: Pick<GameInfo, 'options'> | undefined): GameOption[] =>
  game?.options ?? [];

/** Every option at its default. */
export function defaultPicks(game: Pick<GameInfo, 'options'> | undefined): Picks {
  return Object.fromEntries(optionsOf(game).map((o) => [o.key, o.default]));
}

/** The picks the server needs to hear about: only what differs from the default (`undefined` when nothing does). */
export function requestOptions(
  game: Pick<GameInfo, 'options'> | undefined,
  picks: Picks,
): MatchOptions | undefined {
  const out: MatchOptions = {};
  for (const o of optionsOf(game)) {
    const v = picks[o.key];
    if (v !== undefined && v !== o.default) out[o.key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Can the variants picked be played for stakes? (Darts' Around the clock is a free variant.) */
export function poolAllowed(game: Pick<GameInfo, 'options'> | undefined, picks: Picks): boolean {
  return optionsOf(game).every(
    (o) => o.choices.find((c) => c.value === (picks[o.key] ?? o.default))?.pool !== false,
  );
}

/** The name of a non-default variant ("Mancala (Kalah)"), else null. */
export function pickedLabel(
  game: Pick<GameInfo, 'options'> | undefined,
  picks: Picks,
): string | null {
  for (const o of optionsOf(game)) {
    const v = picks[o.key] ?? o.default;
    if (v === o.default) continue;
    const label = o.choices.find((c) => c.value === v)?.label;
    if (label) return label;
  }
  return null;
}

/** A line for a screen reader: "Rules: Ayo, or Mancala (Kalah)". */
export const optionSpoken = (o: GameOption): string =>
  `${o.label}: ${o.choices.map((c) => c.label).join(', or ')}`;
