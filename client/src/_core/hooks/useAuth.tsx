// This file didn't exist in the exported project — Manus injects its own
// version of this hook at build time on their platform, wired to their
// OAuth portal, and that injected version isn't included when a project is
// exported/downloaded. Since this app now has real, standalone
// email/password auth (see server/auth.ts, server/routers.ts's `auth`
// router, and client/src/pages/Login.tsx), this hook is just a thin wrapper
// around the `auth.me` query — no Manus dependency at all.
import { trpc } from "@/lib/trpc";

export function useAuth() {
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });

  return {
    user: meQuery.data ?? null,
    isAuthenticated: !!meQuery.data,
    isLoading: meQuery.isLoading,
    loading: meQuery.isLoading,
    refetch: meQuery.refetch,
  };
}
