import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk/lib/matrix";
import { afterEach, describe, expect, it, vi } from "vitest";

import { encryptAttachment } from "../matrixAttachments";
import {
  chatFileFromEvent,
  downloadRoomFile,
  listRoomFiles,
  uploadRoomFile,
} from "../matrixRoomFiles";

type RawEvent = {
  event_id?: string;
  type: string;
  sender?: string;
  origin_server_ts?: number;
  content: Record<string, unknown>;
  redacted?: boolean;
};

const ROOM_ID = "!room:localhost";
const TS = Date.UTC(2026, 8, 17, 10, 0);

/** Just what the helpers read from an SDK event. */
const toEvent = (raw: RawEvent) =>
  ({
    getType: () => raw.type,
    isRedacted: () => raw.redacted ?? false,
    getContent: () => raw.content,
    getId: () => raw.event_id,
    getSender: () => raw.sender,
    getTs: () => raw.origin_server_ts ?? TS,
  }) as unknown as MatrixEvent;

const room = {
  roomId: ROOM_ID,
  getMember: (userId: string) =>
    userId === "@alice:localhost" ? { name: "Alice" } : null,
} as unknown as Room;

const fileEvent = (id: string, content: Record<string, unknown>): RawEvent => ({
  event_id: id,
  type: "m.room.message",
  sender: "@alice:localhost",
  content,
});

describe("chatFileFromEvent", () => {
  it("reads a clear document", () => {
    const event = toEvent(
      fileEvent("$1", {
        msgtype: "m.file",
        body: "cr.pdf",
        filename: "compte-rendu.pdf",
        info: { size: 1200, mimetype: "application/pdf" },
        url: "mxc://localhost/a",
      }),
    );

    expect(chatFileFromEvent(event, room)).toEqual({
      id: "$1",
      name: "compte-rendu.pdf",
      size: 1200,
      mimeType: "application/pdf",
      senderId: "@alice:localhost",
      senderName: "Alice",
      sentAt: new Date(TS).toISOString(),
      isEncrypted: false,
    });
  });

  it("reads an encrypted image", () => {
    const event = toEvent(
      fileEvent("$2", {
        msgtype: "m.image",
        body: "photo.png",
        file: { url: "mxc://localhost/b" },
      }),
    );

    expect(chatFileFromEvent(event, room)).toMatchObject({
      id: "$2",
      name: "photo.png",
      isEncrypted: true,
    });
  });

  it.each([
    ["a text message", fileEvent("$3", { msgtype: "m.text", body: "hi" })],
    ["a file without media", fileEvent("$4", { msgtype: "m.file", body: "x" })],
    [
      "a redacted file",
      {
        ...fileEvent("$5", { msgtype: "m.file", url: "mxc://a/b" }),
        redacted: true,
      },
    ],
    [
      "another event type",
      { ...fileEvent("$6", { url: "mxc://a/b" }), type: "m.room.topic" },
    ],
  ])("ignores %s", (_label, raw) => {
    expect(chatFileFromEvent(toEvent(raw as RawEvent), room)).toBeNull();
  });
});

describe("room files", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const client = (overrides: Partial<Record<keyof MatrixClient, unknown>>) =>
    ({
      getUserId: () => "@alice:localhost",
      getEventMapper: () => toEvent,
      decryptEventIfNeeded: vi.fn(async () => {}),
      ...overrides,
    }) as unknown as MatrixClient;

  it("lists the documents page after page, newest first", async () => {
    const createMessagesRequest = vi
      .fn()
      .mockResolvedValueOnce({
        chunk: [
          fileEvent("$new", { msgtype: "m.file", body: "b", url: "mxc://a/b" }),
          fileEvent("$txt", { msgtype: "m.text", body: "hello" }),
        ],
        end: "t2",
      })
      .mockResolvedValueOnce({
        chunk: [
          fileEvent("$old", { msgtype: "m.file", body: "a", url: "mxc://a/a" }),
        ],
      });
    const mx = client({ createMessagesRequest });

    const files = await listRoomFiles(mx, room, false);

    expect(files.map((file) => file.id)).toEqual(["$new", "$old"]);
    expect(createMessagesRequest).toHaveBeenCalledTimes(2);
    expect(createMessagesRequest.mock.calls[1][1]).toBe("t2");
    const filter = createMessagesRequest.mock.calls[0][4];
    expect(filter.getDefinition().room.timeline).toEqual({
      types: ["m.room.message"],
      contains_url: true,
    });
  });

  it("asks an encrypted room for its encrypted events too", async () => {
    const createMessagesRequest = vi.fn().mockResolvedValue({ chunk: [] });

    await listRoomFiles(client({ createMessagesRequest }), room, true);

    const filter = createMessagesRequest.mock.calls[0][4];
    expect(filter.getDefinition().room.timeline).toEqual({
      types: ["m.room.message", "m.room.encrypted"],
    });
  });

  it("uploads a clear document and posts it", async () => {
    const uploadContent = vi.fn(async () => ({ content_uri: "mxc://a/c" }));
    const sendMessage = vi.fn(async () => ({ event_id: "$sent" }));
    const file = new File(["contenu"], "notes.txt", { type: "text/plain" });

    const shared = await uploadRoomFile(
      client({ uploadContent, sendMessage }),
      room,
      file,
      false,
    );

    expect(uploadContent).toHaveBeenCalledWith(file, {
      name: "notes.txt",
      type: "text/plain",
    });
    expect(sendMessage).toHaveBeenCalledWith(ROOM_ID, {
      msgtype: "m.file",
      body: "notes.txt",
      filename: "notes.txt",
      info: { size: 7, mimetype: "text/plain" },
      url: "mxc://a/c",
    });
    expect(shared).toMatchObject({
      id: "$sent",
      name: "notes.txt",
      senderName: "Alice",
      isEncrypted: false,
    });
  });

  it("encrypts a document before uploading it to an encrypted room", async () => {
    const uploadContent = vi.fn(async () => ({ content_uri: "mxc://a/d" }));
    const sendMessage = vi.fn(async () => ({ event_id: "$sent" }));
    const file = new File(["secret"], "secret.txt", { type: "text/plain" });

    const shared = await uploadRoomFile(
      client({ uploadContent, sendMessage }),
      room,
      file,
      true,
    );

    const [blob, options] = uploadContent.mock.calls[0] as unknown as [
      Blob,
      object,
    ];
    expect(options).toEqual({
      type: "application/octet-stream",
      includeFilename: false,
    });
    expect(blob.size).toBe(6);
    const content = (sendMessage.mock.calls[0] as unknown[])[1] as {
      url?: string;
      file: { url: string; v: string };
    };
    expect(content.url).toBeUndefined();
    expect(content.file).toMatchObject({ url: "mxc://a/d", v: "v2" });
    expect(shared.isEncrypted).toBe(true);
  });

  it("downloads and decrypts an encrypted document", async () => {
    const { data, info } = await encryptAttachment(
      new TextEncoder().encode("secret").buffer,
    );
    const fetchRoomEvent = vi.fn(async () =>
      fileEvent("$enc", {
        msgtype: "m.file",
        body: "secret.txt",
        info: { mimetype: "text/plain" },
        file: { ...info, url: "mxc://a/e" },
      }),
    );
    const mxcUrlToHttp = vi.fn(() => "https://hs/_matrix/client/v1/media/e");
    const fetchMock = vi.fn(async () => new Response(data));
    vi.stubGlobal("fetch", fetchMock);

    const blob = await downloadRoomFile(
      client({
        fetchRoomEvent,
        mxcUrlToHttp,
        getAccessToken: () => "token",
      }),
      ROOM_ID,
      "$enc",
    );

    expect(fetchRoomEvent).toHaveBeenCalledWith(ROOM_ID, "$enc");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hs/_matrix/client/v1/media/e",
      { headers: { Authorization: "Bearer token" } },
    );
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("secret");
  });

  it("reports a failed download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    const mx = client({
      fetchRoomEvent: async () =>
        fileEvent("$f", { msgtype: "m.file", url: "mxc://a/f" }),
      mxcUrlToHttp: () => "https://hs/media/f",
      getAccessToken: () => null,
    });

    await expect(downloadRoomFile(mx, ROOM_ID, "$f")).rejects.toThrow("404");
  });
});
