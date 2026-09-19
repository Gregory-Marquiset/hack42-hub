// @vitest-environment jsdom
import {
  KnownMembership,
  type MatrixClient,
  type MatrixEvent,
  PushRuleActionName,
  PushRuleKind,
  type Room,
  type Thread,
} from "matrix-js-sdk/lib/matrix";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  lastMainTimelinePreview,
  matrixEventToChatMessage,
  timelineEventToChatEvent,
} from "../matrixEventMapping";
import { LazyMatrixDriver } from "../LazyMatrixDriver";
import { MatrixDriver } from "../MatrixDriver";
import { readChatSelfPresencePreference } from "../../presencePreference";
import { MEETING_EVENT_TYPE } from "../matrixMeetingMapping";
import { MeetingEndedError, MeetingNotAllowedError } from "../../meetingErrors";
import type { MeetRoom, MeetRoomSchedule } from "../../types";
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
    // Read for every message: an undecryptable one gets its own tombstone.
    isDecryptionFailure: () => false,
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
  undecryptable?: boolean;
}): MatrixEvent =>
  ({
    getType: () => opts.type ?? "m.room.message",
    isRedacted: () => false,
    // Read for every message: an undecryptable one gets its own tombstone.
    isDecryptionFailure: () => opts.undecryptable ?? false,
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
    // Read by the room mapper on every joined room; a fixture without it
    // throws instead of describing a clear room.
    hasEncryptionStateEvent: () => false,
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

/**
 * A joined room with the fields the room mapper reads, for lookup tests: who
 * else is in it and whether it is encrypted are the two facts that matter.
 */
const makeJoinedRoom = (
  roomId: string,
  otherIds: string[],
  encrypted: boolean,
): Room =>
  ({
    roomId,
    tags: {},
    // Read by the joined-room filter: a space is not a conversation.
    isSpaceRoom: () => false,
    getMyMembership: () => KnownMembership.Join,
    getMember: (id: string) => ({ name: id }),
    getMembers: () =>
      otherIds.map((userId) => ({
        userId,
        name: userId,
        membership: KnownMembership.Join,
        getMxcAvatarUrl: () => undefined,
      })),
    getLastActiveTimestamp: () => 0,
    currentState: { getStateEvents: () => undefined },
    getLiveTimeline: () => ({ getEvents: () => [] }),
    getMxcAvatarUrl: () => null,
    hasEncryptionStateEvent: () => encrypted,
  }) as unknown as Room;

/** Injects a live client without driving the OIDC/`connect` flow. */
const driverWithClient = (mx: MatrixClient | null): MatrixDriver => {
  const driver = new MatrixDriver();
  (driver as unknown as { mx: MatrixClient | null }).mx = mx;
  return driver;
};

beforeEach(() => {
  localStorage.clear();
  startClientMock.mockReset();
  startClientMock.mockResolvedValue(undefined);
});

describe("an undecryptable message", () => {
  it("is flagged and stripped of the SDK's diagnostic", () => {
    // The SDK puts its whole English explanation in the body. It is neither
    // readable nor translatable, so the UI must never receive it.
    const event = makeMessageEvent({
      sender: OTHER_ID,
      body: "** Unable to decrypt: DecryptionError: no key backup **",
      undecryptable: true,
    });

    const message = matrixEventToChatMessage(event, makeRoom(), SELF_ID);

    expect(message.isUndecryptable).toBe(true);
    expect(message.content).toBe("");
  });

  it("is skipped by the conversation list preview, like a deleted one", () => {
    // The newest event is the unreadable one; the row falls back to the last
    // message it can actually show rather than printing the diagnostic.
    const events = [
      makeMessageEvent({ sender: OTHER_ID, body: "lisible", id: "$a" }),
      makeMessageEvent({
        sender: OTHER_ID,
        body: "** Unable to decrypt **",
        id: "$b",
        undecryptable: true,
      }),
    ];
    const room = {
      getLiveTimeline: () => ({ getEvents: () => events }),
      getMember: (id: string) => ({ name: id }),
    } as unknown as Room;

    expect(lastMainTimelinePreview(room, SELF_ID)?.text).toBe("lisible");
  });
});

describe("MatrixDriver.resolveAvatarUrl", () => {
  const clientFor = (thumbnail: number, download: number) => {
    const mxcUrlToHttp = vi.fn((_mxc: string, width?: number) =>
      width ? "https://hs/thumbnail" : "https://hs/download",
    );
    // Typed rather than taking an unused `init` parameter: the assertions
    // below read the headers off the recorded call.
    const fetchMock = vi.fn<
      (
        url: string,
        init?: { headers?: Record<string, string> },
      ) => Promise<{ ok: boolean; blob: () => Promise<Blob> }>
    >(async (url) => ({
      ok: (url === "https://hs/thumbnail" ? thumbnail : download) < 400,
      blob: async () => new Blob(["x"]),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:avatar"),
    });
    const mx = {
      mxcUrlToHttp,
      getAccessToken: () => "token",
    } as unknown as MatrixClient;
    return { mx, fetchMock, mxcUrlToHttp };
  };

  it("asks for a thumbnail first, authenticated", async () => {
    const { mx, fetchMock } = clientFor(200, 200);

    await expect(
      driverWithClient(mx).resolveAvatarUrl("mxc://hs/a"),
    ).resolves.toBe("blob:avatar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://hs/thumbnail");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer token" },
    });
  });

  it("falls back to the file when the homeserver cannot thumbnail it", async () => {
    // Synapse answers 400 "Cannot find any thumbnails for the requested
    // media" for an SVG, which used to leave the avatar permanently blank.
    const { mx, fetchMock } = clientFor(400, 200);

    await expect(
      driverWithClient(mx).resolveAvatarUrl("mxc://hs/a"),
    ).resolves.toBe("blob:avatar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://hs/download");
  });

  it("hands back the mxc url when neither answers, so the row falls back", async () => {
    const { mx } = clientFor(400, 404);

    await expect(
      driverWithClient(mx).resolveAvatarUrl("mxc://hs/a"),
    ).resolves.toBe("mxc://hs/a");
  });
});

describe("MatrixDriver.getUserPresence", () => {
  it("reads the current presence from the Matrix client store", () => {
    const getUser = vi.fn((userId: string) =>
      userId === OTHER_ID
        ? {
            userId: OTHER_ID,
            events: {
              presence: { getContent: () => ({ presence: "online" }) },
            },
          }
        : null,
    );
    const mx = { getUser } as unknown as MatrixClient;

    expect(driverWithClient(mx).getUserPresence(OTHER_ID)).toEqual({
      userId: OTHER_ID,
      state: "online",
    });
    expect(getUser).toHaveBeenCalledWith(OTHER_ID);
  });

  it("returns null without a connected client or known user", () => {
    expect(driverWithClient(null).getUserPresence(OTHER_ID)).toBeNull();
    expect(
      driverWithClient({
        getUser: () => null,
      } as unknown as MatrixClient).getUserPresence(OTHER_ID),
    ).toBeNull();
  });
});

describe("MatrixDriver.fetchUserPresence", () => {
  it("maps the homeserver's own answer when the store is empty", async () => {
    const getPresence = vi.fn(async () => ({ presence: "offline" }));
    const mx = { getPresence } as unknown as MatrixClient;

    await expect(
      driverWithClient(mx).fetchUserPresence(OTHER_ID),
    ).resolves.toEqual({ userId: OTHER_ID, state: "offline" });
    expect(getPresence).toHaveBeenCalledWith(OTHER_ID);
  });

  it("stays quiet when the server refuses or answers nonsense", async () => {
    const refusing = {
      getPresence: async () => {
        throw new Error("M_FORBIDDEN");
      },
    } as unknown as MatrixClient;
    const nonsense = {
      getPresence: async () => ({ presence: "dancing" }),
    } as unknown as MatrixClient;

    await expect(
      driverWithClient(refusing).fetchUserPresence(OTHER_ID),
    ).resolves.toBeNull();
    await expect(
      driverWithClient(nonsense).fetchUserPresence(OTHER_ID),
    ).resolves.toBeNull();
    await expect(
      driverWithClient(null).fetchUserPresence(OTHER_ID),
    ).resolves.toBeNull();
  });
});

describe("MatrixDriver.setUserPresence", () => {
  it.each(["online", "unavailable", "offline"] as const)(
    "makes Matrix %s authoritative for subsequent syncs",
    async (state) => {
      const setSyncPresence = vi.fn().mockResolvedValue(undefined);
      const setPresence = vi.fn().mockResolvedValue(undefined);
      const mx = {
        getUserId: () => OTHER_ID,
        setSyncPresence,
        setPresence,
      } as unknown as MatrixClient;
      const driver = driverWithClient(mx);

      expect(driver.getCurrentUserId()).toBe(OTHER_ID);
      await driver.setUserPresence(state);

      expect(setSyncPresence).toHaveBeenCalledWith(state);
      expect(setPresence).not.toHaveBeenCalled();
    },
  );

  it("deduplicates an unchanged effective state", async () => {
    const setSyncPresence = vi.fn().mockResolvedValue(undefined);
    const driver = driverWithClient({
      setSyncPresence,
    } as unknown as MatrixClient);

    await driver.setUserPresence("online");
    await driver.setUserPresence("online");

    expect(setSyncPresence.mock.calls).toEqual([["online"]]);
  });

  it("rejects a non-standard busy state before calling the SDK", async () => {
    const setSyncPresence = vi.fn().mockResolvedValue(undefined);
    const setPresence = vi.fn().mockResolvedValue(undefined);
    const driver = driverWithClient({
      setSyncPresence,
      setPresence,
    } as unknown as MatrixClient);

    await expect(driver.setUserPresence("busy" as never)).rejects.toThrowError(
      'invalid state "busy"',
    );
    expect(setSyncPresence).not.toHaveBeenCalled();
    expect(setPresence).not.toHaveBeenCalled();
  });

  it("rejects when the Matrix account is not connected", async () => {
    const driver = driverWithClient(null);

    expect(driver.getCurrentUserId()).toBeNull();
    await expect(driver.setUserPresence("online")).rejects.toThrowError(
      "client is not connected",
    );
  });
});

describe("MatrixDriver busy preference", () => {
  it("publishes the closest standard value and keeps busy locally", async () => {
    // Matrix has no "busy". It is the local preference that silences
    // notification sounds, so it must survive as itself - while what the
    // homeserver hears is a value it understands.
    const setSyncPresence = vi.fn().mockResolvedValue(undefined);
    const setPresence = vi.fn().mockResolvedValue(undefined);
    const driver = driverWithClient({
      setSyncPresence,
      setPresence,
    } as unknown as MatrixClient);

    await driver.setSelfPresencePreference("busy");

    expect(setSyncPresence).toHaveBeenCalledWith("unavailable");
    expect(setPresence).toHaveBeenCalledWith({ presence: "unavailable" });
    expect(readChatSelfPresencePreference("matrix-local")).toBe("busy");
    expect(driver.getSelfPresencePreference()).toBe("busy");
  });
});

describe("MatrixDriver self-presence preference", () => {
  it.each(["online", "offline"] as const)(
    "persists and applies the manual %s preference",
    async (preference) => {
      const setSyncPresence = vi.fn().mockResolvedValue(undefined);
      const setPresence = vi.fn().mockResolvedValue(undefined);
      const driver = driverWithClient({
        setSyncPresence,
        setPresence,
      } as unknown as MatrixClient);

      await driver.setSelfPresencePreference(preference);

      expect(readChatSelfPresencePreference("matrix-local")).toBe(preference);
      expect(setSyncPresence).toHaveBeenCalledWith(preference);
      expect(setPresence).toHaveBeenCalledWith({ presence: preference });
    },
  );

  it("keeps the sync intention and preference when the immediate PUT fails", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const setSyncPresence = vi.fn().mockResolvedValue(undefined);
    const setPresence = vi.fn().mockRejectedValue(new Error("rate limited"));
    const driver = driverWithClient({
      setSyncPresence,
      setPresence,
    } as unknown as MatrixClient);

    await expect(
      driver.setSelfPresencePreference("offline"),
    ).resolves.toBeUndefined();

    expect(setSyncPresence.mock.calls).toEqual([["offline"]]);
    expect(readChatSelfPresencePreference("matrix-local")).toBe("offline");
    expect(consoleInfo).toHaveBeenCalledOnce();
    consoleInfo.mockRestore();
  });
});

describe("profile identity", () => {
  it("uses the live client's token, including after a refresh", async () => {
    const getAccessToken = vi.fn().mockReturnValue("initial-token");
    const driver = driverWithClient({
      getAccessToken,
    } as unknown as MatrixClient);

    expect(driver.supportsProfileRoles).toBe(true);
    await expect(driver.getProfileIdentityToken()).resolves.toBe(
      "initial-token",
    );
    getAccessToken.mockReturnValue("refreshed-token");
    await expect(driver.getProfileIdentityToken()).resolves.toBe(
      "refreshed-token",
    );
  });

  it("rejects when no authenticated chat client is available", async () => {
    await expect(
      driverWithClient(null).getProfileIdentityToken(),
    ).rejects.toThrow();
    const driver = driverWithClient({
      getAccessToken: () => null,
    } as unknown as MatrixClient);
    await expect(driver.getProfileIdentityToken()).rejects.toThrow();
  });

  it("exposes profile roles through the lazy driver used by the account registry", async () => {
    const driver = new LazyMatrixDriver();
    (driver as unknown as { target: MatrixDriver }).target = driverWithClient({
      getAccessToken: () => "current-token",
    } as unknown as MatrixClient);

    expect(driver.supportsProfileRoles).toBe(true);
    await expect(driver.getProfileIdentityToken()).resolves.toBe(
      "current-token",
    );
  });
});

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
          getMxcAvatarUrl: () => undefined,
        },
      ],
      getLastActiveTimestamp: () => 0,
      currentState: { getStateEvents: () => undefined },
      getLiveTimeline: () => ({ getEvents: () => [] }),
      getMxcAvatarUrl: () => null,
      hasEncryptionStateEvent: () => false,
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

  it("maps every push-rule kind into the neutral shape", async () => {
    const getPushRules = vi.fn(async () => ({
      global: {
        override: [
          {
            rule_id: ".m.rule.master",
            default: true,
            enabled: false,
            actions: [],
          },
        ],
        underride: [
          {
            rule_id: ".m.rule.message",
            default: true,
            enabled: true,
            actions: [
              PushRuleActionName.Notify,
              { set_tweak: "sound", value: "default" },
            ],
          },
        ],
      },
    }));
    const mx = { getPushRules } as unknown as MatrixClient;
    const driver = driverWithClient(mx);

    const rules = await driver.getNotificationRules();

    expect(rules.override).toEqual([
      {
        id: ".m.rule.master",
        kind: "override",
        isEnabled: false,
        isDefault: true,
        actions: [],
        conditions: undefined,
        pattern: undefined,
      },
    ]);
    expect(rules.underride[0].actions).toEqual([
      "notify",
      { setTweak: "sound", value: "default" },
    ]);
    // A kind the server didn't send at all defaults to an empty array.
    expect(rules.content).toEqual([]);
  });

  it("enables/disables and sets actions on a push rule", async () => {
    const setPushRuleEnabled = vi.fn(async () => ({}));
    const setPushRuleActions = vi.fn(async () => ({}));
    const mx = {
      setPushRuleEnabled,
      setPushRuleActions,
    } as unknown as MatrixClient;
    const driver = driverWithClient(mx);

    await driver.setNotificationRuleEnabled({
      kind: "override",
      ruleId: ".m.rule.master",
      enabled: true,
    });
    expect(setPushRuleEnabled).toHaveBeenCalledWith(
      "global",
      PushRuleKind.Override,
      ".m.rule.master",
      true,
    );

    await driver.setNotificationRuleActions({
      kind: "underride",
      ruleId: ".m.rule.message",
      actions: ["dont_notify"],
    });
    expect(setPushRuleActions).toHaveBeenCalledWith(
      "global",
      PushRuleKind.Underride,
      ".m.rule.message",
      [PushRuleActionName.DontNotify],
    );
  });

  it("reads a room's mute state from its room-kind push rule", async () => {
    const getRoomPushRule = vi.fn((_scope: string, roomId: string) =>
      roomId === ROOM_ID
        ? {
            rule_id: ROOM_ID,
            default: false,
            enabled: true,
            actions: [PushRuleActionName.DontNotify],
          }
        : undefined,
    );
    const mx = { getRoomPushRule } as unknown as MatrixClient;
    const driver = driverWithClient(mx);

    expect(await driver.isChatMuted(ROOM_ID)).toBe(true);
    expect(await driver.isChatMuted("!other:localhost")).toBe(false);
  });

  it("delegates muting to the SDK's own setRoomMutePushRule", async () => {
    const setRoomMutePushRule = vi.fn(async () => undefined);
    const mx = { setRoomMutePushRule } as unknown as MatrixClient;
    const driver = driverWithClient(mx);

    await driver.setChatMuted(ROOM_ID, true);
    expect(setRoomMutePushRule).toHaveBeenCalledWith("global", ROOM_ID, true);

    await driver.setChatMuted(ROOM_ID, false);
    expect(setRoomMutePushRule).toHaveBeenCalledWith("global", ROOM_ID, false);
  });

  it("hydrates and splits joined and invited room members", async () => {
    const loadMembersIfNeeded = vi.fn(async () => true);
    const room = {
      roomId: ROOM_ID,
      loadMembersIfNeeded,
      getMembers: () => [
        {
          userId: OTHER_ID,
          name: "Alice",
          membership: KnownMembership.Join,
        },
        {
          userId: SELF_ID,
          name: "Me",
          membership: KnownMembership.Join,
        },
        {
          userId: "@bob:localhost",
          name: "Bob",
          membership: KnownMembership.Invite,
        },
        {
          userId: "@left:localhost",
          name: "Left",
          membership: KnownMembership.Leave,
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

describe("MatrixDriver.startChatMeeting", () => {
  const MEET_ROOM = {
    slug: "abc-defg-hij",
    url: "https://meet.example.com/abc-defg-hij",
  };

  const makeMeetingRoom = (
    stateEvents: MatrixEvent[] = [],
    mayRecordMeeting = true,
  ): Room =>
    ({
      roomId: ROOM_ID,
      // A conversation, not an espace: it is never its own parent.
      isSpaceRoom: () => false,
      currentState: {
        getStateEvents: (_type: string, stateKey?: string) =>
          stateKey === undefined
            ? stateEvents
            : (stateEvents.find((event) => event.getStateKey() === stateKey) ??
              null),
        maySendStateEvent: (type: string, userId: string) =>
          type === MEETING_EVENT_TYPE && userId === SELF_ID && mayRecordMeeting,
      },
    }) as unknown as Room;

  const meetingEvent = (
    stateKey: string,
    content: Record<string, unknown>,
    sender = SELF_ID,
  ): MatrixEvent =>
    ({
      getContent: () => content,
      getSender: () => sender,
      getStateKey: () => stateKey,
    }) as unknown as MatrixEvent;

  /** `serverState` stands for the homeserver's copy, ahead of the local one. */
  const makeClient = (
    room: Room,
    serverState?: Record<string, Record<string, unknown>>,
  ) => {
    const sendStateEvent = vi.fn(async () => ({
      event_id: "$state:localhost",
    }));
    const getStateEvent = vi.fn(
      async (_roomId: string, _type: string, stateKey: string) =>
        serverState?.[stateKey] ??
        (
          room.currentState.getStateEvents(
            MEETING_EVENT_TYPE,
            stateKey,
          ) as MatrixEvent | null
        )?.getContent() ??
        {},
    );
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      getJoinedRooms: async () => ({ joined_rooms: [ROOM_ID] }),
      // The espace of a conversation is looked for among the joined rooms.
      getRooms: () => [room],
      sendStateEvent,
      getStateEvent,
    } as unknown as MatrixClient;
    return { mx, sendStateEvent, getStateEvent };
  };

  it("creates a Meet room and records its link in the room state", async () => {
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom());
    const createRoom = vi.fn<(schedule: MeetRoomSchedule) => Promise<MeetRoom>>(
      async () => MEET_ROOM,
    );

    const { meeting, isReused } = await driverWithClient(mx).startChatMeeting(
      ROOM_ID,
      createRoom,
    );

    // Without a planned duration, the server has no end to close it at.
    expect(createRoom).toHaveBeenCalledOnce();
    expect(createRoom).toHaveBeenCalledWith({ startsAt: expect.any(Date) });
    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      {
        meetingUrl: MEET_ROOM.url,
        startedAt: expect.any(Number),
        organizerId: SELF_ID,
      },
      MEET_ROOM.slug,
    );
    expect(isReused).toBe(false);
    expect(meeting).toMatchObject({
      id: MEET_ROOM.slug,
      url: MEET_ROOM.url,
      organizerId: SELF_ID,
    });
  });

  it("tells the Hub which espace the conversation belongs to", async () => {
    const room = makeMeetingRoom();
    const espace = {
      roomId: "!espace:localhost",
      name: "Direction du numérique",
      isSpaceRoom: () => true,
      currentState: {
        getStateEvents: () => [
          {
            getStateKey: () => ROOM_ID,
            getContent: () => ({ via: ["localhost"] }),
          },
        ],
      },
    } as unknown as Room;
    const { mx } = makeClient(room);
    // The espaces list their children; a room does not name its parent.
    (mx as unknown as { getRooms: () => Room[] }).getRooms = () => [
      room,
      espace,
    ];
    const createRoom = vi.fn<(schedule: MeetRoomSchedule) => Promise<MeetRoom>>(
      async () => MEET_ROOM,
    );

    await driverWithClient(mx).startChatMeeting(ROOM_ID, createRoom);

    expect(createRoom).toHaveBeenCalledWith({
      startsAt: expect.any(Date),
      spaceName: "Direction du numérique",
    });
  });

  it("schedules a meeting with its title and duration next to an ongoing one", async () => {
    const ongoing = meetingEvent("xyz-abcd-efg", {
      meetingUrl: "https://meet.example.com/xyz-abcd-efg",
      startedAt: Date.now(),
    });
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom([ongoing]));
    const createRoom = vi.fn<(schedule: MeetRoomSchedule) => Promise<MeetRoom>>(
      async () => MEET_ROOM,
    );
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);

    const link = {
      id: "doc-1",
      title: "Compte rendu",
      url: "https://docs.example.com/docs/1/",
    };

    const { meeting, isReused } = await driverWithClient(mx).startChatMeeting(
      ROOM_ID,
      createRoom,
      {
        title: " Point hebdo ",
        plannedDurationMinutes: 30,
        startsAt,
        agenda: "Ordre du jour",
        attachments: [{ name: "notes.md", content: "# Notes" }],
        documents: [link],
      },
    );

    // The server is told when the call takes place, for its closing.
    expect(createRoom).toHaveBeenCalledOnce();
    expect(createRoom).toHaveBeenCalledWith({
      startsAt,
      plannedEndAt: new Date(startsAt.getTime() + 30 * 60_000),
    });
    // The agenda and the files only go to the server, the links to everyone.
    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      {
        meetingUrl: MEET_ROOM.url,
        startedAt: startsAt.getTime(),
        organizerId: SELF_ID,
        title: "Point hebdo",
        plannedDurationMinutes: 30,
        documents: [link],
      },
      MEET_ROOM.slug,
    );
    expect(isReused).toBe(false);
    expect(meeting).toMatchObject({
      title: "Point hebdo",
      startedAt: startsAt.toISOString(),
      plannedDurationMinutes: 30,
      documents: [link],
    });
  });

  it("closes the organizer's meeting and keeps its other fields", async () => {
    const content = {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now() - 10 * 60 * 1000,
      organizerId: SELF_ID,
      plannedDurationMinutes: 30,
    };
    const { mx, sendStateEvent } = makeClient(
      makeMeetingRoom([meetingEvent(MEET_ROOM.slug, content)]),
    );

    await driverWithClient(mx).endChatMeeting(ROOM_ID, MEET_ROOM.slug);

    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, endedAt: expect.any(Number), endedBy: "organizer" },
      MEET_ROOM.slug,
    );
  });

  it("refuses to close a meeting organized by someone else", async () => {
    const event = meetingEvent(
      MEET_ROOM.slug,
      {
        meetingUrl: MEET_ROOM.url,
        startedAt: Date.now(),
        organizerId: OTHER_ID,
      },
      // The last writer is not the organizer.
      SELF_ID,
    );
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom([event]));

    await expect(
      driverWithClient(mx).endChatMeeting(ROOM_ID, MEET_ROOM.slug),
    ).rejects.toBeInstanceOf(MeetingNotAllowedError);
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  it("extends the planned duration", async () => {
    const content = {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now(),
      organizerId: SELF_ID,
      plannedDurationMinutes: 30,
    };
    const { mx, sendStateEvent } = makeClient(
      makeMeetingRoom([meetingEvent(MEET_ROOM.slug, content)]),
    );

    await driverWithClient(mx).extendChatMeeting(ROOM_ID, MEET_ROOM.slug, 15);

    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, plannedDurationMinutes: 45 },
      MEET_ROOM.slug,
    );
  });

  it("renames the meeting, and removes the name when it is emptied", async () => {
    const content = {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now(),
      organizerId: SELF_ID,
      title: "Réunion",
    };
    const { mx, sendStateEvent } = makeClient(
      makeMeetingRoom([meetingEvent(MEET_ROOM.slug, content)]),
    );
    const driver = driverWithClient(mx);

    await driver.renameChatMeeting(ROOM_ID, MEET_ROOM.slug, "  Point hebdo ");
    await driver.renameChatMeeting(ROOM_ID, MEET_ROOM.slug, "   ");

    expect(sendStateEvent).toHaveBeenNthCalledWith(
      1,
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, title: "Point hebdo" },
      MEET_ROOM.slug,
    );
    expect(sendStateEvent).toHaveBeenNthCalledWith(
      2,
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, title: undefined },
      MEET_ROOM.slug,
    );
  });

  it("adds a document to the meeting, replacing an older version", async () => {
    const kept = { id: "agenda", title: "Ordre du jour", url: "https://x/a" };
    const content = {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now(),
      organizerId: SELF_ID,
      documents: [
        kept,
        { id: "doc-123", title: "Ancienne version", url: "https://x/old" },
      ],
    };
    const { mx, sendStateEvent } = makeClient(
      makeMeetingRoom([meetingEvent(MEET_ROOM.slug, content)]),
    );
    const transcript = {
      id: "doc-123",
      title: "Transcription : Point hebdo",
      url: "https://docs.example.com/docs/doc-123/",
    };

    await driverWithClient(mx).addChatMeetingDocument(
      ROOM_ID,
      MEET_ROOM.slug,
      transcript,
    );

    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, documents: [kept, transcript] },
      MEET_ROOM.slug,
    );
  });

  it("lets a member list a document with someone else's meeting", async () => {
    const event = meetingEvent(MEET_ROOM.slug, {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now(),
      organizerId: OTHER_ID,
    });
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom([event]));
    const document = { id: "doc", title: "Doc", url: "https://x/doc" };

    // Documents belong to the conversation, unlike the meeting itself.
    await driverWithClient(mx).addChatMeetingDocument(
      ROOM_ID,
      MEET_ROOM.slug,
      document,
    );

    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      expect.objectContaining({ documents: [document] }),
      MEET_ROOM.slug,
    );
  });

  it("refuses to rename a meeting organized by someone else", async () => {
    const event = meetingEvent(MEET_ROOM.slug, {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now(),
      organizerId: OTHER_ID,
    });
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom([event]));

    await expect(
      driverWithClient(mx).renameChatMeeting(ROOM_ID, MEET_ROOM.slug, "Autre"),
    ).rejects.toBeInstanceOf(MeetingNotAllowedError);
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  it("extends a meeting without planned duration from the time spent", async () => {
    const content = {
      meetingUrl: MEET_ROOM.url,
      // 19 min 30 s: rounded up to 20 whatever the milliseconds of the run.
      startedAt: Date.now() - 20 * 60 * 1000 + 30_000,
      organizerId: SELF_ID,
    };
    const { mx, sendStateEvent } = makeClient(
      makeMeetingRoom([meetingEvent(MEET_ROOM.slug, content)]),
    );

    await driverWithClient(mx).extendChatMeeting(ROOM_ID, MEET_ROOM.slug, 15);

    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, plannedDurationMinutes: 35 },
      MEET_ROOM.slug,
    );
  });

  it("rejoins the ongoing meeting without creating a Meet room", async () => {
    // Fixed before the call: a start read later could fall after the
    // driver's "now" and look scheduled.
    const startedAt = Date.now() - 60_000;
    const ongoing = {
      getContent: () => ({
        meetingUrl: "https://meet.example.com/xyz-abcd-efg",
        startedAt,
      }),
      getSender: () => OTHER_ID,
      getStateKey: () => "xyz-abcd-efg",
    } as unknown as MatrixEvent;
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom([ongoing]));
    const createRoom = vi.fn<(schedule: MeetRoomSchedule) => Promise<MeetRoom>>(
      async () => MEET_ROOM,
    );

    const { meeting, isReused } = await driverWithClient(mx).startChatMeeting(
      ROOM_ID,
      createRoom,
    );

    expect(createRoom).not.toHaveBeenCalled();
    expect(sendStateEvent).not.toHaveBeenCalled();
    expect(isReused).toBe(true);
    expect(meeting.url).toBe("https://meet.example.com/xyz-abcd-efg");
  });

  it("records nothing when Meet cannot create the room", async () => {
    const { mx, sendStateEvent } = makeClient(makeMeetingRoom());
    const createRoom = vi.fn(async () => {
      throw new Error("Meet unavailable");
    });

    await expect(
      driverWithClient(mx).startChatMeeting(ROOM_ID, createRoom),
    ).rejects.toThrow("Meet unavailable");
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  describe("with a closing this device has not synced yet", () => {
    const open = {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now() - 10 * 60 * 1000,
      organizerId: OTHER_ID,
    };
    const closed = { ...open, endedAt: Date.now(), endedBy: "auto" };
    const staleClient = () =>
      makeClient(makeMeetingRoom([meetingEvent(MEET_ROOM.slug, open)]), {
        [MEET_ROOM.slug]: closed,
      });

    it("does not reopen the meeting to toggle its board", async () => {
      const { mx, sendStateEvent } = staleClient();

      await expect(
        driverWithClient(mx).setChatMeetingBoard(ROOM_ID, MEET_ROOM.slug, true),
      ).rejects.toBeInstanceOf(MeetingEndedError);
      expect(sendStateEvent).not.toHaveBeenCalled();
    });

    it("does not reopen the meeting to add a document", async () => {
      const { mx, sendStateEvent } = staleClient();
      const document = { id: "doc", title: "Doc", url: "https://x/doc" };

      await expect(
        driverWithClient(mx).addChatMeetingDocument(
          ROOM_ID,
          MEET_ROOM.slug,
          document,
        ),
      ).rejects.toBeInstanceOf(MeetingEndedError);
      expect(sendStateEvent).not.toHaveBeenCalled();
    });

    it("keeps who closed it when the organizer closes it again", async () => {
      const { mx, sendStateEvent } = makeClient(
        makeMeetingRoom([
          meetingEvent(MEET_ROOM.slug, { ...open, organizerId: SELF_ID }),
        ]),
        { [MEET_ROOM.slug]: { ...closed, organizerId: SELF_ID } },
      );

      await driverWithClient(mx).endChatMeeting(ROOM_ID, MEET_ROOM.slug);

      expect(sendStateEvent).not.toHaveBeenCalled();
    });
  });

  it("writes from the homeserver's latest copy of the meeting", async () => {
    const content = {
      meetingUrl: MEET_ROOM.url,
      startedAt: Date.now(),
      organizerId: OTHER_ID,
    };
    const agenda = { id: "agenda", title: "Ordre du jour", url: "https://x/a" };
    const { mx, sendStateEvent } = makeClient(
      makeMeetingRoom([meetingEvent(MEET_ROOM.slug, content)]),
      { [MEET_ROOM.slug]: { ...content, documents: [agenda] } },
    );

    await driverWithClient(mx).setChatMeetingBoard(
      ROOM_ID,
      MEET_ROOM.slug,
      true,
    );

    // A document listed by someone else meanwhile is not dropped.
    expect(sendStateEvent).toHaveBeenCalledWith(
      ROOM_ID,
      MEETING_EVENT_TYPE,
      { ...content, documents: [agenda], boardOpen: true },
      MEET_ROOM.slug,
    );
  });
});

describe("MatrixDriver.getOpenIdToken", () => {
  it("answers the token the homeserver issues", async () => {
    const getOpenIdToken = vi.fn(async () => ({
      access_token: "openid-token",
      token_type: "Bearer",
      matrix_server_name: "localhost",
      expires_in: 3600,
    }));
    const mx = { getOpenIdToken } as unknown as MatrixClient;

    await expect(driverWithClient(mx).getOpenIdToken()).resolves.toBe(
      "openid-token",
    );
  });
});

describe("MatrixDriver.startChatMeeting permissions", () => {
  it("refuses before creating a Meet room when the user may not record it", async () => {
    const sendStateEvent = vi.fn();
    const room = {
      roomId: ROOM_ID,
      currentState: {
        getStateEvents: () => [],
        maySendStateEvent: () => false,
      },
    } as unknown as Room;
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      getJoinedRooms: async () => ({ joined_rooms: [ROOM_ID] }),
      sendStateEvent,
    } as unknown as MatrixClient;
    const createRoom = vi.fn();

    await expect(
      driverWithClient(mx).startChatMeeting(ROOM_ID, createRoom),
    ).rejects.toBeInstanceOf(MeetingNotAllowedError);
    expect(createRoom).not.toHaveBeenCalled();
    expect(sendStateEvent).not.toHaveBeenCalled();
  });

  it("lets every member of a new conversation start a meeting", async () => {
    const createRoomMock = vi.fn(async () => ({ room_id: ROOM_ID }));
    const room = {
      roomId: ROOM_ID,
      name: "Alice",
      getMembers: () => [],
      getMyMembership: () => KnownMembership.Join,
      getLastActiveTimestamp: () => 0,
      tags: {},
      currentState: { getStateEvents: () => undefined },
    } as unknown as Room;
    const mx = {
      getRoom: () => room,
      getUserId: () => SELF_ID,
      getJoinedRooms: async () => ({ joined_rooms: [] }),
      getRooms: () => [],
      createRoom: createRoomMock,
    } as unknown as MatrixClient;

    const driver = driverWithClient(mx);
    // No existing conversation with these members: a room is created.
    vi.spyOn(driver, "getChatForUsers").mockResolvedValue(null);

    await driver
      .createChatForUsers([OTHER_ID, "@bob:localhost"])
      .catch(() => undefined);

    expect(createRoomMock).toHaveBeenCalledWith(
      expect.objectContaining({
        power_level_content_override: {
          events: { [MEETING_EVENT_TYPE]: 0 },
        },
      }),
    );
  });
});

describe("createChatForUsers (encryption and the assistant)", () => {
  const ASSISTANT_ID = "@hub-as_ariane:localhost";
  const BOB = "@bob:localhost";
  const CAROL = "@carol:localhost";

  /**
   * The narrowest client that lets `createChatForUsers` run to the end. No
   * existing room ever matches, so every call reaches `createRoom` - the one
   * method whose arguments these tests are about. `getRoom` stays empty so
   * `waitForRoom` falls back on its timer, which fake timers then skip.
   */
  const clientFor = (rooms: Room[] = []) => {
    // The signature is given so `mock.calls[0][0]` is typed: an untyped
    // `vi.fn` records its calls as an empty tuple, and the assertions below
    // read the arguments `createRoom` was given.
    const createRoom = vi.fn<
      (opts: Record<string, unknown>) => Promise<{ room_id: string }>
    >(async () => ({ room_id: "!new:localhost" }));
    const mx = {
      getUserId: () => SELF_ID,
      getJoinedRooms: vi.fn(async () => ({
        joined_rooms: rooms.map((room) => room.roomId),
      })),
      getVisibleRooms: () => rooms,
      getRoom: (roomId: string) =>
        rooms.find((room) => room.roomId === roomId) ?? null,
      on: vi.fn(),
      off: vi.fn(),
      createRoom,
    } as unknown as MatrixClient;
    return { mx, createRoom };
  };

  const create = async (
    userIds: string[],
    options?: Parameters<MatrixDriver["createChatForUsers"]>[1],
  ) => {
    const { mx, createRoom } = clientFor();
    vi.useFakeTimers();
    try {
      const pending = driverWithClient(mx).createChatForUsers(userIds, options);
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
    return createRoom.mock.calls[0][0] as {
      is_direct?: boolean;
      invite?: string[];
      initial_state?: { type: string }[];
    };
  };

  type StateEvent = {
    type: string;
    state_key?: string;
    content?: { algorithm?: string };
  };
  const encryptionEvent = (opts: { initial_state?: StateEvent[] }) =>
    opts.initial_state?.find((s) => s.type === "m.room.encryption");
  const encryptionOf = (opts: { initial_state?: StateEvent[] }) =>
    encryptionEvent(opts) !== undefined;
  // The only room algorithm the spec defines; a different one, or a non-empty
  // state key, would be silently ignored by the homeserver.
  const MEGOLM = "m.megolm.v1.aes-sha2";

  it("always encrypts a one-to-one conversation", async () => {
    const opts = await create([BOB]);
    expect(opts.is_direct).toBe(true);
    expect(opts.invite).toEqual([BOB]);
    expect(encryptionEvent(opts)).toEqual({
      type: "m.room.encryption",
      state_key: "",
      content: { algorithm: MEGOLM },
    });
  });

  it("leaves a group room clear unless asked otherwise", async () => {
    const opts = await create([BOB, CAROL]);
    expect(opts.is_direct).toBe(false);
    expect(opts.invite).toEqual([BOB, CAROL]);
    expect(encryptionOf(opts)).toBe(false);
  });

  it("encrypts a group room on request", async () => {
    const opts = await create([BOB, CAROL], { encrypted: true });
    expect(opts.invite).toEqual([BOB, CAROL]);
    expect(encryptionEvent(opts)?.content?.algorithm).toBe(MEGOLM);
  });

  it("reuses the encrypted one-to-one instead of creating a twin", async () => {
    // Every private message created before encryption existed is a clear
    // room; the encrypted one next to it is the conversation being asked for.
    const clear = makeJoinedRoom("!clear:localhost", [BOB], false);
    const e2ee = makeJoinedRoom("!e2ee:localhost", [BOB], true);
    const { mx, createRoom } = clientFor([clear, e2ee]);

    const chat = await driverWithClient(mx).createChatForUsers([BOB]);

    expect(chat.id).toBe("!e2ee:localhost");
    expect(chat.encrypted).toBe(true);
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("reuses the clear group and ignores its encrypted twin", async () => {
    const e2ee = makeJoinedRoom("!e2ee:localhost", [BOB, CAROL], true);
    const clear = makeJoinedRoom("!clear:localhost", [BOB, CAROL], false);
    const { mx, createRoom } = clientFor([e2ee, clear]);

    const chat = await driverWithClient(mx).createChatForUsers([BOB, CAROL]);

    expect(chat.id).toBe("!clear:localhost");
    expect(chat.encrypted).toBeUndefined();
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("never encrypts a one-to-one with the assistant", async () => {
    const opts = await create([ASSISTANT_ID], {
      assistantUserId: ASSISTANT_ID,
    });
    expect(opts.is_direct).toBe(true);
    expect(encryptionOf(opts)).toBe(false);
  });

  it("invites the assistant into a clear group", async () => {
    const opts = await create([BOB, CAROL], {
      assistantUserId: ASSISTANT_ID,
      encrypted: false,
    });
    expect(opts.invite).toEqual([BOB, CAROL, ASSISTANT_ID]);
    expect(encryptionOf(opts)).toBe(false);
  });

  it("keeps the assistant out of an encrypted group", async () => {
    const opts = await create([BOB, CAROL], {
      assistantUserId: ASSISTANT_ID,
      encrypted: true,
    });
    expect(opts.invite).toEqual([BOB, CAROL]);
    expect(encryptionOf(opts)).toBe(true);
  });
});

describe("getChatForUsers (encryption-aware lookup)", () => {
  const BOB = "@bob:localhost";
  const clear = makeJoinedRoom("!clear:localhost", [BOB], false);
  const e2ee = makeJoinedRoom("!e2ee:localhost", [BOB], true);
  const mx = {
    getUserId: () => SELF_ID,
    getJoinedRooms: async () => ({
      joined_rooms: [clear.roomId, e2ee.roomId],
    }),
    getVisibleRooms: () => [clear, e2ee],
  } as unknown as MatrixClient;

  it("returns the room in the requested encryption state", async () => {
    const driver = driverWithClient(mx);
    expect((await driver.getChatForUsers([BOB], { encrypted: true }))?.id).toBe(
      "!e2ee:localhost",
    );
    expect(
      (await driver.getChatForUsers([BOB], { encrypted: false }))?.id,
    ).toBe("!clear:localhost");
  });

  it("takes the first match when no state is requested", async () => {
    expect((await driverWithClient(mx).getChatForUsers([BOB]))?.id).toBe(
      "!clear:localhost",
    );
  });

  it("finds nothing when only the other state exists", async () => {
    const onlyClear = {
      ...mx,
      getJoinedRooms: async () => ({ joined_rooms: [clear.roomId] }),
      getVisibleRooms: () => [clear],
    } as unknown as MatrixClient;
    expect(
      await driverWithClient(onlyClear).getChatForUsers([BOB], {
        encrypted: true,
      }),
    ).toBeNull();
  });
});

describe("inviteToChat", () => {
  it("sends a plain invitation as the current user", async () => {
    const invite = vi.fn(async () => ({}));
    const mx = {
      getUserId: () => SELF_ID,
      getRoom: () => ({ roomId: ROOM_ID }),
      invite,
    } as unknown as MatrixClient;

    await driverWithClient(mx).inviteToChat(
      ROOM_ID,
      "@hub-as_ariane:localhost",
    );

    expect(invite).toHaveBeenCalledWith(ROOM_ID, "@hub-as_ariane:localhost");
  });

  it("refuses a room the client does not know", async () => {
    const mx = {
      getUserId: () => SELF_ID,
      getRoom: () => null,
      invite: vi.fn(),
    } as unknown as MatrixClient;

    await expect(
      driverWithClient(mx).inviteToChat("!missing:localhost", "@bob:localhost"),
    ).rejects.toThrow();
  });
});
