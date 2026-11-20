import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { PUSH_GROUPS, PUSH_GROUP_LABELS, formatMinuteOfDay, type PushGroup } from '@dyce/shared';
import { Text, brand, useTheme } from '@dyce/ui';
import { authErrorMessage } from '@/features/auth/messages';
import { askPushPermission, getPushPermission, registerDevice, type PushPermission } from './push';
import { useNotificationPrefsQuery, useUpdateNotificationPrefs } from './use-notifications';

const STEP = 30;
const DAY = 1440;
const wrap = (m: number) => ((m % DAY) + DAY) % DAY;
/** The phone's offset from UTC in minutes (east positive), sent with every change so quiet hours use local time. */
const tzOffset = () => -new Date().getTimezoneOffset();

/**
 * The Settings section for push: whether this phone allows it, one switch per kind of notification, and quiet hours.
 * Saved on the server right away. The in-app Notifications list always shows everything; these only govern push.
 */
export function NotificationSettings() {
  const { colors } = useTheme();
  const prefs = useNotificationPrefsQuery();
  const update = useUpdateNotificationPrefs();
  const [permission, setPermission] = useState<PushPermission>('unsupported');
  const data = prefs.data;
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate({ ...patch, tzOffsetMin: tzOffset() });

  useEffect(() => {
    void getPushPermission().then(setPermission);
  }, []);

  async function allow() {
    const next = await askPushPermission();
    setPermission(next);
    if (next === 'granted') await registerDevice();
    else if (next === 'denied') void Linking.openSettings();
  }

  const card = { backgroundColor: colors.card };
  return (
    <View>
      <Text style={styles.label} color="sub">
        Notifications
      </Text>
      <View style={[styles.card, card]}>
        {Platform.OS !== 'web' && permission !== 'granted' ? (
          <View style={[styles.row, { borderColor: colors.line }]}>
            <View style={styles.body}>
              <Text style={styles.title}>Push is off on this phone</Text>
              <Text style={styles.sub} color="sub">
                Turn it on to hear about your turn, even when Dyce is closed.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                permission === 'denied' ? 'Open phone settings' : 'Turn on notifications'
              }
              onPress={() => void allow()}
              style={[styles.action, { backgroundColor: brand.ember.fill }]}
            >
              <Text style={[styles.actionText, { color: brand.ember.text }]}>
                {permission === 'denied' ? 'Settings' : 'Turn on'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {PUSH_GROUPS.map((g: PushGroup) => (
          <View key={g} style={[styles.row, { borderColor: colors.line }]}>
            <View style={styles.body}>
              <Text style={styles.title}>{PUSH_GROUP_LABELS[g].title}</Text>
              <Text style={styles.sub} color="sub">
                {PUSH_GROUP_LABELS[g].subtitle}
              </Text>
            </View>
            <Switch
              accessibilityLabel={`${PUSH_GROUP_LABELS[g].title} notifications`}
              value={data?.groups[g] ?? true}
              disabled={!data || update.isPending}
              onValueChange={(v) => save({ groups: { [g]: v } })}
              trackColor={{ true: brand.ember.fill }}
            />
          </View>
        ))}

        <View
          style={[
            styles.row,
            { borderColor: data?.quietHours.enabled ? colors.line : 'transparent' },
          ]}
        >
          <View style={styles.body}>
            <Text style={styles.title}>Quiet hours</Text>
            <Text style={styles.sub} color="sub">
              No pushes at night. They stay in your list.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Quiet hours"
            value={data?.quietHours.enabled ?? false}
            disabled={!data || update.isPending}
            onValueChange={(v) => save({ quietHours: { enabled: v } })}
            trackColor={{ true: brand.ember.fill }}
          />
        </View>
        {data?.quietHours.enabled ? (
          <>
            <Stepper
              label="From"
              minute={data.quietHours.startMinute}
              onChange={(m) => save({ quietHours: { startMinute: m } })}
              line={colors.line}
            />
            <Stepper
              label="Until"
              minute={data.quietHours.endMinute}
              onChange={(m) => save({ quietHours: { endMinute: m } })}
              line="transparent"
            />
          </>
        ) : null}
      </View>
      {update.isError || prefs.isError ? (
        <Text color="accent" style={styles.note} accessibilityLiveRegion="polite">
          {authErrorMessage(update.error ?? prefs.error)}
        </Text>
      ) : null}
    </View>
  );
}

function Stepper({
  label,
  minute,
  onChange,
  line,
}: {
  label: string;
  minute: number;
  onChange: (minute: number) => void;
  line: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderColor: line }]}>
      <Text style={[styles.title, styles.body]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} earlier by 30 minutes`}
        onPress={() => onChange(wrap(minute - STEP))}
        style={[styles.step, { backgroundColor: colors.chip }]}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.time} accessibilityLabel={`${label} ${formatMinuteOfDay(minute)}`}>
        {formatMinuteOfDay(minute)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} later by 30 minutes`}
        onPress={() => onChange(wrap(minute + STEP))}
        style={[styles.step, { backgroundColor: colors.chip }]}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: 'Figtree_600SemiBold',
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 6,
  },
  card: { borderRadius: 16, overflow: 'hidden' },
  row: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
  },
  body: { flex: 1, paddingVertical: 8 },
  title: { fontSize: 15, fontFamily: 'Figtree_500Medium' },
  sub: { fontSize: 12, fontFamily: 'Figtree_500Medium' },
  action: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center' },
  actionText: { fontSize: 14, fontFamily: 'Figtree_700Bold' },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontFamily: 'Figtree_700Bold' },
  time: { minWidth: 56, textAlign: 'center', fontSize: 16, fontFamily: 'Figtree_700Bold' },
  note: { fontSize: 12, paddingHorizontal: 4, paddingTop: 6 },
});
