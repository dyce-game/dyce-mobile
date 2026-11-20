import { guestSummary, parseInviteLink, phoneFromFragment, splitDial } from './invite-link';

describe('parseInviteLink', () => {
  it('reads the token and the number from a texted link', () => {
    expect(parseInviteLink('https://dyce.games/i/AbC123_-xyZ987QQ#p=2348125590034')).toEqual({
      token: 'AbC123_-xyZ987QQ',
      phone: '+2348125590034',
    });
  });

  it('reads an app link and a bare path, with no number', () => {
    expect(parseInviteLink('dyce://i/AbC123_-xyZ987QQ')).toEqual({
      token: 'AbC123_-xyZ987QQ',
      phone: null,
    });
    expect(parseInviteLink('/i/AbC123_-xyZ987QQ/')).toEqual({
      token: 'AbC123_-xyZ987QQ',
      phone: null,
    });
    expect(parseInviteLink('https://dyce.games/i/AbC123_-xyZ987QQ?utm=x')?.token).toBe(
      'AbC123_-xyZ987QQ',
    );
  });

  it('is not fooled by other links, short tokens or odd characters', () => {
    expect(parseInviteLink('https://dyce.games/r/AbC123xyZ987QQ00')).toBeNull();
    expect(parseInviteLink('https://dyce.games/i/short')).toBeNull();
    expect(parseInviteLink('https://dyce.games/i/has space here')).toBeNull();
    expect(parseInviteLink('https://dyce.games/i/AbC123_-xyZ987QQ/play')).toBeNull();
    expect(parseInviteLink(null)).toBeNull();
    expect(parseInviteLink('')).toBeNull();
  });
});

describe('phoneFromFragment', () => {
  it('accepts digits only, 7 to 15 of them', () => {
    expect(phoneFromFragment('#p=2348125590034')).toBe('+2348125590034');
    expect(phoneFromFragment('p=2348125590034')).toBe('+2348125590034');
    expect(phoneFromFragment('#x=1&p=2348125590034')).toBe('+2348125590034');
    expect(phoneFromFragment('#p=123')).toBeNull();
    expect(phoneFromFragment('#p=23481255900341234')).toBeNull();
    expect(phoneFromFragment('#p=+2348125590034')).toBeNull();
    expect(phoneFromFragment('#p=abc')).toBeNull();
    expect(phoneFromFragment(undefined)).toBeNull();
  });
});

describe('splitDial', () => {
  const dials = ['+234', '+1', '+27', '+44'];
  it('picks the matching dial code and keeps the national part', () => {
    expect(splitDial('+2348125590034', dials)).toEqual({ dial: '+234', national: '8125590034' });
    expect(splitDial('+27821234567', dials)).toEqual({ dial: '+27', national: '821234567' });
  });
  it('prefers the longest match and gives up on an unknown country', () => {
    expect(splitDial('+2348125590034', ['+2', '+234'])).toEqual({
      dial: '+234',
      national: '8125590034',
    });
    expect(splitDial('+999123456789', dials)).toBeNull();
  });
});

describe('guestSummary', () => {
  it('pluralises', () => {
    expect(guestSummary(1, 1)).toBe('1 word · 1 point');
    expect(guestSummary(5, 12)).toBe('5 words · 12 points');
    expect(guestSummary(0, 0)).toBe('0 words · 0 points');
  });
});
