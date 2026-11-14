import { Tabs } from 'expo-router';
import { AppTabBar } from '@/navigation/AppTabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="spaces" />
      <Tabs.Screen name="wallet" />
    </Tabs>
  );
}
