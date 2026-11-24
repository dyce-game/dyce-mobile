import { consentAllowed, parseStoredConsent } from './privacy-consent-logic';

describe('privacy consent (Apple 5.1.1(ii))', () => {
  it('reads only the two stored values', () => {
    expect(parseStoredConsent('granted')).toBe('granted');
    expect(parseStoredConsent('denied')).toBe('denied');
    expect(parseStoredConsent('yes')).toBeNull();
    expect(parseStoredConsent(null)).toBeNull();
    expect(parseStoredConsent(undefined)).toBeNull();
  });

  it('is off in a store build until the person agrees', () => {
    expect(consentAllowed(null, 'production')).toBe(false);
    expect(consentAllowed('denied', 'production')).toBe(false);
    expect(consentAllowed('granted', 'production')).toBe(true);
  });

  it('is on by default in beta and development builds, and a "no" is respected', () => {
    expect(consentAllowed(null, 'preview')).toBe(true);
    expect(consentAllowed(null, 'development')).toBe(true);
    expect(consentAllowed('denied', 'preview')).toBe(false);
  });
});
