import {
  charadesEngine,
  doodleGuessEngine,
  imposterEngine,
  werewolfEngine,
  type CharadesState,
  type DoodleState,
  type ImposterState,
  type WerewolfState,
} from '@dyce/games';
import { parseCharadesView, parseDoodleView, parseImposterView, parseWerewolfView } from './views';

const P = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);

describe('view parsers accept what the real engines send each seat', () => {
  it('Imposter, for a crew player and an imposter, in every phase', () => {
    const s: ImposterState = imposterEngine.init(P(5), 865n, {}) as ImposterState;
    const crew = s.players.find((p) => !s.imposters.includes(p))!;
    const imp = s.imposters[0]!;
    const vCrew = parseImposterView(imperView(s, crew));
    const vImp = parseImposterView(imperView(s, imp));
    expect(vCrew?.role).toBe('crew');
    expect(vCrew?.word).toBe(s.word);
    expect(vImp?.role).toBe('imposter');
    expect(vImp?.word).toBeNull();
    for (const phase of ['reveal', 'clue', 'vote', 'guess', 'over'] as const) {
      expect(parseImposterView(imperView({ ...s, phase }, crew))?.phase).toBe(phase);
    }
  });

  it('Werewolf, for a wolf, the seer, the doctor and a villager', () => {
    const s = werewolfEngine.init(P(7), 510n, {}) as WerewolfState;
    for (const p of s.players) {
      const v = parseWerewolfView(werewolfEngine.view(s, p));
      expect(v).not.toBeNull();
      expect(v?.role).toBe(s.roles[p]);
      // Only the pack knows who the wolves are.
      expect(v?.wolves !== undefined).toBe(s.roles[p] === 'werewolf');
      expect(v?.roles).toBeUndefined();
    }
  });

  it('Charades, in act and heads-up mode', () => {
    const act = charadesEngine.init(P(4), 407n, { mode: 'act' }) as CharadesState;
    const v = parseCharadesView(charadesEngine.view(act, act.players[0]!));
    expect(v?.phase).toBe('ready');
    expect(v?.teams.length).toBe(2);
    const solo = charadesEngine.init(P(3), 546n, {}) as CharadesState;
    expect(parseCharadesView(charadesEngine.view(solo, 'u1'))?.solo).toBe(true);
  });

  it('Doodle Guess, with the strokes split out of the view', () => {
    const s = doodleGuessEngine.init(P(3), 731n, {}) as DoodleState;
    const view = doodleGuessEngine.view(s, 'u1') as Record<string, unknown>;
    // The room sends `strokeCount` instead of `strokes`.
    const { strokes, ...rest } = view;
    void strokes;
    const v = parseDoodleView({ ...rest, strokeCount: 0 });
    expect(v?.phase).toBe('choose');
    expect(v?.mask).toBeNull();
    expect(v?.strokeCount).toBe(0);
  });
});

describe('view parsers refuse what is not their game', () => {
  it('returns null instead of throwing', () => {
    expect(parseImposterView(null)).toBeNull();
    expect(parseImposterView({})).toBeNull();
    expect(parseWerewolfView({ phase: 'dancing' })).toBeNull();
    expect(parseCharadesView('nope')).toBeNull();
    expect(parseDoodleView({ phase: 'draw' })).toBeNull();
    // A Werewolf view is not an Imposter view.
    const s = werewolfEngine.init(P(5), 950n, {}) as WerewolfState;
    expect(parseImposterView(werewolfEngine.view(s, 'u1'))).toBeNull();
  });
});

function imperView(s: ImposterState, who: string): unknown {
  return imposterEngine.view(s, who);
}
