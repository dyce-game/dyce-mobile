import { Stack } from 'expo-router';

// Signed-out flow: welcome -> phone + code -> username. Routes stay thin; screens live in features/auth.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
