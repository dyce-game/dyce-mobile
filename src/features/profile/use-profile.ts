import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, type ProfileUpdate } from '@dyce/shared';
import { authApi } from '@/lib/api';

/** Change your display name and/or who can message and add you. Everything that shows you reads `me` again. */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => authApi.updateProfile(patch),
    onSuccess: (me) => {
      client.setQueryData(queryKeys.me, me);
    },
  });
}
