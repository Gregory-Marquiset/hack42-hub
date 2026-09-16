import { useQuery } from "@tanstack/react-query";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { AccountId } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";
import { useAvatarSrc } from "./useAvatarSrc";

/**
 * The signed-in account's own avatar, resolved to a URL an `<img>` can load
 * (see `useAvatarSrc`). Fetched from the driver on mount — not just right
 * after a change via `useSetUserAvatar` — so a photo set in a previous
 * session still shows up. Returns `undefined` until one is set.
 */
export const useMyAvatarSrc = (accountId: AccountId): string | undefined => {
  const { data: url } = useQuery({
    queryKey: chatKeys.myAvatarUrl(accountId),
    queryFn: () => getRegistry().get(accountId).getUserAvatarUrl(),
    enabled: Boolean(accountId),
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });
  return useAvatarSrc(
    accountId,
    url ? { kind: "image", url } : { kind: "icon", icon: "person" },
  );
};
