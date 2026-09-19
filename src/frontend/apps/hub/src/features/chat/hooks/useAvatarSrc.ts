import { useQuery } from "@tanstack/react-query";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { AccountId, ChatVisual } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

/**
 * Resolves a driver-specific picture URL to one an `<img>` can actually load
 * (see `Driver.resolveAvatarUrl` — Matrix's local homeserver requires an
 * authenticated request, so this goes through a fetch-and-cache step rather
 * than being usable as a plain link). `undefined` without a URL.
 */
export const useResolvedAvatarUrl = (
  accountId: AccountId,
  url: string | undefined,
): string | undefined => {
  const { data } = useQuery({
    queryKey: chatKeys.avatarSrc(accountId, url ?? ""),
    queryFn: () => getRegistry().get(accountId).resolveAvatarUrl(url!),
    enabled: Boolean(url),
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });
  return data;
};

/**
 * Resolves a `ChatVisual` of kind `"image"` (see `useResolvedAvatarUrl`).
 * Returns `undefined` for any other visual kind, so callers can pass the
 * result straight to `Avatar`'s `src` and let it fall back to initials/icon.
 */
export const useAvatarSrc = (
  accountId: AccountId,
  visual: ChatVisual,
): string | undefined =>
  useResolvedAvatarUrl(
    accountId,
    visual.kind === "image" ? visual.url : undefined,
  );
