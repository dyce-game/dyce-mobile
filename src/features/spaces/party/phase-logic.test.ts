import {
  ROOM_ACTOR,
  charadesEngine,
  imposterEngine,
  werewolfEngine,
  type CharadesState,
  type ImposterState,
  type WerewolfState,
} from '@dyce/games';
import type { LiveResultRow } from '@dyce/shared';
import {
  clockLabel,
  formatClock,
  hasPartyScreen,
  joinNames,
  myOutcomeLine,
  nameResolver,
  ordinal,
  partyRefusal,
  phaseTotalMs,
  resultLines,
  ringFraction,
  seatNote,
  talkState,
} from './common-logic';
import {
  CLUE_MAX_WORDS,
  clueProblem,
  endSummary,
  imposterStage,
  latestClues,
  notVoted,
  roleCard,
  suspects,
  toggleVote,
  voteComplete,
} from './imposter-logic';
import {
  isAlive,
  lastNightLine,
  logLines,
  nightAction,
  packVotes,
  seerFindings,
  werewolfStage,
  iWon,
  compositionLine,
} from './werewolf-logic';
import {
  TILT_COOLDOWN_MS,
  charadesStage,
  guesserChoices,
  needsGuesser,
  newTilt,
  scoreRows,
  stepTilt,
  winnerText,
  lastEventLine,
} from './charades-logic';
import {
  parseCharadesView,
  parseImposterView,
  parseWerewolfView,
  type CharadesView,
  type ImposterView,
  type WerewolfView,
} from './views';

const P = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);
const space = {
  members: P(8).map((id, i) => ({
    userId: id,
    displayName: `Name${i + 1}`,
    username: `user${i + 1}`,
  })),
} as never;
const nameOf = nameResolver(space, 'u1');

// ---- common -------------------------------------------------------------------------------------------

describe('common helpers', () => {
  it('knows which games have a party screen', () => {
    for (const s of ['imposter', 'werewolf', 'charades', 'doodle-guess'])
      expect(hasPartyScreen(s)).toBe(true);
    for (const s of ['whot', 'crazy-cards', 'chess']) expect(hasPartyScreen(s)).toBe(false);
  });

  it('names you "You" and everyone else by display name', () => {
    expect(nameOf('u1')).toBe('You');
    expect(nameOf('u2')).toBe('Name2');
    expect(nameOf('stranger')).toBe('Player');
    expect(nameOf(null)).toBe('Nobody');
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('draws the ring against the default phase length and never past 0..1', () => {
    expect(phaseTotalMs('imposter', 'vote')).toBe(45_000);
    expect(phaseTotalMs('imposter', 'vote', 90_000)).toBe(90_000);
    expect(ringFraction(15, 30_000)).toBe(0.5);
    expect(ringFraction(60, 30_000)).toBe(1);
    expect(ringFraction(null, 30_000)).toBe(0);
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(null)).toBe('–:––');
    expect(clockLabel(1)).toBe('1 second left');
    expect(clockLabel(null)).toBe('No clock yet');
  });

  it('says who is offline or gone', () => {
    const live = {
      seats: [
        { userId: 'u1', seat: 1, connected: true, forfeited: false },
        { userId: 'u2', seat: 2, connected: false, forfeited: false },
        { userId: 'u3', seat: 3, connected: false, forfeited: true },
      ],
    };
    expect(seatNote(live, 'u1')).toBeNull();
    expect(seatNote(live, 'u2')).toBe('offline');
    expect(seatNote(live, 'u3')).toBe('left');
    expect(seatNote(live, 'u9')).toBeNull();
  });

  it('only opens table talk where the room would relay it', () => {
    const live = { status: 'live', waiting: false } as const;
    // Imposter: voting and after.
    expect(talkState('imposter', { phase: 'clue' }, 'u1', live).open).toBe(false);
    expect(talkState('imposter', { phase: 'vote' }, 'u1', live).open).toBe(true);
    expect(talkState('imposter', { phase: 'guess' }, 'u1', live).open).toBe(false);
    expect(
      talkState('imposter', { phase: 'over' }, 'u1', { status: 'finished', waiting: false }).open,
    ).toBe(true);
    // Werewolf: night only for wolves; the dead only to the dead; day for the living.
    expect(
      talkState('werewolf', { phase: 'night', role: 'villager', dead: [] }, 'u1', live).open,
    ).toBe(false);
    expect(
      talkState('werewolf', { phase: 'night', role: 'werewolf', dead: [] }, 'u1', live).open,
    ).toBe(true);
    expect(
      talkState('werewolf', { phase: 'day', role: 'villager', dead: [] }, 'u1', live).open,
    ).toBe(true);
    expect(
      talkState('werewolf', { phase: 'day', role: 'villager', dead: ['u1'] }, 'u1', live).note,
    ).toMatch(/fallen/);
    // Charades: everyone but the actor while acting.
    expect(talkState('charades', { phase: 'acting', actor: 'u1' }, 'u1', live).open).toBe(false);
    expect(talkState('charades', { phase: 'acting', actor: 'u2' }, 'u1', live).open).toBe(true);
    // Doodle: a guess is an action, not chat. Nothing opens before everyone has joined.
    expect(talkState('doodle-guess', { phase: 'draw' }, 'u1', live).open).toBe(false);
    expect(
      talkState('imposter', { phase: 'vote' }, 'u1', { status: 'live', waiting: true }).open,
    ).toBe(false);
  });

  it('puts results best first and describes your own outcome', () => {
    const rows: LiveResultRow[] = [
      { userId: 'u3', placement: 2, result: 'loss', payoutKobo: 0 },
      { userId: 'u1', placement: 1, result: 'win', payoutKobo: 150_000 },
      { userId: 'u2', placement: 2, result: 'forfeit', payoutKobo: null },
    ];
    const lines = resultLines(rows);
    expect(lines.map((l) => l.userId)).toEqual(['u1', 'u3', 'u2']);
    expect(resultLines(null)).toEqual([]);
    expect(myOutcomeLine(lines, 'u1')).toBe('You won');
    expect(myOutcomeLine(lines, 'u3')).toBe('You finished 2nd');
    expect(myOutcomeLine(lines, 'u2')).toBe('You left the game');
    expect(myOutcomeLine(lines, 'u9')).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
    ]);
  });

  it('keeps quiet about harmless refusals and explains the rest', () => {
    expect(partyRefusal(null)).toBeNull();
    expect(partyRefusal('not_your_turn')).toBeNull();
    expect(partyRefusal('illegal_move:wrong_phase')).toBeNull();
    expect(partyRefusal('illegal_move:not_allowed')).toMatch(/not allowed/);
    expect(partyRefusal('illegal_move:clue_too_long')).toMatch(/three words/);
    expect(partyRefusal('rate_limited')).toMatch(/Slow down/);
    expect(partyRefusal('server_error')).toMatch(/Something went wrong/);
  });
});

// ---- Imposter ------------------------------------------------------------------------------------------

function imposterViews(n = 5) {
  const s = imposterEngine.init(P(n), 11n, {}) as ImposterState;
  const view = (who: string, st: ImposterState = s) =>
    parseImposterView(imposterEngine.view(st, who)) as ImposterView;
  return { s, view };
}

describe('Imposter', () => {
  it('validates clues the way the engine does', () => {
    expect(clueProblem('')).toMatch(/Say something/);
    expect(clueProblem('   ')).toMatch(/Say something/);
    expect(clueProblem('smoky')).toBeNull();
    expect(clueProblem('very smoky street')).toBeNull();
    expect(CLUE_MAX_WORDS).toBe(3);
    expect(clueProblem('a b c d')).toMatch(/one to three/);
    expect(clueProblem('x'.repeat(61))).toMatch(/too long/);
  });

  it('toggles suspects up to the imposter count', () => {
    expect(toggleVote([], 'a', 1)).toEqual(['a']);
    expect(toggleVote(['a'], 'a', 1)).toEqual([]);
    expect(toggleVote(['a'], 'b', 1)).toEqual(['b']); // one pick: the new one replaces it
    expect(toggleVote(['a', 'b'], 'c', 2)).toEqual(['b', 'c']);
    expect(voteComplete(['a', 'b'], 2)).toBe(true);
    expect(voteComplete(['a'], 2)).toBe(false);
  });

  it('shows the right role card to crew and imposter, never the word to the imposter', () => {
    const { s, view } = imposterViews();
    const crew = s.players.find((p) => !s.imposters.includes(p))!;
    const imp = s.imposters[0]!;
    const c = roleCard(view(crew), nameOf);
    expect(c.kind).toBe('crew');
    expect(c.word).toBe(s.word);
    const i = roleCard(view(imp), nameOf);
    expect(i.kind).toBe('imposter');
    expect(i.word).toBeNull();
    expect(i.title).not.toContain(s.word);
    expect(JSON.stringify(i)).not.toContain(s.word);
  });

  it('walks through the phases with the right headline and button', () => {
    const { s, view } = imposterViews();
    const me = 'u1';
    expect(imposterStage(view(me), me, nameOf).action).toBe('ready');
    const ready = imposterEngine.apply(s, me, { kind: 'ready' }) as ImposterState;
    expect(imposterStage(view(me, ready), me, nameOf).action).toBeNull();
    let st = ready;
    for (const p of s.players.filter((x) => x !== me))
      st = imposterEngine.apply(st, p, { kind: 'ready' }) as ImposterState;
    expect(st.phase).toBe('clue');
    const speaker = view(me, st).speaker!;
    const stage = imposterStage(view(me, st), me, nameOf);
    expect(stage.action).toBe(speaker === me ? 'clue' : null);
    // The speaker gives a clue and everyone's latest clue shows.
    st = imposterEngine.apply(st, speaker, { kind: 'clue', text: 'smoky' }) as ImposterState;
    expect(latestClues(view(me, st)).get(speaker)).toBe('smoky');
    expect(suspects(view(me, st), me)).not.toContain(me);
    expect(notVoted(view(me, st))).toHaveLength(5);
  });

  it('plays to the end and summarises it', () => {
    const { s, view } = imposterViews(4);
    // Everyone ready, every clue, then everyone votes for the imposter.
    let st = s;
    for (const p of s.players) st = imposterEngine.apply(st, p, { kind: 'ready' }) as ImposterState;
    while (st.phase === 'clue') {
      const sp = view('u1', st).speaker!;
      st = imposterEngine.apply(st, sp, { kind: 'clue', text: 'hint' }) as ImposterState;
    }
    expect(st.phase).toBe('vote');
    const imp = s.imposters[0]!;
    for (const p of s.players) {
      const target = p === imp ? s.players.find((x) => x !== imp)! : imp;
      st = imposterEngine.apply(st, p, { kind: 'vote', targets: [target] }) as ImposterState;
    }
    expect(st.phase).toBe('guess');
    const guessStage = imposterStage(view(imp, st), imp, nameOf);
    expect(guessStage.action).toBe('guess');
    const crewId = s.players.find((x) => x !== imp)!;
    expect(imposterStage(view(crewId, st), crewId, nameOf).action).toBeNull();
    st = imposterEngine.apply(st, imp, { kind: 'guess', text: 'wrong word' }) as ImposterState;
    expect(st.phase).toBe('over');
    const v = view(crewId, st);
    const sum = endSummary(v, nameOf);
    expect(sum.winnerLine).toMatch(/crew found/);
    expect(sum.word).toBe(s.word);
    expect(sum.guesses[0]).toMatch(/wrong word/);
    expect(sum.tally[0]).toMatch(/3 votes/);
    expect(imposterStage(v, crewId, nameOf).tone).toBe('good');
    expect(imposterStage(view(imp, st), imp, nameOf).tone).toBe('danger');
  });
});

// ---- Werewolf -------------------------------------------------------------------------------------------

function wolfViews(n = 7) {
  const s = werewolfEngine.init(P(n), 21n, {}) as WerewolfState;
  const view = (who: string, st: WerewolfState = s) =>
    parseWerewolfView(werewolfEngine.view(st, who)) as WerewolfView;
  const by = (role: string) => s.players.find((p) => s.roles[p] === role)!;
  return { s, view, by };
}

describe('Werewolf', () => {
  it('gives each role its own night job and targets', () => {
    const { s, view, by } = wolfViews();
    const wolf = by('werewolf');
    const seer = by('seer');
    const doc = by('doctor');
    const villager = by('villager');
    const w = nightAction(view(wolf), wolf)!;
    expect(w.kind).toBe('kill');
    for (const t of w.targets) expect(s.roles[t]).not.toBe('werewolf');
    expect(nightAction(view(seer), seer)?.kind).toBe('inspect');
    expect(nightAction(view(seer), seer)?.targets).not.toContain(seer);
    const d = nightAction(view(doc), doc)!;
    expect(d.kind).toBe('protect');
    expect(d.targets).toContain(doc); // the doctor may protect themselves
    expect(nightAction(view(villager), villager)).toBeNull();
  });

  it('plays a night and a day, and tells it as a story', () => {
    const { s, view, by } = wolfViews();
    const wolf = by('werewolf');
    const seer = by('seer');
    const doc = by('doctor');
    const victim = s.players.find((p) => s.roles[p] === 'villager')!;
    let st = s;
    for (const w of s.players.filter((p) => s.roles[p] === 'werewolf'))
      st = werewolfEngine.apply(st, w, { kind: 'kill', target: victim }) as WerewolfState;
    // The pack sees what it chose.
    expect(packVotes(view(wolf, st)).get(victim)?.length).toBeGreaterThan(0);
    expect(nightAction(view(wolf, st), wolf)?.done).toBe(true);
    st = werewolfEngine.apply(st, seer, { kind: 'inspect', target: wolf }) as WerewolfState;
    expect(seerFindings(view(seer, st), nameOf)[0]).toMatch(/is a werewolf/);
    st = werewolfEngine.apply(st, doc, { kind: 'protect', target: doc }) as WerewolfState;
    expect(st.phase).toBe('day');
    const day = view(by('villager') === victim ? doc : by('villager'), st);
    expect(day.phase).toBe('day');
    expect(lastNightLine(day, nameOf)).toMatch(/killed in the night \(villager\)/);
    expect(logLines(day.log, nameOf)[0]).toMatch(/^Night 1: .* was killed\. Role: villager\.$/);
    expect(isAlive(day, victim)).toBe(false);
    // The dead see every role.
    expect(Object.keys(view(victim, st).roles ?? {})).toHaveLength(7);
    expect(werewolfStage(view(victim, st), victim).action).toBeNull();
    // Day: anyone alive can say they are ready; then the vote.
    const alive = day.alive;
    expect(werewolfStage(day, alive[0]!).action).toBe('ready');
    for (const p of alive) st = werewolfEngine.apply(st, p, { kind: 'ready' }) as WerewolfState;
    expect(st.phase).toBe('vote');
    const voteView = view(alive[0]!, st);
    expect(werewolfStage(voteView, alive[0]!).action).toBe('vote');
    st = werewolfEngine.apply(st, alive[0]!, { kind: 'vote', target: null }) as WerewolfState;
    expect(werewolfStage(view(alive[0]!, st), alive[0]!).action).toBeNull();
  });

  it('describes the table and who won', () => {
    const { s, view, by } = wolfViews();
    expect(compositionLine(view(by('villager')))).toMatch(/werewol/);
    const over = { ...s, phase: 'over' as const, winner: 'villagers' as const };
    const wolf = by('werewolf');
    const v = view(by('villager'), over);
    expect(iWon(v)).toBe(true);
    expect(iWon(view(wolf, over))).toBe(false);
    expect(iWon(view(wolf, { ...over, winner: 'draw' }))).toBeNull();
    expect(werewolfStage(v, by('villager')).sub).toMatch(/village wins/);
  });

  it('does not run on without a clock: a night with nobody to act has no button', () => {
    const { view, by } = wolfViews();
    const v = by('villager');
    expect(werewolfStage(view(v), v).action).toBeNull();
    void ROOM_ACTOR;
  });
});

// ---- Charades -------------------------------------------------------------------------------------------

function charadesViews(n: number, mode: 'act' | 'headsup') {
  const s = charadesEngine.init(P(n), 31n, { mode }) as CharadesState;
  const view = (who: string, st: CharadesState = s) =>
    parseCharadesView(charadesEngine.view(st, who)) as CharadesView;
  return { s, view };
}

describe('Charades', () => {
  it('gives the actor "Start" and everyone else the wait', () => {
    const { s, view } = charadesViews(4, 'act');
    const actor = s.schedule[0]!;
    const other = s.players.find((p) => p !== actor)!;
    expect(charadesStage(view(actor), actor, nameOf).action).toBe('start');
    expect(charadesStage(view(other), other, nameOf).action).toBeNull();
    expect(charadesStage(view(other), other, nameOf).headline).toMatch(/up next/);
  });

  it('shows the card to the actor in act mode and to everyone else in heads-up', () => {
    for (const mode of ['act', 'headsup'] as const) {
      const { s, view } = charadesViews(4, mode);
      const actor = s.schedule[0]!;
      const other = s.players.find((p) => p !== actor)!;
      const st = charadesEngine.apply(s, actor, { kind: 'start' }) as CharadesState;
      const a = view(actor, st);
      const o = view(other, st);
      expect(a.phase).toBe('acting');
      expect(a.word !== null).toBe(mode === 'act');
      expect(o.word !== null).toBe(mode === 'headsup');
      expect(charadesStage(a, actor, nameOf).action).toBe('card');
    }
  });

  it('asks who guessed only when playing alone in act mode', () => {
    const solo = charadesViews(3, 'act');
    expect(needsGuesser(solo.view('u1'))).toBe(true);
    expect(guesserChoices(solo.view('u1'), 'u1')).toEqual(['u2', 'u3']);
    expect(needsGuesser(charadesViews(3, 'headsup').view('u1'))).toBe(false);
    expect(needsGuesser(charadesViews(4, 'act').view('u1'))).toBe(false);
  });

  it('scores teams and names a winner or a draw', () => {
    const { s, view } = charadesViews(4, 'act');
    const actor = s.schedule[0]!;
    let st = charadesEngine.apply(s, actor, { kind: 'start' }) as CharadesState;
    st = charadesEngine.apply(st, actor, { kind: 'got_it' }) as CharadesState;
    const v = view(actor, st);
    const rows = scoreRows(v, actor, nameOf);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.mine)).toHaveLength(1);
    expect(rows.find((r) => r.acting)?.score).toBe(1);
    expect(winnerText(v, nameOf)).toMatch(/wins/);
    expect(winnerText(view(actor), nameOf)).toBe('It is a draw.');
    expect(lastEventLine(v, nameOf, actor)).toMatch(/got it/);
  });
});

describe('tilt', () => {
  const run = (zs: number[], flip = false, stepMs = 100) => {
    let state = newTilt();
    const events: string[] = [];
    zs.forEach((z, i) => {
      const r = stepTilt(state, z, i * stepMs, flip);
      state = r.state;
      if (r.event) events.push(r.event);
    });
    return events;
  };

  it('answers once per tilt: down is got it, up is skip', () => {
    expect(run([0, 0, 0.9, 0.95, 0.9, 0.9, 0, 0, 0])).toEqual(['got_it']);
    expect(run([0, 0, -0.9, -0.95, -0.9, 0, 0])).toEqual(['skip']);
  });

  it('does nothing until the phone has been upright, and then needs it upright again', () => {
    expect(run([0.95, 0.95, 0.95, 0.95])).toEqual([]);
    expect(run([0, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95])).toEqual([
      'got_it',
    ]);
    expect(run([0, 0, 0.95, 0.95, 0, 0, 0, 0.95, 0.95, 0], false, TILT_COOLDOWN_MS)).toEqual([
      'got_it',
      'got_it',
    ]);
  });

  it('can be flipped for a phone that reads the other way, and ignores noise', () => {
    expect(run([0, 0, -0.9, -0.95, -0.9], true)).toEqual(['got_it']);
    expect(run([0, 0.2, -0.2, 0.3, -0.3, 0.2])).toEqual([]);
  });
});
