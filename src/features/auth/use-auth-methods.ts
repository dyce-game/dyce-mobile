import { useQuery } from '@tanstack/react-query';
import type { AuthMethods } from '@dyce/shared';
import { authApi } from '@/lib/api';

/**
 * Which ways in the server offers. The phone is always there; email can be switched off on the server
 * (EMAIL_AUTH_ENABLED=false). Until we hear, email is shown: hiding a working option is worse than a clear error.
 */
export function useAuthMethods(): AuthMethods {
  const q = useQuery({
    queryKey: ['auth-methods'],
    queryFn: authApi.methods,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return { phone: true, email: q.data?.email ?? true };
}
