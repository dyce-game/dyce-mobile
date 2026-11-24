import { getLocales } from 'expo-localization';

export type Country = { code: string; dial: string; name: string };

export const COUNTRIES: Country[] = [
  { code: 'NG', dial: '+234', name: 'Nigeria' },
  { code: 'GH', dial: '+233', name: 'Ghana' },
  { code: 'KE', dial: '+254', name: 'Kenya' },
  { code: 'ZA', dial: '+27', name: 'South Africa' },
  { code: 'GB', dial: '+44', name: 'United Kingdom' },
  { code: 'US', dial: '+1', name: 'United States' },
  { code: 'CA', dial: '+1', name: 'Canada' },
  { code: 'AE', dial: '+971', name: 'UAE' },
];

/** Country picker defaults to the device's region, falling back to Nigeria. */
export function defaultCountry(): Country {
  const region = getLocales()[0]?.regionCode?.toUpperCase();
  return COUNTRIES.find((c) => c.code === region) ?? COUNTRIES[0]!;
}

/** "+2348031234567" -> "+234 803 123 4567". */
export function spaced(e164: string): string {
  const m = /^(\+\d{1,3})(\d{3})(\d{3})(\d+)$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}
