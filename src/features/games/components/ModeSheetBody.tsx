import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { formatNaira, type GameInfo } from '@dyce/shared';
import { ModeBadge, Text, TokenButton, useTheme } from '@dyce/ui';
import { UserAvatar } from '@/features/avatar/UserAvatar';
import { ApiError } from '@/features/auth/api-client';
import { authErrorMessage } from '@/features/auth/messages';
import { newMessageId } from '@/features/chat/chat-logic';
import { useClaimTopup, useWalletQuery } from '@/features/wallet/use-wallet';
import { gameMeta } from '../games-logic';
import {
  dailyLimitHit,
  defaultStake,
  poolIssueOf,
  potOf,
  resetsIn,
  stakeChipLabel,
  stakeChoices,
} from '../pool-logic';
import { useCreateMatch, usePoolInfoQuery } from '../use-games';
import { AgeGatePanel } from './AgeGatePanel';
import { GameArt } from './GameArt';
import { PoolIssuePanel } from './PoolIssuePanel';
import { RulesSheet } from './RulesSheet';

type Peer = {
  displayName?: string;
  username?: string;
  avatar?: Parameters<typeof UserAvatar>[0]['avatar'];
};

type Step = 'choose' | 'age' | 'issue';

/**
 * Free or Pool for the game you picked (design: ModeSheet). Pool shows the stake chips, the pot, whether the
 * other person may counter, and "Lock ₦1,000 & send". The first time someone picks Pool they answer the age gate
 * (AgeGate); a stake that can't be covered, or would go over today's limit, says so in plain words (PoolIssues).
 * The server decides all of it: this only asks.
 */
export function ModeSheetBody({
  game,
  conversationId,
  peer,
  name,
  onSent,
  onBack,
  initialMode = 'free',
}: {
  game: GameInfo;
  conversationId: string | undefined;
  peer: Peer | undefined;
  name: string;
  onSent: () => void;
  onBack: () => void;
  /** Which mode is selected when the sheet opens (the game detail's "Start a pool" button). */
  initialMode?: 'free' | 'pool';
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const info = usePoolInfoQuery(game.supportsPool);
  const wallet = useWalletQuery();
  const topup = useClaimTopup();
  const create = useCreateMatch();
  const [mode, setMode] = useState<'free' | 'pool'>(
    initialMode === 'pool' && game.supportsPool ? 'pool' : 'free',
  );
  const [step, setStep] = useState<Step>('choose');
  const choices = stakeChoices(info.data, game.poolMinKobo);
  const [showRules, setShowRules] = useState(false);
  const [stake, setStake] = useState(() => defaultStake(choices));
  const [allowCounter, setAllowCounter] = useState(true);
  // One id per attempt: tapping Send again after a network failure sends the same game, not a second one.
  const attempt = useRef<{ key: string; id: string } | null>(null);

  const pool = mode === 'pool';
  const minor = info.data ? !info.data.isAdult && info.data.ageAnswered : false;
  const limitHit = pool && info.data ? dailyLimitHit(info.data, stake) : null;
  const balance = wallet.data?.balanceKobo ?? null;

  function pickPool() {
    if (!game.supportsPool || minor) return;
    if (info.data && !info.data.isAdult) {
      setStep('age'); // asked once; a "no" keeps Pool hidden
      return;
    }
    setMode('pool');
  }

  function send() {
    if (!conversationId) return;
    const key = `${conversationId}:${game.slug}:${mode}:${stake}:${allowCounter}`;
    if (attempt.current?.key !== key) attempt.current = { key, id: newMessageId() };
    create.mutate(
      {
        id: attempt.current.id,
        conversationId,
        gameSlug: game.slug,
        mode,
        stakeKobo: pool ? stake : 0,
        allowCounter: pool ? allowCounter : false,
      },
      {
        onSuccess: () => {
          attempt.current = null;
          onSent();
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : undefined;
          if (code === 'adult_required') setStep('age');
          else if (poolIssueOf(code)) setStep('issue');
        },
      },
    );
  }

  const header = (
    <View style={styles.pickedHead}>
      <GameArt slug={game.slug} dice={20} style={styles.pickedArt} />
      <View style={styles.flex}>
        <Text variant="headline" accessibilityRole="header">
          {game.name} vs {name}
        </Text>
        <Text variant="footnote" color="sub">
          {gameMeta(game)}
        </Text>
      </View>
      <UserAvatar avatar={peer?.avatar} name={name} size={40} />
    </View>
  );

  // ---- age gate -------------------------------------------------------------------------------
  if (step === 'age') {
    return (
      <AgeGatePanel
        onAdult={() => {
          setStep('choose');
          setMode('pool');
        }}
        onFree={() => {
          setStep('choose');
          setMode('free');
        }}
      />
    );
  }

  // ---- "can't stake that" ---------------------------------------------------------------------
  if (step === 'issue') {
    const code = create.error instanceof ApiError ? create.error.code : undefined;
    const kind = poolIssueOf(code);
    const free = () => {
      setMode('free');
      setStep('choose');
      create.reset();
    };
    const back = () => {
      setStep('choose');
      create.reset();
    };
    if (kind === 'limit' && info.data) {
      const d = info.data;
      return (
        <PoolIssuePanel
          glyph="!"
          title={
            code === 'over_pool_games_limit'
              ? 'Daily pool games reached'
              : 'Daily pool limit reached'
          }
          sub={
            code === 'over_pool_games_limit'
              ? `You can play ${d.dailyGamesLimit} pool games a day. Resets at midnight.`
              : `You can stake ${formatNaira(d.dailyStakeLimitKobo)} a day. Resets at midnight.`
          }
          left={{ label: 'Staked today', value: formatNaira(d.stakedTodayKobo) }}
          right={{ label: 'Resets in', value: resetsIn(d.resetsInSeconds) }}
          fill={d.dailyStakeLimitKobo ? d.stakedTodayKobo / d.dailyStakeLimitKobo : 1}
          options={[
            {
              title: 'Play this one free',
              sub: 'No cash moves, still earns XP',
              tone: 'free',
              onPress: free,
            },
            { title: 'Back', sub: 'Pick a smaller stake', tone: 'quiet', onPress: back },
          ]}
          foot="Pool limits keep play fun. They reset every day at midnight."
        />
      );
    }
    const canTopup = !!wallet.data?.topup.available && !topup.isSuccess;
    return (
      <PoolIssuePanel
        glyph="₦"
        title="Not enough Dyce Cash"
        sub={`A ${formatNaira(stake)} stake needs ${formatNaira(stake)} from you`}
        left={{ label: 'Your balance', value: formatNaira(balance ?? 0) }}
        right={{ label: 'Needed', value: formatNaira(stake) }}
        fill={stake ? (balance ?? 0) / stake : 0}
        options={[
          ...(canTopup
            ? [
                {
                  title: 'Claim daily top-up',
                  sub: `+${formatNaira(wallet.data?.topup.amountKobo ?? 0)} now`,
                  tone: 'primary' as const,
                  busy: topup.isPending,
                  onPress: () => topup.mutate(),
                },
              ]
            : []),
          {
            title: 'Pick a smaller stake',
            sub: 'Choose an amount you have',
            tone: 'quiet',
            onPress: back,
          },
          {
            title: 'Play this one free',
            sub: 'No cash moves, still earns XP',
            tone: 'free',
            onPress: free,
          },
        ]}
        foot="Dyce Cash can’t be bought. It only comes from wins, friends and the daily top-up."
      />
    );
  }

  // ---- the mode sheet -------------------------------------------------------------------------
  return (
    <>
      {header}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showRules }}
        accessibilityLabel={showRules ? 'Hide how to play' : 'Show how to play'}
        onPress={() => setShowRules((v) => !v)}
        style={styles.rulesToggle}
      >
        <Text variant="footnote" color="accent">
          {showRules ? 'Hide how to play' : 'How to play'}
        </Text>
      </Pressable>
      {showRules ? (
        <RulesSheet slug={game.slug} poolMinKobo={game.poolMinKobo} showPool={game.supportsPool} />
      ) : null}
      {game.supportsPool ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="How Pool works"
          onPress={() => router.push('/pool-rules' as Href)}
          style={styles.rulesToggle}
        >
          <Text variant="footnote" color="accent">
            How Pool works
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="Game mode">
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: !pool }}
          accessibilityLabel="Free. Bragging rights, XP and streaks. Your cash never moves."
          onPress={() => setMode('free')}
          style={[
            styles.mode,
            { backgroundColor: colors.bg2, borderColor: pool ? 'transparent' : colors.money },
          ]}
        >
          <View>
            <ModeBadge kind="FREE" />
          </View>
          <Text variant="headline">Free</Text>
          <Text variant="footnote" color="sub">
            Bragging rights, XP and streaks. Your cash never moves.
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: pool, disabled: !game.supportsPool || minor }}
          accessibilityLabel={
            !game.supportsPool
              ? 'Pool. Not available for this game yet.'
              : minor
                ? 'Pool. For people 18 and older.'
                : 'Pool. You both put in the same stake. Winner takes the pot.'
          }
          disabled={!game.supportsPool || minor}
          onPress={pickPool}
          style={[
            styles.mode,
            !game.supportsPool || minor ? styles.dim : null,
            { backgroundColor: colors.bg2, borderColor: pool ? '#C93E1C' : 'transparent' },
          ]}
        >
          <View>
            <ModeBadge kind="POOL" />
          </View>
          <Text variant="headline">Pool</Text>
          <Text variant="footnote" color="sub">
            {!game.supportsPool
              ? 'Not for this game yet'
              : minor
                ? 'For people 18 and older'
                : 'You both put in the same stake. Winner takes the pot.'}
          </Text>
        </Pressable>
      </View>

      {pool ? (
        <View style={styles.pool}>
          <Text variant="footnote" color="sub">
            Your stake
          </Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Your stake">
            {choices.map((s) => {
              const on = s === stake;
              return (
                <Pressable
                  key={s}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${formatNaira(s)} each`}
                  onPress={() => setStake(s)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? colors.brandSoft : colors.chip,
                      borderColor: on ? '#C93E1C' : 'transparent',
                    },
                  ]}
                >
                  <Text variant="callout" color={on ? 'accent' : 'text'}>
                    {stakeChipLabel(s)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={[styles.pot, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessible
            accessibilityLabel={`Pot ${formatNaira(potOf(stake))}, locked until the game ends. You put in ${formatNaira(stake)}.`}
          >
            <View>
              <Text variant="footnote" color="sub">
                Pot
              </Text>
              <Text variant="title">{formatNaira(potOf(stake))}</Text>
            </View>
            <Text variant="footnote" color="sub" style={styles.potNote}>
              {`${formatNaira(stake)} from you, ${formatNaira(stake)} from ${name}. Locked until the game ends.`}
            </Text>
          </View>

          <View style={styles.toggle}>
            <View style={styles.flex}>
              <Text variant="callout">Allow counter-offers</Text>
              <Text variant="footnote" color="sub">
                {name} can suggest a lower stake or play free
              </Text>
            </View>
            <Switch
              value={allowCounter}
              onValueChange={setAllowCounter}
              accessibilityLabel="Allow counter-offers"
              trackColor={{ true: '#2BB673', false: colors.line }}
            />
          </View>
          {balance !== null ? (
            <Text variant="footnote" color="sub">
              {`Your balance ${formatNaira(balance, { compact: true })} · virtual cash, can't be withdrawn`}
            </Text>
          ) : null}
          {limitHit ? (
            <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
              {limitHit === 'games'
                ? "You've reached today's pool games. You can still play this one free."
                : `That would go over today's pool limit. ${resetsIn(info.data?.resetsInSeconds ?? 0)} until it resets.`}
            </Text>
          ) : null}
        </View>
      ) : null}

      <TokenButton
        label={
          create.isPending
            ? pool
              ? 'Locking…'
              : 'Sending…'
            : pool
              ? `Lock ${formatNaira(stake)} & send`
              : `Send ${game.name}`
        }
        accessibilityLabel={
          pool
            ? `Lock ${formatNaira(stake)} and send ${game.name} to ${name}`
            : `Send ${game.name} to ${name}`
        }
        tone={pool ? 'ember' : 'felt'}
        disabled={create.isPending || !conversationId || (pool && limitHit !== null)}
        onPress={send}
      />
      <TokenButton label="Back to games" tone="chip" onPress={onBack} />
      {create.isError && step === 'choose' ? (
        <Text variant="footnote" color="accent" accessibilityLiveRegion="polite">
          {authErrorMessage(create.error)}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pickedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  pickedArt: { width: 52, height: 52, borderRadius: 14 },
  rulesToggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  modes: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  mode: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2.5,
    padding: 14,
    gap: 6,
    alignItems: 'flex-start',
  },
  dim: { opacity: 0.6 },
  pool: { gap: 10, paddingBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  potNote: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
});
