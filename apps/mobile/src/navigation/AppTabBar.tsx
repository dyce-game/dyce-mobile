import type { ComponentProps } from 'react';
import { useRouter, type Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar, type TabBarItem } from '@dyce/ui';
import { useConversationsQuery } from '@/features/chat/use-chat';

// Derive the props from expo-router itself so we always match the version it ships.
type TabBarRenderer = NonNullable<ComponentProps<typeof Tabs>['tabBar']>;
export type AppTabBarProps = Parameters<TabBarRenderer>[0];

const BASE_ITEMS: TabBarItem[] = [
  { key: 'chat', label: 'Chat', icon: 'chat' },
  { key: 'spaces', label: 'Spaces', icon: 'planet' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet' },
];

/** Adapts expo-router's tab state to the navigation-agnostic <TabBar> from @dyce/ui. */
export function AppTabBar({ state, emitter, navigateToTab }: AppTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Unread messages from people you chat with. Requests are not counted: a stranger never nags the tab bar.
  const unread = useConversationsQuery('all').data?.unreadTotal ?? 0;
  const items = BASE_ITEMS.map((it) => (it.key === 'chat' ? { ...it, badge: unread } : it));
  // Router route names look like "chat/index"; our tab keys are "chat".
  const keyOf = (routeName: string) => routeName.replace(/\/index$/, '');
  const activeKey = keyOf(state.routes[state.index]?.name ?? 'chat');

  return (
    <TabBar
      items={items}
      activeKey={activeKey}
      bottomInset={insets.bottom}
      onSelect={(key) => {
        const route = state.routes.find((r) => keyOf(r.name) === key);
        if (!route) return;
        const event = emitter.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!event.defaultPrevented) navigateToTab(route.key);
      }}
      // Search is scoped to the tab you are on: chat | spaces | wallet.
      onSearch={() => router.push({ pathname: '/search', params: { scope: activeKey } })}
    />
  );
}
