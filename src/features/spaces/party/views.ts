import { z } from 'zod';

/**
 * What each party game's engine sends to ONE seat (`engine.view(state, you)`, protocol:
 * dyce-backend/docs/PARTY_ROOM_PROTOCOL.md section 4). The wire is `unknown` until it passes through
 * one of these parsers; a view that does not parse is "the table could not be read", never a crash.
 * Fields the engine only sends to some seats (a role, a word, a canvas) are optional or nullable here
 * and the screens treat "missing" as "you may not see it". No React in this file, so it is tested.
 */

const id = z.string();
const ids = z.array(id);
const ms = z.number().finite();

/** Parses `view`, or null when it is not this game's view. */
function parseWith<T>(schema: z.ZodType<T>, view: unknown): T | null {
  const r = schema.safeParse(view);
  return r.success ? r.data : null;
}

// ---- Imposter ---------------------------------------------------------------------------------------

export const imposterPhases = ['reveal', 'clue', 'vote', 'guess', 'over'] as const;
export type ImposterPhase = (typeof imposterPhases)[number];

const imposterView = z.object({
  players: ids,
  phase: z.enum(imposterPhases),
  timeLeftMs: ms,
  imposterCount: z.number().int(),
  packLabel: z.string(),
  role: z.enum(['crew', 'imposter']).nullable(),
  word: z.string().nullable(),
  partners: ids.default([]),
  imposters: ids.optional(),
  order: ids,
  speaker: id.nullable(),
  round: z.number().int().nullable(),
  clueRounds: z.number().int(),
  clues: z.array(z.object({ round: z.number().int(), by: id, text: z.string().nullable() })),
  ready: ids,
  voted: ids,
  myVote: ids.nullable(),
  votes: z.record(z.string(), ids).optional(),
  tally: z.record(z.string(), z.number()).optional(),
  accused: ids.default([]),
  guessed: ids.default([]),
  guesses: z.record(z.string(), z.string()).optional(),
  winner: z.enum(['crew', 'imposters']).nullable(),
  seq: z.number(),
});
export type ImposterView = z.infer<typeof imposterView>;
export const parseImposterView = (v: unknown): ImposterView | null => parseWith(imposterView, v);

// ---- Werewolf ---------------------------------------------------------------------------------------

export const werewolfRoles = ['villager', 'werewolf', 'seer', 'doctor'] as const;
export type WerewolfRole = (typeof werewolfRoles)[number];
export const werewolfPhases = ['night', 'day', 'vote', 'over'] as const;
export type WerewolfPhase = (typeof werewolfPhases)[number];

const roleSchema = z.enum(werewolfRoles);
const werewolfLog = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('night'),
    night: z.number().int(),
    killed: id.nullable(),
    role: roleSchema.nullable(),
  }),
  z.object({
    kind: z.literal('lynch'),
    night: z.number().int(),
    lynched: id.nullable(),
    role: roleSchema.nullable(),
    votes: z.record(z.string(), id.nullable()),
  }),
]);
export type WerewolfLog = z.infer<typeof werewolfLog>;

const werewolfView = z.object({
  players: ids,
  phase: z.enum(werewolfPhases),
  night: z.number().int(),
  timeLeftMs: ms,
  alive: ids,
  dead: ids,
  composition: z.object({
    werewolf: z.number().int(),
    seer: z.number().int(),
    doctor: z.number().int(),
    villager: z.number().int(),
  }),
  role: roleSchema.nullable(),
  revealed: z.record(z.string(), roleSchema).default({}),
  roles: z.record(z.string(), roleSchema).optional(),
  wolves: ids.optional(),
  wolfTargets: z.record(z.string(), id).optional(),
  inspecting: id.nullable().optional(),
  seerLog: z
    .array(z.object({ night: z.number().int(), target: id, werewolf: z.boolean() }))
    .optional(),
  protecting: id.nullable().optional(),
  acted: z.boolean().nullable(),
  ready: ids,
  voted: ids,
  myVote: id.nullable(),
  log: z.array(werewolfLog),
  winner: z.enum(['villagers', 'werewolves', 'draw']).nullable(),
  seq: z.number(),
});
export type WerewolfView = z.infer<typeof werewolfView>;
export const parseWerewolfView = (v: unknown): WerewolfView | null => parseWith(werewolfView, v);

// ---- Charades ---------------------------------------------------------------------------------------

export const charadesPhases = ['ready', 'acting', 'over'] as const;
export type CharadesPhase = (typeof charadesPhases)[number];

const charadesView = z.object({
  players: ids,
  teams: z.array(ids),
  solo: z.boolean(),
  mode: z.enum(['act', 'headsup']),
  phase: z.enum(charadesPhases),
  timeLeftMs: ms,
  turn: z.number().int(),
  turns: z.number().int(),
  actor: id.nullable(),
  actorTeam: z.number().int().nullable(),
  scores: z.array(z.number()),
  category: z.string().nullable(),
  word: z.string().nullable(),
  cardNo: z.number().int().nullable(),
  cardsPerTurn: z.number().int(),
  skipsLeft: z.number().int().nullable(),
  last: z
    .object({
      seq: z.number(),
      kind: z.enum(['start', 'got_it', 'skip', 'time_up', 'forfeit']),
      by: id,
      guesser: id.nullable(),
      text: z.string().nullable(),
    })
    .nullable(),
});
export type CharadesView = z.infer<typeof charadesView>;
export const parseCharadesView = (v: unknown): CharadesView | null => parseWith(charadesView, v);

// ---- Doodle Guess -----------------------------------------------------------------------------------

export const doodlePhases = ['choose', 'draw', 'over'] as const;
export type DoodlePhase = (typeof doodlePhases)[number];

const doodleFeed = z.discriminatedUnion('kind', [
  z.object({ seq: z.number(), kind: z.literal('guess'), by: id, text: z.string() }),
  z.object({ seq: z.number(), kind: z.literal('close'), by: id }),
  z.object({ seq: z.number(), kind: z.literal('correct'), by: id, points: z.number() }),
]);
export type DoodleFeedEntry = z.infer<typeof doodleFeed>;

const doodleView = z.object({
  players: ids,
  phase: z.enum(doodlePhases),
  timeLeftMs: ms,
  turn: z.number().int(),
  turns: z.number().int(),
  round: z.number().int(),
  rounds: z.number().int(),
  drawer: id.nullable(),
  packLabel: z.string(),
  choices: z.array(z.string()).default([]),
  word: z.string().nullable(),
  mask: z.array(z.string().nullable()).nullable(),
  /** The drawing is NOT in the view (it travels as `canvas` messages); only how many strokes there are. */
  strokeCount: z.number().int().default(0),
  solvers: ids,
  scores: z.record(z.string(), z.number()),
  feed: z.array(doodleFeed),
  history: z.array(z.object({ drawer: id, word: z.string(), solvers: ids })),
  seq: z.number(),
});
export type DoodleView = z.infer<typeof doodleView>;
export const parseDoodleView = (v: unknown): DoodleView | null => parseWith(doodleView, v);
