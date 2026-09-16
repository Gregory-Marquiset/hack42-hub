import {
  KnownMembership,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type Thread,
} from "matrix-js-sdk/lib/matrix";
import { describe, expect, it, vi } from "vitest";

import { timelineEventToChatEvent } from "../matrixEventMapping";
import { MatrixDriver } from "../MatrixDriver";
import {
  matrixJoinedRoomToLocalChat,
  MATRIX_FAVOURITE_TAG,
} from "../matrixRoomMapping";

// These unit tests cover only the pure real-time mapping and the send/reaction
// paths that are cheap to assert without a live server.

const initClientMock = vi.hoisted(() => vi.fn());
const startClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/matrix/initMatrix", () => ({
  initClient: initClientMock,
  startClient: startClientMock,
}));

const ROOM_ID = "!room:localhost";
const SELF_ID = "@me:localhost";
const OTHER_ID = "@alice:localhost";
const SENT_EVENT_ID = "$sent:localhost";

type SeedReaction = {
  key: string;
  sender: string;
  id?: string;
};

const makeReactionEvent = (
  targetId: string,
  reaction: SeedReaction,
): MatrixEvent =>
  ({
    getType: () => "m.reaction",
    isRedacted: () => false,
    getId: () => reaction.id ?? `$reaction-${reaction.sender}`,
    getSender: () => reaction.sender,
    getRelation: () => ({
      rel_type: "m.annotation",
      event_id: targetId,
      key: reaction.key,
    }),
  }) as unknown as MatrixEvent;

/** A timeline event shaped just enough for the mapper under test. */
const makeMessageEvent = (opts: {
  sender: string;
  body?: string;
  id?: string;
  type?: string;
  threadRootId?: string;
  isThreadRoot?: boolean;
  relation?: { rel_type: string; event_id: string; key?: string };
  newBody?: string;
  status?: string | null;
  transactionId?: string;
  txnId?: string;
}): MatrixEvent =>
  ({
    getType: () => opts.type ?? "m.room.message",
    isRedacted: () => false,
    getId: () => opts.id ?? "$ev:localhost",
    getSender: () => opts.sender,
    getTs: () => 1_700_000_000_000,
    threadRootId: opts.threadRootId,
    isThreadRoot: opts.isThreadRoot ?? false,
    status: opts.status ?? null,
    getContent: () => ({
      body: opts.body ?? "",
      ...(opts.newBody ? { "m.new_content": { body: opts.newBody } } : {}),
    }),
    getRelation: () => opts.relation ?? null,
    replacingEventId: () => undefined,
    getUnsigned: () =>
      opts.transactionId ? { transaction_id: opts.transactionId } : {},
    getTxnId: () => opts.txnId,
  }) as unknown as MatrixEvent;

const makeRoom = (
  reactionsByEvent: Record<string, SeedReaction[]> = {},
  eventsById: Record<string, MatrixEvent> = {},
  threadsById: Record<string, Thread> = {},
): Room =>
  ({
    roomId: ROOM_ID,
    getMember: (id: string) => ({ name: id === SELF_ID ? "Me" : id }),
    currentState: { maySendRedactionForEvent: () => false },
    getThread: (threadId: string) => threadsById[threadId] ?? null,
    findEventById: (eventId: string) => eventsById[eventId],
    relations: {
      getChildEventsForEvent: (eventId: string) => {
        const reactions = reactionsByEvent[eventId];
        return reactions
          ? {
              getRelations: () =>
                reactions.map((reaction) =>
                  makeReactionEvent(eventId, reaction),
                ),
            }
          : undefined;
      },
    },
  }) as unknown as Room;

const makeThread = (
  threadId: string,
  eventsById: Record<string, MatrixEvent>,
): Thread =>
  ({
    id: threadId,
    rootEvent: eventsById[threadId],
    findEventById: (eventId: string) => eventsById[eventId],
    timelineSet: {
      relations: { getChildEventsForEvent: () => undefined },
    },
  }) as unknown as Thread;

/** Injects a live client without driving the OIDC/`connect` flow. */
const driverWithClient = (mx: MatrixClient | null): MatrixDriver => {
  const driver = new MatrixDriver();
  (driver as unknown as { mx: MatrixClient | null }).mx = mx;
  return driver;
};

describe("timelineEventToChatEvent (real-time sync mapping)", () => {
  it("keeps a thread root on the main timeline", () => {
    const event = makeMessageEvent({
      sender: OTHER_ID,
      body: "hi",
      id: "$x:localhost",
      threadRootId: "$x:localhost",
      isThreadRoot: true,
    });

    expect(timelineEventToChatEvent(event, makeRoom(), SELF_ID)).toEqual([
      {
        type: "message:new",
        chatId: ROOM_ID,
        message: expect.objectContaining({
          id: "$x:localhost",
          authorId: OTHER_ID,
          content: "hi",
        }),
        authors: [expect.objectContaining({ id: OTHER_ID })],
      },
    ]);
  });

  it("delivers the same user's message from another device live", () => {
    const event = makeMessageEvent({
      sender: SELF_ID,
      body: "from Element",
      id: "$elem:localhost",
    });

    expect(
      timelineEventToChatEvent(event, makeRoom(), SELF_ID)[0],
    ).toMatchObject({
      type: "message:new",
      message: { id: "$elem:localhost", authorId: "me" },
    });
  });

  it("suppresses this session's own echo so it is not duplicated", () => {
    const txnTagged = makeMessageEvent({
      sender: SELF_ID,
      body: "mine",
      transactionId: "m1729-1",
    });
    const inFlight = makeMessageEvent({
      sender: SELF_ID,
      body: "mine",
      status: "sending",
    });

    expect(timelineEventToChatEvent(txnTagged, makeRoom(), SELF_ID)).toEqual(
      [],
    );
    expect(timelineEventToChatEvent(inFlight, makeRoom(), SELF_ID)).toEqual([]);
  });

  it("maps an edit (m.replace) to message:updated on the target", () => {
    const targetId = "$target:localhost";
    const original = makeMessageEvent({
      sender: OTHER_ID,
      body: "before",
      id: targetId,
    });
    const event = makeMessageEvent({
      sender: OTHER_ID,
      body: "* edited",
      newBody: "edited",
      relation: { rel_type: "m.replace", event_id: targetId },
    });

    expect(
      timelineEventToChatEvent(
        event,
        makeRoom({}, { [targetId]: original }),
        SELF_ID,
      )[0],
    ).toMatchObject({
      type: "message:updated",
      chatId: ROOM_ID,
      message: { id: targetId, content: "edited" },
    });
  });

  it("ignores an m.replace event sent by somebody other than the author", () => {
    const targetId = "$target:localhost";
    const original = makeMessageEvent({
      sender: OTHER_ID,
      body: "untouched",
      id: targetId,
    });
    const forgedEdit = makeMessageEvent({
      sender: SELF_ID,
      body: "* forged",
      newBody: "forged",
      relation: { rel_type: "m.replace", event_id: targetId },
    });

    expect(
      timelineEventToChatEvent(
        forgedEdit,
        makeRoom({}, { [targetId]: original }),
        SELF_ID,
      ),
    ).toEqual([]);
  });

  it("maps message annotations and live reactions to the generic shape", () => {
    const targetId = "$target:localhost";
    const reactions = {
      [targetId]: [
        { key: "👍", sender: SELF_ID },
        { key: "👍", sender: OTHER_ID },
        { key: "👍", sender: OTHER_ID, id: "$duplicate:localhost" },
      ],
    };
    const room = makeRoom(reactions);
    const message = makeMessageEvent({
      sender: OTHER_ID,
      id: targetId,
      body: "hello",
    });
    const reaction = makeMessageEvent({
      sender: OTHER_ID,
      type: "m.reaction",
      relation: {
        rel_type: "m.annotation",
        event_id: targetId,
        key: "👍",
      },
    });

    expect(timelineEventToChatEvent(message, room, SELF_ID)[0]).toMatchObject({
      type: "message:new",
      message: {
        id: targetId,
        reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
      },
    });
    expect(timelineEventToChatEvent(reaction, room, SELF_ID)).toEqual([
      {
        type: "reaction:updated",
        chatId: ROOM_ID,
        messageId: targetId,
        reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
      },
    ]);
  });

  it("refreshes threads without appending replies to the main timeline", () => {
    const threadReply = makeMessageEvent({
      sender: OTHER_ID,
      body: "reply",
      threadRootId: "$root:localhost",
    });
    const member = makeMessageEvent({
      sender: OTHER_ID,
      type: "m.room.member",
    });

    expect(timelineEventToChatEvent(threadReply, makeRoom(), SELF_ID)).toEqual([
      { type: "threads:changed", chatId: ROOM_ID },
    ]);
    expect(timelineEventToChatEvent(member, makeRoom(), SELF_ID)).toEqual([
      { type: "chat:changed", chatId: ROOM_ID },
    ]);
  });
});

describe("MatrixDriver chat documents", () => {
  const existingDocument = {
    address: "https://docs.example/doc1",
    title: "First document",
    addedBy: OTHER_ID,
  };

  const clientWithDocuments = (content?: unknown, sendStateEvent = vi.fn()) => {
    const room = {
      roomId: ROOM_ID,
      getMyMembership: () => KnownMembership.Join,
      currentState: {
        maySendStateEvent: vi.fn(() => true),
        getStateEvents: vi.fn((type: string) => {
          if (type === "m.room.power_levels") {
            return {
              getContent: () => ({
                users: { [SELF_ID]: 100 },
                events: { "fr.gouv.hub.documents": 1 },
              }),
            } as MatrixEvent;
          }
          return content === undefined
            ? undefined
            : ({ getContent: () => content } as MatrixEvent);
        }),
      },
    } as unknown as Room;
    const mx = {
      getRoom: (id: string) => (id === ROOM_ID ? room : null),
      getUserId: () => SELF_ID,
      sendStateEvent,
    } as unknown as MatrixClient;
    return { driver: driverWithClient(mx), room, sendStateEvent };
  };

  it("reads room documents with the empty state key", async () => {
    const { driver, room } = clientWithDocuments({
      documents: [existingDocument],
    });
    await expect(driver.getChatDocuments(ROOM_ID)).resolves.toEqual([
      existingDocument,
    ]);
    expect(room.currentState.getStateEvents).toHaveBeenCalledWith(
      "fr.gouv.hub.documents",
      "",
    );
  });

  it("returns an empty list only when the state event is absent", async () => {
    const { driver } = clientWithDocuments();
    await expect(driver.getChatDocuments(ROOM_ID)).resolves.toEqual([]);
  });

  it("rejects malformed state instead of overwriting it", async () => {
    const { driver, sendStateEvent } = clientWithDocuments({
      documents: [
        { address: "https://docs.example/doc1", title: "Missing author" },
      ],
    });
    await expect(driver.getChatDocuments(ROOM_ID)).rejects.toThrow(
      /invalid documents room state content/,
    );
    await expect(
      driver.addChatDocument({
        chatId: ROOM_ID,
        address: "https://docs.example/doc2",
        title: "Second document",
      }),
    ).rejects.toThrow(/invalid documents room state content/);
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  it("writes the complete list and derives addedBy from the client", async () => {
    const sendStateEvent = vi.fn(async () => ({}));
    const { driver } = clientWithDocuments(
      { documents: [existingDocument] },
      sendStateEvent,
    );
    const added = await driver.addChatDocument({
      chatId: ROOM_ID,
      address: "https://docs.example/doc2",
      title: "Second document",
    });
    expect(added).toEqual({
      address: "https://docs.example/doc2",
      title: "Second document",
      addedBy: SELF_ID,
    });
    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      "fr.gouv.hub.documents",
      { documents: [existingDocument, added] },
      "",
    );
  });

  it("propagates a failed Matrix write", async () => {
    const sendStateEvent = vi.fn(async () => {
      throw new Error("forbidden");
    });
    const { driver } = clientWithDocuments(undefined, sendStateEvent);
    await expect(
      driver.addChatDocument({
        chatId: ROOM_ID,
        address: "https://docs.example/doc2",
        title: "Second document",
      }),
    ).rejects.toThrow("forbidden");
  });

  it("rejects locally when the current member cannot add documents", async () => {
    const { driver, room, sendStateEvent } = clientWithDocuments({
      documents: [],
    });
    vi.mocked(room.currentState.maySendStateEvent).mockReturnValue(false);

    await expect(
      driver.addChatDocument({
        chatId: ROOM_ID,
        address: "https://docs.example/doc2",
        title: "Second document",
      }),
    ).rejects.toThrow(/cannot add documents/);
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  it("derives read, add and manage capabilities from live room auth", async () => {
    const { driver, room } = clientWithDocuments({ documents: [] });
    vi.mocked(room.currentState.maySendStateEvent).mockImplementation(
      (type: string) => type === "fr.gouv.hub.documents",
    );

    await expect(driver.getChatDocumentCapabilities(ROOM_ID)).resolves.toEqual({
      canRead: true,
      canAdd: true,
      canManageAdders: false,
    });
  });

  it.each([
    { level: 0, canAdd: false, canManageAdders: false },
    { level: 1, canAdd: true, canManageAdders: false },
    { level: 50, canAdd: true, canManageAdders: false },
    { level: 100, canAdd: true, canManageAdders: true },
  ])(
    "maps Matrix level $level to document capabilities",
    async ({ level, canAdd, canManageAdders }) => {
      const { driver, room } = clientWithDocuments({ documents: [] });
      vi.mocked(room.currentState.maySendStateEvent).mockImplementation(
        (type: string) => level >= (type === "fr.gouv.hub.documents" ? 1 : 100),
      );

      await expect(
        driver.getChatDocumentCapabilities(ROOM_ID),
      ).resolves.toEqual({ canRead: true, canAdd, canManageAdders });
    },
  );
});

describe("MatrixDriver document contributor management", () => {
  const makeClient = (
    targetPowerLevel: number,
    targetExplicitLevel?: number,
    canManage = true,
  ) => {
    const sendStateEvent = vi.fn(async () => ({}));
    const powerLevelContent = {
      users: {
        [SELF_ID]: 100,
        ...(targetExplicitLevel === undefined
          ? {}
          : { [OTHER_ID]: targetExplicitLevel }),
      },
      events: { "m.room.name": 50, "m.room.power_levels": 100 },
      state_default: 50,
    };
    const target = {
      userId: OTHER_ID,
      membership: KnownMembership.Join,
      powerLevel: targetPowerLevel,
    };
    const room = {
      roomId: ROOM_ID,
      getMyMembership: () => KnownMembership.Join,
      loadMembersIfNeeded: vi.fn(async () => undefined),
      getMember: (id: string) => (id === OTHER_ID ? target : null),
      currentState: {
        maySendStateEvent: (type: string) =>
          canManage && type === "m.room.power_levels",
        getStateEvents: () => ({ getContent: () => powerLevelContent }),
      },
    } as unknown as Room;
    const mx = {
      getRoom: (id: string) => (id === ROOM_ID ? room : null),
      getUserId: () => SELF_ID,
      sendStateEvent,
    } as unknown as MatrixClient;
    return { driver: driverWithClient(mx), sendStateEvent };
  };

  it("grants only level 1 while preserving the complete room policy", async () => {
    const { driver, sendStateEvent } = makeClient(0);
    await driver.setChatMemberDocumentAddPermission({
      chatId: ROOM_ID,
      userId: OTHER_ID,
      canAdd: true,
    });

    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      "m.room.power_levels",
      expect.objectContaining({
        users: { [SELF_ID]: 100, [OTHER_ID]: 1 },
        events: {
          "m.room.name": 50,
          "m.room.power_levels": 100,
          "fr.gouv.hub.documents": 1,
        },
        state_default: 50,
      }),
      "",
    );
  });

  it("revokes only an explicit level-1 grant", async () => {
    const { driver, sendStateEvent } = makeClient(1, 1);
    await driver.setChatMemberDocumentAddPermission({
      chatId: ROOM_ID,
      userId: OTHER_ID,
      canAdd: false,
    });
    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      "m.room.power_levels",
      expect.objectContaining({ users: { [SELF_ID]: 100 } }),
      "",
    );
  });

  it("never downgrades a moderator through the document control", async () => {
    const { driver, sendStateEvent } = makeClient(50, 50);
    await expect(
      driver.setChatMemberDocumentAddPermission({
        chatId: ROOM_ID,
        userId: OTHER_ID,
        canAdd: false,
      }),
    ).rejects.toThrow(/only an explicit document-contributor grant/);
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  it("rejects a grant before writing when the caller is not an admin", async () => {
    const { driver, sendStateEvent } = makeClient(0, undefined, false);
    await expect(
      driver.setChatMemberDocumentAddPermission({
        chatId: ROOM_ID,
        userId: OTHER_ID,
        canAdd: true,
      }),
    ).rejects.toThrow(/cannot manage document contributors/);
    expect(sendStateEvent).not.toHaveBeenCalled();
  });
});

describe("MatrixDriver room document policy", () => {
  it("creates new rooms with the document event at contributor level", async () => {
    const createRoom = vi.fn(async () => ({ room_id: ROOM_ID }));
    const mx = {
      getUserId: () => SELF_ID,
      getJoinedRooms: vi.fn(async () => ({ joined_rooms: [] })),
      createRoom,
    } as unknown as MatrixClient;
    const driver = driverWithClient(mx);
    vi.spyOn(driver, "getChatForUsers").mockResolvedValue(null);
    vi.spyOn(
      driver as unknown as { waitForRoom: () => Promise<Room | null> },
      "waitForRoom",
    ).mockResolvedValue(null);

    await driver.createChatForUsers([OTHER_ID, "@bob:localhost"]);

    expect(createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        power_level_content_override: {
          events: { "fr.gouv.hub.documents": 1 },
        },
      }),
    );
  });
});

describe("MatrixDriver.sendChatMessage", () => {
  it("sends the text and returns the message under the real server id", async () => {
    const room = makeRoom();
    const sendTextMessage = vi.fn(async () => ({ event_id: SENT_EVENT_ID }));
    const mx = {
      getRoom: (id: string) => (id === ROOM_ID ? room : null),
      sendTextMessage,
    } as unknown as MatrixClient;

    const message = await driverWithClient(mx).sendChatMessage({
      chatId: ROOM_ID,
      content: "bonjour",
    });

    expect(sendTextMessage).toHaveBeenCalledWith(ROOM_ID, "bonjour");
    expect(message).toMatchObject({
      id: SENT_EVENT_ID,
      authorId: "me",
      content: "bonjour",
    });
  });

  it("throws when the client is not connected", async () => {
    await expect(
      driverWithClient(null).sendChatMessage({
        chatId: ROOM_ID,
        content: "x",
      }),
    ).rejects.toThrow(/not connected/);
  });
});

describe("MatrixDriver room metadata", () => {
  it("maps m.favourite to the favourites section", () => {
    const room = {
      roomId: ROOM_ID,
      tags: { [MATRIX_FAVOURITE_TAG]: {} },
      getMembers: () => [
        {
          userId: OTHER_ID,
          name: "Alice",
          membership: KnownMembership.Join,
        },
      ],
      getLastActiveTimestamp: () => 0,
      currentState: { getStateEvents: () => undefined },
    } as unknown as Room;

    expect(matrixJoinedRoomToLocalChat(room, SELF_ID).section).toBe(
      "favourites",
    );
  });

  it("sets and deletes the Matrix favourite tag", async () => {
    const room = {
      roomId: ROOM_ID,
      tags: {},
    } as unknown as Room;
    const setRoomTag = vi.fn(async () => ({}));
    const deleteRoomTag = vi.fn(async () => ({}));
    const mx = {
      getRoom: () => room,
      getJoinedRooms: async () => ({ joined_rooms: [ROOM_ID] }),
      setRoomTag,
      deleteRoomTag,
    } as unknown as MatrixClient;
    const driver = driverWithClient(mx);

    await driver.setChatFavourite(ROOM_ID, true);
    expect(setRoomTag).toHaveBeenCalledWith(ROOM_ID, MATRIX_FAVOURITE_TAG, {});

    room.tags[MATRIX_FAVOURITE_TAG] = {};
    await driver.setChatFavourite(ROOM_ID, false);
    expect(deleteRoomTag).toHaveBeenCalledWith(ROOM_ID, MATRIX_FAVOURITE_TAG);
  });

  it("hydrates and splits joined and invited room members", async () => {
    const loadMembersIfNeeded = vi.fn(async () => true);
    const room = {
      roomId: ROOM_ID,
      currentState: {
        getStateEvents: () => ({
          getContent: () => ({ users: { [OTHER_ID]: 1 } }),
        }),
      },
      loadMembersIfNeeded,
      getMembers: () => [
        {
          userId: OTHER_ID,
          name: "Alice",
          membership: KnownMembership.Join,
          powerLevel: 1,
        },
        {
          userId: SELF_ID,
          name: "Me",
          membership: KnownMembership.Join,
          powerLevel: 100,
        },
        {
          userId: "@bob:localhost",
          name: "Bob",
          membership: KnownMembership.Invite,
          powerLevel: 0,
        },
        {
          userId: "@left:localhost",
          name: "Left",
          membership: KnownMembership.Leave,
          powerLevel: 0,
        },
      ],
    } as unknown as Room;
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      getJoinedRooms: async () => ({ joined_rooms: [ROOM_ID] }),
    } as unknown as MatrixClient;

    const members = await driverWithClient(mx).getChatMembers(ROOM_ID);

    expect(loadMembersIfNeeded).toHaveBeenCalledOnce();
    expect(members.present.map((member) => member.id)).toEqual([
      SELF_ID,
      OTHER_ID,
    ]);
    expect(members.pendingInvites.map((member) => member.id)).toEqual([
      "@bob:localhost",
    ]);
    expect(members.present).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OTHER_ID,
          documentAddPermission: "delegated",
        }),
        expect.objectContaining({
          id: SELF_ID,
          documentAddPermission: "inherited",
        }),
      ]),
    );
  });
});

describe("MatrixDriver.toggleChatReaction", () => {
  it("sends an annotation when the current user has not reacted", async () => {
    const messageId = "$message:localhost";
    const message = makeMessageEvent({ sender: OTHER_ID, id: messageId });
    // The SDK relation cache may retain a redacted local echo. The empty
    // server response remains authoritative and must take the add branch.
    const room = makeRoom(
      {
        [messageId]: [{ key: "👍", sender: SELF_ID, id: "$stale:localhost" }],
      },
      { [messageId]: message },
    );
    const sendEvent = vi.fn(async () => ({ event_id: "$reaction:localhost" }));
    const redactEvent = vi.fn();
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      relations: vi.fn(async () => ({ events: [] })),
      sendEvent,
      redactEvent,
    } as unknown as MatrixClient;

    const updated = await driverWithClient(mx).toggleChatReaction({
      chatId: ROOM_ID,
      messageId,
      emoji: "👍",
    });

    expect(sendEvent).toHaveBeenCalledWith(ROOM_ID, "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: messageId,
        key: "👍",
      },
    });
    expect(redactEvent).not.toHaveBeenCalled();
    expect(updated.reactions).toEqual([
      { emoji: "👍", count: 1, reactedByMe: true },
    ]);
  });

  it("redacts the current user's existing annotation", async () => {
    const messageId = "$message:localhost";
    const reactionId = "$own-reaction:localhost";
    const message = makeMessageEvent({ sender: OTHER_ID, id: messageId });
    const room = makeRoom(
      {
        [messageId]: [{ key: "👍", sender: SELF_ID, id: reactionId }],
      },
      { [messageId]: message },
    );
    const redactEvent = vi.fn(async () => ({ event_id: "$redaction" }));
    const ownReaction = makeReactionEvent(messageId, {
      key: "👍",
      sender: SELF_ID,
      id: reactionId,
    });
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      relations: vi.fn(async () => ({ events: [ownReaction] })),
      redactEvent,
    } as unknown as MatrixClient;

    const updated = await driverWithClient(mx).toggleChatReaction({
      chatId: ROOM_ID,
      messageId,
      emoji: "👍",
    });

    expect(redactEvent).toHaveBeenCalledWith(ROOM_ID, reactionId);
    expect(updated.reactions).toEqual([]);
  });

  it("sends a thread-scoped annotation for a reply", async () => {
    const threadId = "$thread:localhost";
    const messageId = "$reply:localhost";
    const root = makeMessageEvent({
      sender: OTHER_ID,
      id: threadId,
      threadRootId: threadId,
      isThreadRoot: true,
    });
    const reply = makeMessageEvent({
      sender: OTHER_ID,
      id: messageId,
      threadRootId: threadId,
    });
    const events = { [threadId]: root, [messageId]: reply };
    const thread = makeThread(threadId, events);
    const room = makeRoom({}, events, { [threadId]: thread });
    const sendEvent = vi.fn(async () => ({ event_id: "$reaction:localhost" }));
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      relations: vi.fn(async () => ({ events: [] })),
      sendEvent,
    } as unknown as MatrixClient;

    const updated = await driverWithClient(mx).toggleChatThreadReaction({
      chatId: ROOM_ID,
      threadId,
      messageId,
      emoji: "👍",
    });

    expect(sendEvent).toHaveBeenCalledWith(ROOM_ID, threadId, "m.reaction", {
      "m.relates_to": {
        rel_type: "m.annotation",
        event_id: messageId,
        key: "👍",
      },
    });
    expect(updated.reactions).toEqual([
      { emoji: "👍", count: 1, reactedByMe: true },
    ]);
  });
});
