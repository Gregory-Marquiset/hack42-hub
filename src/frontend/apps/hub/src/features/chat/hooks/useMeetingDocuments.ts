import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { APIError } from "@/features/api/APIError";
import {
  createMeetingDocsDocument,
  fetchMeetingDocumentFile,
  fetchMeetingDocuments,
  type MeetingAttachmentInfo,
  type MeetingDocuments,
  uploadMeetingDocument,
} from "@/features/chat/api/meetings";
import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { ChatMeetingDocument, ChatRef } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";
import { saveFile } from "../saveFile";

/** The Hub keeps documents up to this size (see MEETING_ATTACHMENT_MAX_BYTES). */
export const MAX_MEETING_DOCUMENT_BYTES = 20 * 1024 * 1024;

const EMPTY: MeetingDocuments = {
  agenda: "",
  attachments: [],
  isClosed: false,
};

export class MeetingDocumentTooLargeError extends Error {
  constructor(name: string) {
    super(`"${name}" is larger than ${MAX_MEETING_DOCUMENT_BYTES} bytes.`);
    this.name = "MeetingDocumentTooLargeError";
  }
}

export type UseMeetingDocumentsResult = {
  agenda: string;
  attachments: MeetingAttachmentInfo[];
  /** The Hub closed the meeting: its documents can no longer change. */
  isClosed: boolean;
  isInitialLoading: boolean;
  isError: boolean;
  retry: () => void;
  /** Adds documents from the device, one after the other. */
  addFiles: (files: File[]) => Promise<void>;
  isAdding: boolean;
  /** Creates an empty Docs document for the meeting, owned by the member. */
  createDocsDocument: (title: string) => Promise<ChatMeetingDocument | null>;
  isCreatingDocument: boolean;
  download: (attachment: MeetingAttachmentInfo) => Promise<void>;
  /** The document being downloaded, if any. */
  pendingAttachmentId: string | null;
};

type Target = {
  ref: ChatRef;
  meetingId: string;
  /** The organizer is known to the Hub: no Matrix proof is needed. */
  isOrganizer: boolean;
};

/**
 * The agenda and the documents the Hub keeps for a meeting, which every
 * member of its conversation can read and add to until the meeting closes.
 * They go in the meeting archive.
 */
export const useMeetingDocuments = (
  target: Target | null,
  enabled: boolean,
): UseMeetingDocumentsResult => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  /** A member proves their Matrix account; the organizer needs nothing. */
  const proof = async ({ ref, isOrganizer }: Target) =>
    isOrganizer ? undefined : getRegistry().get(ref.accountId).getOpenIdToken();

  const queryKey = target
    ? chatKeys.meetingDocuments(target.ref, target.meetingId)
    : chatKeys.noChat();

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      target
        ? fetchMeetingDocuments(target.meetingId, await proof(target))
        : EMPTY,
    enabled: enabled && target !== null,
    meta: { noGlobalError: true },
  });

  const add = useMutation<void, Error, File[]>({
    mutationFn: async (files) => {
      if (!target) {
        throw new Error("useMeetingDocuments requires a meeting.");
      }
      const tooLarge = files.find(
        (file) => file.size > MAX_MEETING_DOCUMENT_BYTES,
      );
      if (tooLarge) {
        throw new MeetingDocumentTooLargeError(tooLarge.name);
      }
      const token = await proof(target);
      try {
        for (const file of files) {
          await uploadMeetingDocument(target.meetingId, file, token);
        }
      } finally {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onSuccess: (_data, files) => {
      notify.brand(
        files.length > 1
          ? t("Documents added to the meeting")
          : t("Document added to the meeting"),
      );
    },
    onError: (error) => {
      notify.error(
        error instanceof MeetingDocumentTooLargeError
          ? t("A meeting document cannot be larger than 20 MB.")
          : error instanceof APIError && error.code === 409
            ? t("The meeting is closed: its documents can no longer change.")
            : t("The document could not be added. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  const createDocument = useMutation<ChatMeetingDocument, Error, string>({
    mutationFn: async (title) => {
      if (!target) {
        throw new Error("useMeetingDocuments requires a meeting.");
      }
      return createMeetingDocsDocument(
        target.meetingId,
        title,
        await proof(target),
      );
    },
    onSuccess: () => {
      notify.brand(t("The document was created in Docs."));
    },
    onError: (error) => {
      notify.error(
        error instanceof APIError && error.code === 503
          ? t("Docs is not available on this Hub.")
          : t("The document could not be created. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  const fetchFile = useMutation<void, Error, MeetingAttachmentInfo>({
    mutationFn: async (attachment) => {
      if (!target) {
        throw new Error("useMeetingDocuments requires a meeting.");
      }
      const blob = await fetchMeetingDocumentFile(
        target.meetingId,
        attachment.id,
        await proof(target),
      );
      saveFile(blob, attachment.name);
    },
    onError: () => {
      notify.error(
        t("The document could not be downloaded. Please try again."),
      );
    },
    meta: { noGlobalError: true },
  });

  const data = query.data ?? EMPTY;
  return {
    agenda: data.agenda,
    attachments: data.attachments,
    isClosed: data.isClosed,
    isInitialLoading: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
    retry: () => void query.refetch(),
    addFiles: async (files) => {
      try {
        await add.mutateAsync(files);
      } catch {
        // The error is already shown.
      }
    },
    isAdding: add.isPending,
    createDocsDocument: async (title) => {
      try {
        return await createDocument.mutateAsync(title);
      } catch {
        // The error is already shown.
        return null;
      }
    },
    isCreatingDocument: createDocument.isPending,
    download: async (attachment) => {
      try {
        await fetchFile.mutateAsync(attachment);
      } catch {
        // The error is already shown.
      }
    },
    pendingAttachmentId: fetchFile.isPending
      ? (fetchFile.variables?.id ?? null)
      : null,
  };
};
