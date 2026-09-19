import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { notify } from "@/features/ui/components/toast";

import { formatFileSize } from "../components/tools-panel/fileSize";
import { saveFile } from "../saveFile";

/** A picked file is larger than the destination accepts. */
export class FileTooLargeError extends Error {
  constructor(name: string, maxBytes: number) {
    super(`"${name}" is larger than ${maxBytes} bytes.`);
    this.name = "FileTooLargeError";
  }
}

type FileTransferOptions<Item extends { id: string; name: string }> = {
  /** The list the uploads change, refreshed after them. */
  queryKey: QueryKey;
  /** Binary limit (`20 * 1024 * 1024`), stated as "20 MB" when it is hit. */
  maxBytes: number;
  /**
   * Called once per batch (to get a proof they all share, say), gives what
   * sends one file; the files are then sent one after the other.
   */
  startUpload: () => Promise<(file: File) => Promise<unknown>>;
  fetchBlob: (item: Item) => Promise<Blob>;
  messages: {
    uploaded: (count: number) => string;
    /** Given the limit, formatted. */
    tooLarge: (size: string) => string;
    uploadFailed: (error: Error) => string;
  };
};

export type FileTransfer<Item> = {
  /** Sends files from the device, one after the other. */
  upload: (files: File[]) => Promise<void>;
  isUploading: boolean;
  download: (item: Item) => Promise<void>;
  /** The item being downloaded, if any. */
  pendingId: string | null;
};

/**
 * Uploading files from the device to a list and downloading its items: the
 * size check, the refresh, the messages and the saving, shared by the
 * documents of a conversation and those of a meeting. Errors are shown here,
 * so the returned functions never reject.
 */
export const useFileTransfer = <Item extends { id: string; name: string }>({
  queryKey,
  maxBytes,
  startUpload,
  fetchBlob,
  messages,
}: FileTransferOptions<Item>): FileTransfer<Item> => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const upload = useMutation<void, Error, File[]>({
    mutationFn: async (files) => {
      const tooLarge = files.find((file) => file.size > maxBytes);
      if (tooLarge) {
        throw new FileTooLargeError(tooLarge.name, maxBytes);
      }
      const send = await startUpload();
      try {
        for (const file of files) {
          await send(file);
        }
      } finally {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onSuccess: (_data, files) => {
      notify.brand(messages.uploaded(files.length));
    },
    onError: (error) => {
      notify.error(
        error instanceof FileTooLargeError
          ? messages.tooLarge(
              formatFileSize(
                maxBytes,
                i18n.resolvedLanguage ?? i18n.language,
                1024,
              ),
            )
          : messages.uploadFailed(error),
      );
    },
    meta: { noGlobalError: true },
  });

  const download = useMutation<void, Error, Item>({
    mutationFn: async (item) => {
      saveFile(await fetchBlob(item), item.name);
    },
    onError: () => {
      notify.error(
        t("The document could not be downloaded. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  return {
    upload: async (files) => {
      try {
        await upload.mutateAsync(files);
      } catch {
        // The error is already shown.
      }
    },
    isUploading: upload.isPending,
    download: async (item) => {
      try {
        await download.mutateAsync(item);
      } catch {
        // The error is already shown.
      }
    },
    pendingId: download.isPending ? (download.variables?.id ?? null) : null,
  };
};
