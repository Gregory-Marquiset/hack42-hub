import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { AccountId } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";

export type UseSetUserAvatarResult = {
  setUserAvatar: (file: File) => void;
  isPending: boolean;
};

/**
 * Uploads and sets the current user's own photo on the given chat account.
 * Other participants see it on their next `/sync`; locally, patches the
 * `myAvatarUrl` cache directly with the mutation's own result so the account
 * menu icon (`useMyAvatarSrc`) updates immediately, without waiting on a
 * refetch.
 */
export const useSetUserAvatar = (
  accountId: AccountId,
): UseSetUserAvatarResult => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation<string, Error, File>({
    mutationFn: (file) => getRegistry().get(accountId).setUserAvatar(file),
    onSuccess: (mxcUrl) => {
      queryClient.setQueryData(chatKeys.myAvatarUrl(accountId), mxcUrl);
      notify.brand(t("Your profile photo has been updated."));
    },
    onError: () => {
      notify.error(
        t("Your profile photo could not be updated. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  return { setUserAvatar: mutate, isPending };
};
