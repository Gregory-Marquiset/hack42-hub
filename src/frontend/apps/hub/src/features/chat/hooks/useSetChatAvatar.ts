import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { Chat, ChatRef, ChatSections } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";

const patchVisual = (chat: Chat, chatId: string, url: string): Chat =>
  chat.id === chatId ? { ...chat, visual: { kind: "image", url } } : chat;

export type UseSetChatAvatarResult = {
  setChatAvatar: (file: File) => void;
  isPending: boolean;
};

/**
 * Uploads and sets a group chat's photo. The driver resolves the new photo
 * to a ready-to-render HTTP URL, so the header and every list row that
 * already has this chat cached are patched immediately — no wait on the
 * next `/sync` to reflect the change.
 */
export const useSetChatAvatar = (ref: ChatRef): UseSetChatAvatarResult => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { mutate, isPending } = useMutation<string, Error, File>({
    mutationFn: (file) =>
      getRegistry().get(ref.accountId).setChatAvatar(ref.chatId, file),
    onSuccess: (url) => {
      queryClient.setQueryData<Chat>(chatKeys.chat(ref), (chat) =>
        chat ? patchVisual(chat, ref.chatId, url) : chat,
      );
      queryClient.setQueriesData<ChatSections>(
        { queryKey: chatKeys.chatsOf(ref.accountId) },
        (sections) =>
          sections
            ? {
                favourites: sections.favourites.map((chat) =>
                  patchVisual(chat, ref.chatId, url),
                ),
                all: sections.all.map((chat) =>
                  patchVisual(chat, ref.chatId, url),
                ),
              }
            : sections,
      );
    },
    onError: () => {
      notify.error(
        t("The group photo could not be updated. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  return { setChatAvatar: mutate, isPending };
};
