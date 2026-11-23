// A "world" is one seeded set of people (alice, ben, cara, dami, eze, fola ...) for one flow. Each flow gets its
// own, so flows never depend on each other's leftovers and never share a rate-limited phone number.
import { seed } from '../seed/seed.mjs';

/** Seeds a new world. Do this ahead of time: logging a person in through the UI needs 30 s since their seed. */
export const seedWorld = () => seed({ quiet: true });

/** The Maestro env variables for a world (also what the web runner passes to its scripts). */
export function worldEnv(w) {
  const env = {
    API_URL: w.api,
    OTP: w.otp,
    NEW_PHONE_ALLOW: w.newPhones.allow,
    NEW_PHONE_DENY: w.newPhones.deny,
  };
  for (const [k, u] of Object.entries(w.users)) {
    const K = k.toUpperCase();
    Object.assign(env, {
      [`${K}_PHONE`]: u.phone,
      [`${K}_USERNAME`]: u.username,
      [`${K}_NAME`]: u.displayName,
      [`${K}_ID`]: u.userId,
      [`${K}_TOKEN`]: u.token,
    });
  }
  return env;
}

/** The API allows one code per number every 30 s: wait until Alice (the first person seeded) is past that. */
export async function waitForLoginCooldown(w, log = console.log) {
  const wait = 31_000 - (Date.now() - w.users.alice.otpAt);
  if (wait > 0) {
    log(
      `  (waiting ${Math.ceil(wait / 1000)} s: the API allows one login code per number every 30 s)`,
    );
    await new Promise((r) => setTimeout(r, wait));
  }
}
