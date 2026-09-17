import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  getRegistry,
  useDriverEntries,
} from "@/features/drivers/DriverRegistry";
import type { ChatFile, ChatRef } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";
import { saveFile } from "../saveFile";

const EMPTY_FILES: ChatFile[] = [];

/** The largest document shared from the device, as most homeservers allow. */
export const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;

export class ChatFileTooLargeError extends Error {
  constructor(name: string) {
    super(`"${name}" is larger than ${MAX_CHAT_FILE_BYTES} bytes.`);
    this.name = "ChatFileTooLargeError";
  }
}

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
  const queryClient = useQueryClient();
  const entries = useDriverEntries();
  const isSupported = useMemo(
    () =>
      ref
        ? (entries.find((entry) => entry.accountId === ref.accountId)?.driver
            .supportsChatFiles ?? false)
        : false,
    [entries, ref],
  );

  const query = useQuery({
    queryKey: ref ? chatKeys.files(ref) : chatKeys.noChat(),
    queryFn: () =>
      ref
        ? getRegistry().get(ref.accountId).getChatFiles(ref.chatId)
        : Promise.resolve(EMPTY_FILES),
    enabled: enabled && ref !== null && isSupported,
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });

  const upload = useMutation<void, Error, File[]>({
    mutationFn: async (files) => {
      if (!ref) {
        throw new Error("useChatFiles requires a conversation.");
      }
      const tooLarge = files.find((file) => file.size > MAX_CHAT_FILE_BYTES);
      if (tooLarge) {
        throw new ChatFileTooLargeError(tooLarge.name);
      }
      const driver = getRegistry().get(ref.accountId);
      try {
        for (const file of files) {
          await driver.uploadChatFile(ref.chatId, file);
        }
      } finally {
        void queryClient.invalidateQueries({ queryKey: chatKeys.files(ref) });
      }
    },
    onSuccess: (_data, files) => {
      notify.brand(
        files.length > 1 ? t("Documents shared") : t("Document shared"),
      );
    },
    onError: (error) => {
      notify.error(
        error instanceof ChatFileTooLargeError
          ? t("A document cannot be larger than 50 MB.")
          : t("The document could not be shared. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  const download = useMutation<void, Error, ChatFile>({
    mutationFn: async (file) => {
      if (!ref) {
        throw new Error("useChatFiles requires a conversation.");
      }
      const blob = await getRegistry()
        .get(ref.accountId)
        .downloadChatFile(ref.chatId, file.id);
      saveFile(blob, file.name);
    },
    onError: () => {
      notify.error(
        t("The document could not be downloaded. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  return {
    files: query.data ?? EMPTY_FILES,
    isSupported,
    isInitialLoading: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
    retry: () => void query.refetch(),
    uploadFiles: async (files) => {
      try {
        await upload.mutateAsync(files);
      } catch {
        // The error is already shown.
      }
    },
    isUploading: upload.isPending,
    downloadFile: async (file) => {
      try {
        await download.mutateAsync(file);
      } catch {
        // The error is already shown.
      }
    },
    pendingFileId: download.isPending ? (download.variables?.id ?? null) : null,
  };
};
