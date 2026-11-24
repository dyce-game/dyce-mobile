/**
 * Terms, privacy notice, community guidelines and responsible play, as DRAFT copy.
 *
 * !! Not legal advice and not reviewed. SPEC section 14 makes legal review a human gate: Pool is simulated gaming
 * (Dyce Cash is virtual, cannot be bought or withdrawn) and Nigerian gaming rules are set at state level; the
 * NDPA 2023 needs a lawful basis and a privacy notice. Every screen that shows this copy carries the DRAFT banner
 * (`LEGAL_DRAFT_NOTICE`). The gap is listed in docs/BACKLOG.md. Replace this file with the reviewed text, or load
 * the reviewed documents from the web (https://dyce.games/terms), and delete the banner.
 */
export const LEGAL_DRAFT_NOTICE =
  'DRAFT. This text has not been reviewed by a lawyer and is not final. It will be replaced before Dyce launches.';

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDoc = { id: LegalDocId; title: string; summary: string; sections: LegalSection[] };
export type LegalDocId = 'terms' | 'privacy' | 'community' | 'responsible';

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: {
    id: 'terms',
    title: 'Terms of use',
    summary: 'The rules for using Dyce.',
    sections: [
      {
        heading: 'What Dyce is',
        paragraphs: [
          'Dyce is a messaging app where you play games with friends, family and other players. Some games can be played in Pool mode, where players stake Dyce Cash.',
        ],
      },
      {
        heading: 'Dyce Cash is virtual',
        paragraphs: [
          'Dyce Cash is play money. It has no real-world value. It cannot be bought, sold, withdrawn, traded for money or transferred outside Dyce.',
          'Every account starts with a fixed amount of Dyce Cash and may receive a small daily top-up when the balance is low. We may change these amounts.',
        ],
      },
      {
        heading: 'Who can use Dyce',
        paragraphs: [
          'You need a phone number to sign up. You must be at least 18 to play Pool. Younger players can play Free games only.',
          'You are responsible for what happens on your account. Keep your phone secure.',
        ],
      },
      {
        heading: 'Fair play',
        paragraphs: [
          'Do not cheat, use bots or scripts, work together to move Dyce Cash between accounts, or use more than one account to gain an advantage. The server decides every game result.',
          'If you think a Pool result is wrong, you can dispute it within 24 hours of the result. A person reviews it and may correct it.',
        ],
      },
      {
        heading: 'Ending your account',
        paragraphs: [
          'You can delete your account in Settings. Your Dyce Cash is cleared and nothing is paid out because it has no cash value. We may suspend or end accounts that break these terms.',
        ],
      },
      {
        heading: 'Changes and contact',
        paragraphs: [
          'We may update these terms and will tell you in the app when we do. Contact details will be added here before launch.',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy notice',
    summary: 'What we keep about you and why.',
    sections: [
      {
        heading: 'What we collect',
        paragraphs: [
          'Your phone number (kept only as a protected hash), username, display name, avatar, the games you play and their results, your Dyce Cash history, your messages and the people you connect with.',
          'If you allow contacts, phone numbers in your address book are sent securely to Dyce to find friends. We do not store the numbers of people who are not on Dyce.',
          'If you opt in to Near you, we use your city only, never your exact location.',
        ],
      },
      {
        heading: 'Why we use it',
        paragraphs: [
          'To run the app: sign you in, deliver messages, play games, keep results fair, prevent abuse and send the notifications you ask for. We rely on your agreement to our terms and on our legitimate interest in keeping Dyce safe.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'Under the Nigeria Data Protection Act 2023 you can see, correct, download and delete your data. In Settings, Download my data gives you a copy and Delete account starts erasure.',
          'When you delete, your profile, friends, stats and balance are erased. Games you played stay in other players’ history without your name, and friends keep their own copies of messages you sent them.',
        ],
      },
      {
        heading: 'Who sees it',
        paragraphs: [
          'Other players see your username, avatar, level and what you choose to share. We do not sell your data. Service providers who send SMS or push notifications for us only receive what they need to do that.',
        ],
      },
    ],
  },
  community: {
    id: 'community',
    title: 'Community guidelines',
    summary: 'How we treat each other.',
    sections: [
      {
        heading: 'Be a good opponent',
        paragraphs: [
          'Play fair. Win and lose kindly. Do not harass, threaten or insult anyone, and do not send hateful or sexual content.',
        ],
      },
      {
        heading: 'Keep it real',
        paragraphs: [
          'Do not pretend to be someone else. Do not ask other players for real money, bank details or one-time codes. Dyce never asks for them.',
        ],
      },
      {
        heading: 'No spam',
        paragraphs: [
          'Do not send games or requests to people over and over. Strangers’ invites go to Requests, and spammers are filtered out.',
        ],
      },
      {
        heading: 'If something goes wrong',
        paragraphs: [
          'Block anyone you do not want to hear from. Report cheating, abuse, scams or offensive names from their profile or from the game menu. A person reads every report, and the person you report is never told who reported them.',
        ],
      },
    ],
  },
  responsible: {
    id: 'responsible',
    title: 'Responsible play',
    summary: 'Keeping Pool fun.',
    sections: [
      {
        heading: 'It is play money',
        paragraphs: [
          'Dyce Cash cannot be bought or cashed out, so you cannot lose real money on Dyce. Pool is a way to add stakes to games with friends.',
        ],
      },
      {
        heading: 'Limits that protect you',
        paragraphs: [
          'Pool stakes run from Ð100 to Ð20,000, with a daily cap on games and on the total you stake. You can lower your own limits. Pool is only for people who confirm they are 18 or older.',
        ],
      },
      {
        heading: 'Take a break',
        paragraphs: [
          'If games stop being fun, stop. Free games are always open. You can mute notifications in Settings and you can delete your account at any time.',
        ],
      },
    ],
  },
};

export const LEGAL_ORDER: LegalDocId[] = ['terms', 'privacy', 'community', 'responsible'];

export function isLegalDocId(v: unknown): v is LegalDocId {
  return typeof v === 'string' && v in LEGAL_DOCS;
}

/** Help topics and their answers (SPEC sections 8, 9, 12, 13). The words match the rules the server enforces. */
export type HelpTopicId = 'pools' | 'spaces' | 'account' | 'safety';
export type HelpTopic = { id: HelpTopicId; mark: string; title: string };
export type HelpItem = { topic: HelpTopicId; q: string; a: string };

export const HELP_TOPICS: HelpTopic[] = [
  { id: 'pools', mark: 'Ð', title: 'Pools and refunds' },
  { id: 'spaces', mark: '4+', title: 'Spaces' },
  { id: 'account', mark: '@', title: 'Account' },
  { id: 'safety', mark: '!', title: 'Safety' },
];

export const HELP_ITEMS: HelpItem[] = [
  {
    topic: 'pools',
    q: 'Where did my pool stake go?',
    a: 'It is locked in the pot until the game ends. If the other player does not answer in 24 hours, it comes back to you automatically.',
  },
  {
    topic: 'pools',
    q: 'Can I withdraw Dyce Cash?',
    a: 'No. Dyce Cash is virtual and only for play. It cannot be bought, sold or cashed out.',
  },
  {
    topic: 'pools',
    q: 'What does resigning cost?',
    a: 'In Pool you lose your stake and the other player takes the pot. In a Free game nobody’s cash moves. You can resign from the game menu.',
  },
  {
    topic: 'pools',
    q: 'I think a Pool result is wrong',
    a: 'Open the result and tap Dispute within 24 hours. A person reviews the game. If it was wrong the result is corrected, and you can follow the status in the same place.',
  },
  {
    topic: 'spaces',
    q: 'I lost connection in a Space. Did I forfeit?',
    a: 'The table keeps your seat for 60 seconds while you reconnect. After that your seat forfeits. In turn-by-turn games with a friend nothing happens while you are offline.',
  },
  {
    topic: 'spaces',
    q: 'The host left the Space',
    a: 'If the game has not started, the longest-seated player becomes host. If nobody is left, the Space closes and every seat fee is refunded.',
  },
  {
    topic: 'spaces',
    q: 'Why was I removed from a Space?',
    a: 'Only the host can remove people, before the game starts. Your seat fee is refunded and you cannot rejoin that Space.',
  },
  {
    topic: 'account',
    q: 'How do I get a copy of my data?',
    a: 'Settings › Account › Download my data saves everything Dyce holds about you as one file.',
  },
  {
    topic: 'account',
    q: 'How do I delete my account?',
    a: 'Settings › Account › Delete account. You have 30 days to change your mind: sign in again and it is cancelled. After that your balance is cleared and your games are anonymised.',
  },
  {
    topic: 'safety',
    q: 'Someone cheated or is bothering me',
    a: 'Report them from their profile or the game menu, and block them if you like. They are never told who reported them.',
  },
  {
    topic: 'safety',
    q: 'Someone asked me for real money',
    a: 'Do not send it. Dyce Cash has no cash value and Dyce never asks for bank details or codes. Report them as a scam.',
  },
];

export function helpItemsFor(topic: HelpTopicId | null): HelpItem[] {
  return topic ? HELP_ITEMS.filter((i) => i.topic === topic) : HELP_ITEMS;
}
