import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { ChatRef } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

export const useSetChatMemberDocumentAddPermission = (ref: ChatRef) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ userId, canAdd }: { userId: string; canAdd: boolean }) =>
      getRegistry().get(ref.accountId).setChatMemberDocumentAddPermission({
        chatId: ref.chatId,
        userId,
        canAdd,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.members(ref) });
      void queryClient.invalidateQueries({
        queryKey: chatKeys.documentCapabilities(ref),
      });
    },
    meta: { noGlobalError: true },
  });

  return {
    setDocumentAddPermission: mutation.mutate,
    isUpdating: mutation.isPending,
  };
};
