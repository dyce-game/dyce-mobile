import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/** A shared space link (https://dyce.games/s/DY-4K9P, dyce://s/DY-4K9P) opens Join with the code filled in. */
export default function SpaceLinkRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/space/join', params: { code } } as unknown as Href} />;
}
