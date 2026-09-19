import { useQuery } from "@tanstack/react-query";

import { chatKeys } from "@/features/chat/chatKeys";
import { useAccountDriver } from "@/features/drivers/useAccountDriver";
import type { AccountId, ChatUserPresence } from "@/features/drivers/types";

/**
 * Presence currently known for one user in one chat account. Initial data is
 * read from the driver's local store, falling back to the backend when the
 * store has nothing; live updates are written by `useChatEvents`. This hook
 * never subscribes to the driver itself.
 */
export const useChatUserPresence = (
  accountId: AccountId,
  userId: string,
): ChatUserPresence | null => {
  const driver = useAccountDriver(accountId);
  const { data } = useQuery({
    queryKey: chatKeys.userPresence(accountId, userId),
    // The store first, because it costs nothing and carries live changes. The
    // server only when it is empty: `/sync` does not repeat a presence that
    // has not changed, so a long-offline person is simply missing from it.
    queryFn: async () =>
      driver?.getUserPresence(userId) ??
      (await driver?.fetchUserPresence(userId)) ??
      null,
    enabled: Boolean(driver && userId),
    staleTime: Infinity,
  });

  return data ?? null;
};
