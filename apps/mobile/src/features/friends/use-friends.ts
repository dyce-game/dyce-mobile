import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@dyce/shared';
import { contactsApi, friendsApi } from '@/lib/api';

/** Your friends, A-Z. */
export function useFriendsQuery() {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: friendsApi.list,
    refetchOnMount: 'always',
  });
}

/** Requests waiting for you, and requests you sent. */
export function useFriendRequestsQuery() {
  return useQuery({
    queryKey: queryKeys.friendRequests,
    queryFn: friendsApi.requests,
    refetchOnMount: 'always',
  });
}

/** People from your synced contacts who are on Dyce and not yet friends. */
export function useContactSuggestionsQuery() {
  return useQuery({
    queryKey: queryKeys.contactSuggestions,
    queryFn: contactsApi.suggestions,
    refetchOnMount: 'always',
  });
}

/** Call after anything that changes who is a friend or who has been asked. */
export function useRefreshFriends() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.friends });
    void client.invalidateQueries({ queryKey: queryKeys.contactSuggestions });
  };
}

function useFriendMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const refresh = useRefreshFriends();
  return useMutation({ mutationFn: fn, onSettled: refresh });
}

export const useAcceptRequest = () =>
  useFriendMutation((userId: string) => friendsApi.accept(userId));
export const useIgnoreRequest = () =>
  useFriendMutation((userId: string) => friendsApi.ignore(userId));
export const useCancelRequest = () =>
  useFriendMutation((userId: string) => friendsApi.cancel(userId));
export const useRemoveFriend = () =>
  useFriendMutation((userId: string) => friendsApi.remove(userId));
