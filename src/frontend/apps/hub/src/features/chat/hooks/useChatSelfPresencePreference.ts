import { queryOptions, useQuery } from "@tanstack/react-query";

import { chatKeys } from "@/features/chat/chatKeys";
import type { Driver } from "@/features/drivers/Driver";
import { useAccountDriver } from "@/features/drivers/useAccountDriver";
import type {
  AccountId,
  ChatSelfPresencePreference,
} from "@/features/drivers/types";

/** The one query for an account's chosen presence, whoever reads it. */
export const selfPresencePreferenceQuery = (
  accountId: AccountId,
  driver: Pick<Driver, "getSelfPresencePreference"> | undefined,
) =>
  queryOptions({
    queryKey: chatKeys.selfPresencePreference(accountId),
    queryFn: (): ChatSelfPresencePreference =>
      driver?.getSelfPresencePreference() ?? "online",
    enabled: Boolean(driver),
    staleTime: Infinity,
  });

/** Persisted manual mode for one account; distinct from observed Matrix state. */
export const useChatSelfPresencePreference = (
  accountId: AccountId,
): ChatSelfPresencePreference | null => {
  const driver = useAccountDriver(accountId);
  const { data } = useQuery(selfPresencePreferenceQuery(accountId, driver));

  return data ?? null;
};
