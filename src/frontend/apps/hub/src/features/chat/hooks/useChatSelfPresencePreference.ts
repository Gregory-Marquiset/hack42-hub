import { useQuery } from "@tanstack/react-query";

import { chatKeys } from "@/features/chat/chatKeys";
import { useAccountDriver } from "@/features/drivers/useAccountDriver";
import type {
  AccountId,
  ChatSelfPresencePreference,
} from "@/features/drivers/types";

/** Persisted manual mode for one account; distinct from observed Matrix state. */
export const useChatSelfPresencePreference = (
  accountId: AccountId,
): ChatSelfPresencePreference | null => {
  const driver = useAccountDriver(accountId);
  const { data } = useQuery({
    queryKey: chatKeys.selfPresencePreference(accountId),
    queryFn: () => driver?.getSelfPresencePreference() ?? "online",
    enabled: Boolean(driver),
    staleTime: Infinity,
  });

  return data ?? null;
};
