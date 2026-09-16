import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { AddChatDocumentParams } from "@/features/drivers/Driver";
import type { ChatDocument, ChatRef } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

export const useAddChatDocument = (ref: ChatRef) => {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    ChatDocument,
    Error,
    Pick<AddChatDocumentParams, "address" | "title">
  >({
    mutationFn: ({ address, title }) =>
      getRegistry().get(ref.accountId).addChatDocument({
        chatId: ref.chatId,
        address,
        title,
      }),
    onSuccess: (document) => {
      // The server accepted the write, but local room state may await /sync.
      // Add only the confirmed result to a warm cache; sync reconciles it.
      queryClient.setQueryData<ChatDocument[]>(
        chatKeys.documents(ref),
        (current) =>
          current &&
          !current.some(
            (existing) =>
              existing.address === document.address &&
              existing.title === document.title &&
              existing.addedBy === document.addedBy,
          )
            ? [...current, document]
            : current,
      );
    },
    meta: { noGlobalError: true },
  });

  return {
    addDocument: mutation.mutateAsync,
    isAdding: mutation.isPending,
  };
};
