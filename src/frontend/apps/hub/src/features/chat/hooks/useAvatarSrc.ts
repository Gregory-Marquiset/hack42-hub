import { useQuery } from "@tanstack/react-query";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { AccountId, ChatVisual } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

/**
 * Resolves a `ChatVisual` of kind `"image"` to a URL an `<img>` can actually
 * load (see `Driver.resolveAvatarUrl` — Matrix's local homeserver requires
 * an authenticated request, so this goes through a fetch-and-cache step
 * rather than being usable as a plain link). Returns `undefined` for any
 * other visual kind, so callers can pass the result straight to `Avatar`'s
 * `src` and let it fall back to initials/icon.
 */
export const useAvatarSrc = (
  accountId: AccountId,
  visual: ChatVisual,
): string | undefined => {
  const url = visual.kind === "image" ? visual.url : undefined;
  const { data } = useQuery({
    queryKey: chatKeys.avatarSrc(accountId, url ?? ""),
    queryFn: () => getRegistry().get(accountId).resolveAvatarUrl(url!),
    enabled: Boolean(url),
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });
  return data;
};
