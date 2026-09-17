import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  getRegistry,
  useDriverEntries,
} from "@/features/drivers/DriverRegistry";
import type { ChatRef } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";

export type UseChatMuteResult = {
  isMuted: boolean;
  setMuted: (muted: boolean) => void;
  isSupported: boolean;
  isInitialLoading: boolean;
  isPending: boolean;
};

/** Whether a whole conversation is muted (see `Driver.isChatMuted`/`setChatMuted`). */
export const useChatMute = (
  ref: ChatRef | null,
  enabled: boolean,
): UseChatMuteResult => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const entries = useDriverEntries();
  const isSupported = useMemo(
    () =>
      ref
        ? (entries.find((entry) => entry.accountId === ref.accountId)?.driver
            .supportsNotificationRules ?? false)
        : false,
    [entries, ref],
  );

  const query = useQuery({
    queryKey: ref ? chatKeys.chatMuted(ref) : chatKeys.noChat(),
    queryFn: () =>
      ref
        ? getRegistry().get(ref.accountId).isChatMuted(ref.chatId)
        : Promise.resolve(false),
    enabled: enabled && ref !== null && isSupported,
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (muted: boolean) => {
      if (!ref) return Promise.resolve();
      return getRegistry().get(ref.accountId).setChatMuted(ref.chatId, muted);
    },
    onMutate: async (muted) => {
      if (!ref) return undefined;
      const queryKey = chatKeys.chatMuted(ref);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<boolean>(queryKey);
      queryClient.setQueryData<boolean>(queryKey, muted);
      return { previous };
    },
    onError: (_error, _muted, context) => {
      if (!ref) return;
      if (context?.previous !== undefined) {
        queryClient.setQueryData(chatKeys.chatMuted(ref), context.previous);
      }
      notify.error(t("This setting could not be changed. Please try again."));
    },
    meta: { noGlobalError: true },
  });

  const setMuted = useCallback((muted: boolean) => mutate(muted), [mutate]);

  return {
    isMuted: query.data ?? false,
    setMuted,
    isSupported,
    isInitialLoading: query.isPending && query.fetchStatus !== "idle",
    isPending,
  };
};
