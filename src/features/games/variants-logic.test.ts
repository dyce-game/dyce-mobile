import type { GameInfo } from '@dyce/shared';
import {
  defaultPicks,
  optionsOf,
  pickedLabel,
  poolAllowed,
  requestOptions,
} from './variants-logic';

const ayo: Pick<GameInfo, 'options'> = {
  options: [
    {
      key: 'variant',
      label: 'Rules',
      default: 'ayo',
      choices: [
        { value: 'ayo', label: 'Ayo', pool: true },
        { value: 'kalah', label: 'Mancala (Kalah)', pool: true },
      ],
    },
  ],
};
const darts: Pick<GameInfo, 'options'> = {
  options: [
    {
      key: 'variant',
      label: 'Rules',
      default: '501',
      choices: [
        { value: '501', label: '501', pool: true },
        { value: 'clock', label: 'Around the clock', pool: false },
      ],
    },
  ],
};
const salvo: Pick<GameInfo, 'options'> = {
  options: [
    {
      key: 'salvo',
      label: 'Rules',
      default: false,
      choices: [
        { value: false, label: 'Classic', pool: true },
        { value: true, label: 'Salvo', pool: true },
      ],
    },
  ],
};

describe('variants', () => {
  it('has none for a game with a single rule set', () => {
    expect(optionsOf(undefined)).toEqual([]);
    expect(optionsOf({})).toEqual([]);
    expect(defaultPicks({})).toEqual({});
    expect(requestOptions({}, {})).toBeUndefined();
    expect(poolAllowed({}, {})).toBe(true);
    expect(pickedLabel({}, {})).toBeNull();
  });

  it('starts at the default and sends nothing for it', () => {
    expect(defaultPicks(ayo)).toEqual({ variant: 'ayo' });
    expect(requestOptions(ayo, defaultPicks(ayo))).toBeUndefined();
    expect(pickedLabel(ayo, defaultPicks(ayo))).toBeNull();
  });

  it('sends only what differs, with booleans kept as booleans', () => {
    expect(requestOptions(ayo, { variant: 'kalah' })).toEqual({ variant: 'kalah' });
    expect(requestOptions(salvo, { salvo: true })).toEqual({ salvo: true });
    expect(requestOptions(salvo, { salvo: false })).toBeUndefined();
    expect(pickedLabel(ayo, { variant: 'kalah' })).toBe('Mancala (Kalah)');
    expect(pickedLabel(salvo, { salvo: true })).toBe('Salvo');
  });

  it('knows which variants cannot be played for stakes', () => {
    expect(poolAllowed(darts, { variant: '501' })).toBe(true);
    expect(poolAllowed(darts, { variant: 'clock' })).toBe(false);
    expect(poolAllowed(darts, {})).toBe(true); // nothing picked = the default
    expect(poolAllowed(ayo, { variant: 'kalah' })).toBe(true);
  });
});
