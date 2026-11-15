import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/mobile';

/**
 * Normalise user input to E.164 (e.g. "0803 123 4567" + "NG" -> "+2348031234567").
 * Returns null when the input is not a valid number. The server is authoritative; the app uses the
 * same function so what the user sees matches what is hashed.
 */
export function normalizePhone(input: string, defaultCountry?: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return null;
  const country = defaultCountry?.toUpperCase() as CountryCode | undefined;
  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}

/**
 * ISO country of an E.164 number ("+2348031234567" -> "NG"). Used to read the *national-format* numbers in
 * a user's address book ("0803...") with the country they actually live in, which is more reliable than
 * the device's language/region setting.
 */
export function regionOf(e164: string): string | undefined {
  return parsePhoneNumberFromString(e164)?.country;
}

/** "+2348031234567" -> "+234•••••••4567". For logs and UI only; never reversible. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 4) return '•'.repeat(digits.length);
  const cc = e164.startsWith('+234') ? '+234' : e164.slice(0, 3);
  return `${cc}${'•'.repeat(Math.max(3, digits.length - cc.length + 1 - 4))}${digits.slice(-4)}`;
}

/** Calling-code prefix used to pick an SMS route. */
export function isNigerian(e164: string): boolean {
  return e164.startsWith('+234');
}
