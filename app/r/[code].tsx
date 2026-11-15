import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** https://dyce.games/r/<code> (a request QR opened by link) goes straight to the Pay screen. */
export default function RequestLinkRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={`/wallet/pay/${code}` as Href} />;
}
