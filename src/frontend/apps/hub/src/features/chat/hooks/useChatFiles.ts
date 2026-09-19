import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  getRegistry,
  useDriverEntries,
} from "@/features/drivers/DriverRegistry";
import type { ChatFile, ChatRef } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";
import { useFileTransfer } from "./useFileTransfer";

const EMPTY_FILES: ChatFile[] = [];

/** The largest document shared from the device, as most homeservers allow. */
export const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;

export type UseChatFilesResult = {
  files: ChatFile[];
  isSupported: boolean;
  isInitialLoading: boolean;
  isError: boolean;
  retry: () => void;
  /** Shares documents from the device, one after the other. */
  uploadFiles: (files: File[]) => Promise<void>;
  isUploading: boolean;
  downloadFile: (file: ChatFile) => Promise<void>;
  /** The document being downloaded, if any. */
  pendingFileId: string | null;
};

/**
 * The documents shared in a conversation (see `MatrixDriver.getChatFiles`):
 * listed from its history, shared from the device, and downloaded.
 */
export const useChatFiles = (
  ref: ChatRef | null,
  enabled: boolean,
): UseChatFilesResult => {
  const { t } = useTranslation();
  const entries = useDriverEntries();
  const isSupported = useMemo(
    () =>
      ref
        ? (entries.find((entry) => entry.accountId === ref.accountId)?.driver
            .supportsChatFiles ?? false)
        : false,
    [entries, ref],
  );

  const queryKey = ref ? chatKeys.files(ref) : chatKeys.noChat();
  const query = useQuery({
    queryKey,
    queryFn: () =>
      ref
        ? getRegistry().get(ref.accountId).getChatFiles(ref.chatId)
        : Promise.resolve(EMPTY_FILES),
    enabled: enabled && ref !== null && isSupported,
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });

  const requireRef = (): ChatRef => {
    if (!ref) {
      throw new Error("useChatFiles requires a conversation.");
    }
    return ref;
  };

  const transfer = useFileTransfer<ChatFile>({
    queryKey,
    maxBytes: MAX_CHAT_FILE_BYTES,
    startUpload: async () => {
      const { accountId, chatId } = requireRef();
      const driver = getRegistry().get(accountId);
      return (file) => driver.uploadChatFile(chatId, file);
    },
    fetchBlob: (file) => {
      const { accountId, chatId } = requireRef();
      return getRegistry().get(accountId).downloadChatFile(chatId, file.id);
    },
    messages: {
      uploaded: (count) =>
        count > 1 ? t("Documents shared") : t("Document shared"),
      tooLarge: (size) =>
        t("A document cannot be larger than {{size}}.", { size }),
      uploadFailed: () =>
        t("The document could not be shared. Please try again."),
    },
  });

  return {
    files: query.data ?? EMPTY_FILES,
    isSupported,
    isInitialLoading: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
    retry: () => void query.refetch(),
    uploadFiles: transfer.upload,
    isUploading: transfer.isUploading,
    downloadFile: transfer.download,
    pendingFileId: transfer.pendingId,
  };
};
