import { fetchAPI } from "@/features/api/fetchApi";
import type { ChatMeetingDocument } from "@/features/drivers/types";
import { isWebLink } from "@/features/drivers/webLink";

const meetingPath = (slug: string) => `meetings/${encodeURIComponent(slug)}/`;

/**
 * Keeps the Hub's copy of a meeting in step with a renaming or an extension:
 * the server closes the meeting from its planned end.
 */
export const updateMeeting = async (
  slug: string,
  change: { title?: string; extendMinutes?: number },
): Promise<void> => {
  await fetchAPI(
    meetingPath(slug),
    {
      method: "PATCH",
      body: JSON.stringify({
        ...(change.title !== undefined ? { title: change.title } : {}),
        ...(change.extendMinutes !== undefined
          ? { extend_minutes: change.extendMinutes }
          : {}),
      }),
    },
    { redirectOn40x: false },
  );
};

/** A document the Hub keeps for a meeting. */
export type MeetingAttachmentInfo = {
  id: string;
  name: string;
  /** Bytes. */
  size: number;
  /** ISO 8601. */
  createdAt: string;
};

/** What the members can read of a meeting, besides its state. */
export type MeetingDocuments = {
  agenda: string;
  attachments: MeetingAttachmentInfo[];
  isClosed: boolean;
};

type RawAttachment = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

const toAttachment = (raw: RawAttachment): MeetingAttachmentInfo => ({
  id: raw.id,
  name: raw.name,
  size: raw.size,
  createdAt: raw.created_at,
});

/**
 * The agenda and the documents of a meeting. A member who is not its
 * organizer proves their Matrix account with `openIdToken`.
 */
export const fetchMeetingDocuments = async (
  slug: string,
  openIdToken?: string,
): Promise<MeetingDocuments> => {
  const response = await fetchAPI(
    `${meetingPath(slug)}documents/`,
    {
      method: "POST",
      body: JSON.stringify({ openid_token: openIdToken ?? "" }),
    },
    { redirectOn40x: false },
  );
  const data = (await response.json()) as {
    agenda: string;
    attachments: RawAttachment[];
    is_closed: boolean;
  };
  return {
    agenda: data.agenda,
    attachments: data.attachments.map(toAttachment),
    isClosed: data.is_closed,
  };
};

/** Adds a document from the member's device to a meeting that is not closed. */
export const uploadMeetingDocument = async (
  slug: string,
  file: File,
  openIdToken?: string,
): Promise<MeetingAttachmentInfo> => {
  const body = new FormData();
  body.append("file", file, file.name);
  body.append("openid_token", openIdToken ?? "");
  const response = await fetchAPI(
    `${meetingPath(slug)}attachments/`,
    { method: "POST", body },
    { redirectOn40x: false },
  );
  return toAttachment((await response.json()) as RawAttachment);
};

/** Creates an empty Docs document owned by the member, for a meeting. */
export const createMeetingDocsDocument = async (
  slug: string,
  title: string,
  openIdToken?: string,
): Promise<ChatMeetingDocument> => {
  const response = await fetchAPI(
    `${meetingPath(slug)}documents/new/`,
    {
      method: "POST",
      body: JSON.stringify({ title, openid_token: openIdToken ?? "" }),
    },
    { redirectOn40x: false },
  );
  return (await response.json()) as ChatMeetingDocument;
};

/** The content of one document of a meeting. */
export const fetchMeetingDocumentFile = async (
  slug: string,
  attachmentId: string,
  openIdToken?: string,
): Promise<Blob> => {
  const response = await fetchAPI(
    `${meetingPath(slug)}attachments/${encodeURIComponent(attachmentId)}/`,
    {
      method: "POST",
      body: JSON.stringify({ openid_token: openIdToken ?? "" }),
    },
    { redirectOn40x: false },
  );
  return response.blob();
};

export type MeetingArchive = {
  blob: Blob;
  fileName: string;
};

/** The file name the server chose, from `Content-Disposition`. */
const fileNameOf = (response: Response, fallback: string): string => {
  const header = response.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Fall back to the plain name.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
};

/**
 * Downloads the archive of a closed meeting. A member who is not its
 * organizer proves their Matrix account with `openIdToken`; `documents` are
 * the links the meeting state lists.
 */
export const fetchMeetingArchive = async (
  slug: string,
  {
    openIdToken,
    documents,
    chatName,
  }: {
    openIdToken?: string;
    documents: ChatMeetingDocument[];
    /** The conversation's name as the member sees it, to name the archive. */
    chatName?: string;
  },
): Promise<MeetingArchive> => {
  const response = await fetchAPI(
    `${meetingPath(slug)}archive/`,
    {
      method: "POST",
      body: JSON.stringify({
        openid_token: openIdToken ?? "",
        // Only web links are listed in the archive.
        documents: documents
          .filter(({ url }) => isWebLink(url))
          .map(({ title, url }) => ({ title, url })),
        chat_name: chatName ?? "",
      }),
    },
    { redirectOn40x: false },
  );
  return {
    blob: await response.blob(),
    fileName: fileNameOf(response, `meeting-${slug}.zip`),
  };
};
