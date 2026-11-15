import type { AvatarConfig } from '@dyce/shared';
import { Avatar } from '@dyce/ui';
import { imageFor } from './starter-logic';

/** Someone's avatar from their saved look (`PublicUser.avatar`), or their initial if they haven't picked one. */
export function UserAvatar({
  avatar,
  name,
  size = 44,
}: {
  avatar?: AvatarConfig | null;
  name: string;
  size?: number;
}) {
  return <Avatar size={size} name={name} source={imageFor(avatar)} />;
}
