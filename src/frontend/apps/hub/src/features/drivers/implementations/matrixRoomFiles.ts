/**
 * The documents of a room are its file messages (`m.file` and the other media
 * types), as in any Matrix client: Element shows them too. In an encrypted
 * room, the file itself is encrypted before it leaves the browser.
 */
import {
  Direction,
  Filter,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk/lib/matrix";
import type { RoomMessageEventContent } from "matrix-js-sdk/lib/types";

import type { ChatFile } from "../types";

import {
  decryptAttachment,
  type EncryptedFile,
  encryptAttachment,
} from "./matrixAttachments";

const FILE_MSGTYPES = new Set(["m.file", "m.image", "m.video", "m.audio"]);
/** How far back the documents are looked for. */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

type FileContent = {
  msgtype?: string;
  body?: string;
  filename?: string;
  info?: { size?: number; mimetype?: string };
  url?: string;
  file?: EncryptedFile;
};

/** The document a room event carries, or `null` for any other event. */
export const chatFileFromEvent = (
  event: MatrixEvent,
  room: Room | null,
): ChatFile | null => {
  if (event.getType() !== "m.room.message" || event.isRedacted()) {
    return null;
  }
  const content = event.getContent<FileContent>();
  if (!content.msgtype || !FILE_MSGTYPES.has(content.msgtype)) {
    return null;
  }
  if (!content.url && !content.file?.url) {
    return null;
  }
  const id = event.getId();
  const senderId = event.getSender();
  if (!id || !senderId) {
    return null;
  }
  return {
    id,
    name: content.filename || content.body || "document",
    ...(typeof content.info?.size === "number"
      ? { size: content.info.size }
      : {}),
    ...(content.info?.mimetype ? { mimeType: content.info.mimetype } : {}),
    senderId,
    senderName: room?.getMember(senderId)?.name ?? senderId,
    sentAt: new Date(event.getTs()).toISOString(),
    isEncrypted: Boolean(content.file),
  };
};

const toEvent = async (
  mx: MatrixClient,
  raw: Parameters<ReturnType<MatrixClient["getEventMapper"]>>[0],
): Promise<MatrixEvent> => {
  const event = mx.getEventMapper()(raw);
  await mx.decryptEventIfNeeded(event);
  return event;
};

/** The room's documents, newest first, from its recent history. */
export const listRoomFiles = async (
  mx: MatrixClient,
  room: Room,
  encrypted: boolean,
): Promise<ChatFile[]> => {
  const filter = new Filter(mx.getUserId());
  // Encrypted messages only reveal their type once decrypted: the server can
  // only narrow a clear room.
  filter.setDefinition({
    room: {
      timeline: encrypted
        ? { types: ["m.room.message", "m.room.encrypted"] }
        : { types: ["m.room.message"], contains_url: true },
    },
  });

  const files: ChatFile[] = [];
  let from: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await mx.createMessagesRequest(
      room.roomId,
      from,
      PAGE_SIZE,
      Direction.Backward,
      filter,
    );
    const events = await Promise.all(
      response.chunk.map((raw) => toEvent(mx, raw)),
    );
    for (const event of events) {
      const file = chatFileFromEvent(event, room);
      if (file) {
        files.push(file);
      }
    }
    if (!response.end || response.chunk.length === 0) {
      break;
    }
    from = response.end;
  }
  return files;
};

/** Uploads a document from the user's device and posts it in the room. */
export const uploadRoomFile = async (
  mx: MatrixClient,
  room: Room,
  file: File,
  encrypted: boolean,
): Promise<ChatFile> => {
  const info = {
    size: file.size,
    mimetype: file.type || "application/octet-stream",
  };
  let media: Pick<FileContent, "url" | "file">;
  if (encrypted) {
    const { data, info: encryption } = await encryptAttachment(
      await file.arrayBuffer(),
    );
    const { content_uri: url } = await mx.uploadContent(
      new Blob([data], { type: "application/octet-stream" }),
      { type: "application/octet-stream", includeFilename: false },
    );
    media = { file: { ...encryption, url } };
  } else {
    const { content_uri: url } = await mx.uploadContent(file, {
      name: file.name,
      type: info.mimetype,
    });
    media = { url };
  }

  const { event_id: id } = await mx.sendMessage(room.roomId, {
    msgtype: "m.file",
    body: file.name,
    filename: file.name,
    info,
    ...media,
  } as RoomMessageEventContent);

  const senderId = mx.getUserId() ?? "";
  return {
    id,
    name: file.name,
    size: info.size,
    mimeType: info.mimetype,
    senderId,
    senderName: room.getMember(senderId)?.name ?? senderId,
    sentAt: new Date().toISOString(),
    isEncrypted: encrypted,
  };
};

/**
 * Downloads a document: the media server needs the account's token, and an
 * encrypted file is decrypted in the browser.
 */
export const downloadRoomFile = async (
  mx: MatrixClient,
  roomId: string,
  fileId: string,
): Promise<Blob> => {
  const event = await toEvent(mx, await mx.fetchRoomEvent(roomId, fileId));
  const content = event.getContent<FileContent>();
  const mxc = content.file?.url ?? content.url;
  if (!mxc) {
    throw new Error(`MatrixDriver: "${fileId}" carries no file.`);
  }
  const httpUrl = mx.mxcUrlToHttp(
    mxc,
    undefined,
    undefined,
    undefined,
    false,
    true,
    true,
  );
  if (!httpUrl) {
    throw new Error(`MatrixDriver: "${mxc}" cannot be downloaded.`);
  }
  const token = mx.getAccessToken();
  const response = await fetch(httpUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`MatrixDriver: download failed (${response.status}).`);
  }
  const type = content.info?.mimetype ?? "application/octet-stream";
  const data = await response.arrayBuffer();
  if (content.file) {
    return new Blob([await decryptAttachment(data, content.file)], { type });
  }
  return new Blob([data], { type });
};
