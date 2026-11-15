import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, type AvatarConfig } from '@dyce/shared';
import { authApi } from '@/lib/api';
import { useSession } from '@/features/auth/use-session';

/** Your own account, including your avatar (null until you pick a look). */
export function useMeQuery() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({ queryKey: queryKeys.me, queryFn: authApi.me, enabled: signedIn });
}

/** Save the chosen look. Everything that shows you (your header, your friends' lists) reads it afterwards. */
export function useSetAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (avatar: AvatarConfig) => authApi.setAvatar(avatar),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}
