import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { chatKeys } from "@/features/chat/chatKeys";
import { getRegistry } from "@/features/drivers/DriverRegistry";
import { publishedPresence } from "@/features/drivers/presencePreference";
import type {
  AccountId,
  ChatSelfPresencePreference,
} from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

type Result = {
  setSelfPresencePreference: (preference: ChatSelfPresencePreference) => void;
  isPending: boolean;
};

/** Persists and applies this client's manual presence mode. */
export const useSetSelfPresencePreference = (accountId: AccountId): Result => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation<
    void,
    Error,
    ChatSelfPresencePreference
  >({
    mutationFn: (preference) =>
      getRegistry().get(accountId).setSelfPresencePreference(preference),
    onSuccess: (_data, preference) => {
      queryClient.setQueryData(
        chatKeys.selfPresencePreference(accountId),
        preference,
      );
      const userId = getRegistry().get(accountId).getCurrentUserId();
      if (userId) {
        // What others now see, not the preference: "busy" is not a presence.
        queryClient.setQueryData(chatKeys.userPresence(accountId, userId), {
          userId,
          state: publishedPresence(preference),
        });
      }
      notify.brand(t("Your availability has been updated."));
    },
    onError: () =>
      notify.error(
        t("Your availability could not be updated. Please try again."),
      ),
    meta: { noGlobalError: true },
  });

  return { setSelfPresencePreference: mutate, isPending };
};
