// Seeds the QA users for the Maestro flows and the route walker into a dev API (OTP_TEST_CODE set).
//
//   node scripts/seed/seed.mjs                # uses the stack from scripts/stack/up.mjs
//   API_URL=http://10.0.2.2:3100 ...          # or point at any dev API
//
// Writes <tmp>/dyce-qa-seed.json (users with tokens, and fresh phone numbers for the onboarding flows) and
// prints it. Re-running is safe: existing users are signed in again, nothing is duplicated. People:
// Usernames carry a per-run suffix (alice.k3f9) and are in the env (ALICE_USERNAME).
//   alice  the person the flows log in as: onboarded, ₦200k, friends with ben and cara
//   ben    alice's friend, the "second phone" that pays alice's QR request and accepts game invites
//   cara   alice's friend, in a group with alice and ben
//   dami   a stranger who has messaged alice: lands in Requests (accept / decline / block / report flows)
//   eze    a second stranger with a message request, for the block and report flow
//   fola   sent alice a friend request (Friends > Requests tab)
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  SEED_FILE,
  befriend,
  makeApi,
  onboard,
  openDirect,
  readStack,
  sendMessage,
} from '../lib/api.mjs';

export async function seed({ quiet = false } = {}) {
  // Every run makes its own people (the API rate-limits OTP requests per number), so runs never collide.
  const run = Date.now().toString(36).slice(-4);
  const BASE = 1_000_000 + Math.floor(Math.random() * 6_000_000);
  const stack = readStack();
  const api = makeApi(stack.api);
  const who = {
    alice: [`alice.${run}`, 'Alice QA'],
    ben: [`ben.${run}`, 'Ben QA'],
    cara: [`cara.${run}`, 'Cara QA'],
    dami: [`dami.${run}`, 'Dami QA'],
    eze: [`eze.${run}`, 'Eze QA'],
    fola: [`fola.${run}`, 'Fola QA'],
  };
  const users = {};
  let k = 1;
  for (const [key, [username, displayName]] of Object.entries(who)) {
    users[key] = await onboard(api, stack.otp, BASE + k++ * 10, { username, displayName });
  }
  const { alice, ben, cara, dami, eze, fola } = users;

  // The two people in the web dev address book (device-contacts.ts) so "Allow contacts" finds two on Dyce.
  // Fixed numbers, so after the first run they exist already and a rate-limited sign-in is ignored.
  for (const [key, phone, username, name] of [
    ['tunde', '0803 555 0777', 'tunde.qa', 'Tunde QA'],
    ['ngozi', '0803 555 0888', 'ngozi.qa', 'Ngozi QA'],
  ]) {
    try {
      users[key] = await onboard(api, stack.otp, 0, { username, displayName: name, phone });
      who[key] = [username, name];
    } catch (e) {
      if (!/rate|429/i.test(String(e))) throw e;
    }
  }

  // Friends are idempotent-ish: a second run gets a 409 which we ignore.
  for (const [a, b] of [
    [alice, ben],
    [alice, cara],
    [ben, cara],
  ]) {
    try {
      await befriend(api, a, b);
    } catch (e) {
      if (!/already|409|friends/i.test(String(e))) throw e;
    }
  }
  // Strangers write first: their chats land in alice's Requests, never in Chat.
  for (const s of [dami, eze]) {
    const conv = await openDirect(api, s, alice).catch(() => null);
    if (conv?.id || conv?.conversation?.id)
      await sendMessage(api, s, conv.id ?? conv.conversation.id, `Hi alice, it's ${s.username}`);
  }
  // A pending friend request from fola.
  await api
    .call('POST', '/friends/requests', {
      token: fola.token,
      ip: fola.ip,
      body: { userId: alice.userId },
    })
    .catch(() => null);
  // A direct chat between alice and ben with one message so the list is not empty.
  const ab = await openDirect(api, alice, ben);
  const abId = ab.id ?? ab.conversation?.id;
  await sendMessage(api, ben, abId, 'Ready when you are');

  // Fresh numbers for the onboarding flows: every run uses new ones (the OTP test code works for any number).
  const stamp = Date.now() % 1_000_000;
  const fresh = (i) => `0803${String(8_000_000 + ((stamp * 10 + i) % 1_000_000)).padStart(7, '0')}`;
  const out = {
    api: stack.api,
    otp: stack.otp,
    webOrigin: stack.webOrigin,
    createdAt: new Date().toISOString(),
    newPhones: { allow: fresh(1), deny: fresh(2) },
    users: Object.fromEntries(
      Object.entries(users).map(([key, u]) => [
        key,
        {
          userId: u.userId,
          username: u.username,
          displayName: who[key][1],
          phone: u.phone,
          token: u.token,
          refreshToken: u.refreshToken,
          otpAt: u.otpAt,
        },
      ]),
    ),
  };
  writeFileSync(SEED_FILE, JSON.stringify(out, null, 2)); // the last world seeded (scripts/e2e/inspect.mjs reads it)
  if (!quiet) {
    console.log(`seeded ${Object.keys(users).length} users -> ${SEED_FILE}`);
    for (const [key, u] of Object.entries(out.users))
      console.log(`  ${key.padEnd(5)} ${u.phone} @${u.username}`);
    console.log('fresh phones for onboarding:', out.newPhones);
  }
  void randomUUID;
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  await seed();
}
