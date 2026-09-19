import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ChatMeetingDocument,
  MeetingAttachment,
} from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { formatFileSize } from "./fileSize";
import { isTextFile } from "./textFile";

/** Attached text files are kept by the Hub: small ones only. */
export const MAX_ATTACHMENT_BYTES = 100_000;
/** What the Hub accepts (see `MeetingCreateSerializer`). */
export const MAX_ATTACHMENTS = 20;

export type DraftDocument = {
  id: string;
  title: string;
  url: string;
  /** Picked on this device and served from a blob URL, to release on removal. */
  isLocalFile?: boolean;
  /** Text of a picked file, kept by the Hub for the meeting archive. */
  content?: string;
};

/** The text of a picked file. */
const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

/**
 * The agenda file and the documents of a meeting being created: .txt and .md
 * files picked on the device (read, and served from blob URLs released on
 * removal or when the form goes away) and links. Picked files go to the
 * Hub's archive, links to every member; both within the Hub's limits.
 */
export const useDraftDocuments = () => {
  const { t, i18n } = useTranslation();
  const [agendaFile, setAgendaFile] = useState<DraftDocument | null>(null);
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const nextDocumentId = useRef(0);
  const localFileUrls = useRef(new Set<string>());

  const pickedFiles = [agendaFile, ...documents].filter(
    (doc): doc is DraftDocument => doc?.content !== undefined,
  );

  useEffect(() => {
    const urls = localFileUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const newDocumentId = () => `document-${nextDocumentId.current++}`;

  const toLocalDocument = async (file: File): Promise<DraftDocument> => {
    const content = await readText(file);
    const url = URL.createObjectURL(file);
    localFileUrls.current.add(url);
    return {
      id: newDocumentId(),
      title: file.name,
      url,
      isLocalFile: true,
      content,
    };
  };

  const release = (document: DraftDocument | null | undefined) => {
    if (document?.isLocalFile) {
      URL.revokeObjectURL(document.url);
      localFileUrls.current.delete(document.url);
    }
  };

  /**
   * The picked files that can be attached, read: only .txt and .md files,
   * small enough, and no more than `room`. Each refusal says why.
   */
  const readFiles = async (
    files: File[],
    room: number,
  ): Promise<DraftDocument[]> => {
    const texts = files.filter((file) => isTextFile(file.name));
    if (texts.length !== files.length) {
      notify.error(t("Only .txt or .md files can be attached."));
    }
    if (texts.length > room) {
      notify.error(
        t("A meeting can have {{max}} attached files at most.", {
          max: MAX_ATTACHMENTS,
        }),
      );
    }
    const kept = texts.slice(0, Math.max(room, 0));
    const readable = kept.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    if (readable.length !== kept.length) {
      notify.error(
        t("A file is too large to be attached ({{size}} at most).", {
          size: formatFileSize(
            MAX_ATTACHMENT_BYTES,
            i18n.resolvedLanguage ?? i18n.language,
          ),
        }),
      );
    }
    try {
      return await Promise.all(readable.map(toLocalDocument));
    } catch {
      notify.error(t("The file could not be read."));
      return [];
    }
  };

  /** Replaces the agenda file with the first of `files` that can be. */
  const attachAgendaFile = async (files: File[]) => {
    const room = MAX_ATTACHMENTS - pickedFiles.length + (agendaFile ? 1 : 0);
    const [picked] = await readFiles(files.slice(0, 1), room);
    if (picked) {
      release(agendaFile);
      setAgendaFile(picked);
    }
  };

  const removeAgendaFile = () => {
    release(agendaFile);
    setAgendaFile(null);
  };

  const attachDocumentFiles = async (files: File[]) => {
    const added = await readFiles(files, MAX_ATTACHMENTS - pickedFiles.length);
    if (added.length > 0) {
      setDocuments((current) => [...current, ...added]);
    }
  };

  const addLink = (link: { title: string; url: string }) => {
    setDocuments((current) => [...current, { id: newDocumentId(), ...link }]);
  };

  const removeDocument = (document: DraftDocument) => {
    release(document);
    setDocuments((current) => current.filter((doc) => doc.id !== document.id));
  };

  /** Kept by the Hub for the archive. */
  const attachments: MeetingAttachment[] = pickedFiles.map((doc) => ({
    name: doc.title,
    content: doc.content ?? "",
  }));
  /** Listed for every member with the meeting. */
  const links: ChatMeetingDocument[] = documents
    .filter((doc) => !doc.isLocalFile)
    .map(({ id, title, url }) => ({ id, title, url }));

  return {
    agendaFile,
    documents,
    attachments,
    links,
    attachAgendaFile,
    removeAgendaFile,
    attachDocumentFiles,
    addLink,
    removeDocument,
  };
};
