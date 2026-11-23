import { hasPartyScreen } from './common-logic';
import { CharadesScreen } from './CharadesScreen';
import { DoodleScreen } from './DoodleScreen';
import { ImposterScreen } from './ImposterScreen';
import { WerewolfScreen } from './WerewolfScreen';
import type { PartyScreenProps } from './types';

/**
 * The table for the four party games: one real screen each, picked by the Space's game. Anything else
 * returns null (the caller only mounts this for `hasPartyScreen` games).
 */
export function PartyTable(props: PartyScreenProps) {
  const slug = props.space.gameSlug;
  if (!hasPartyScreen(slug)) return null;
  switch (slug) {
    case 'imposter':
      return <ImposterScreen {...props} />;
    case 'werewolf':
      return <WerewolfScreen {...props} />;
    case 'charades':
      return <CharadesScreen {...props} />;
    case 'doodle-guess':
      return <DoodleScreen {...props} />;
  }
}
