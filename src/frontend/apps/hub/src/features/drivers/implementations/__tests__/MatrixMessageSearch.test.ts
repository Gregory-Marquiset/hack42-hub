import { EventEmitter } from "events";

import {
  type MatrixClient,
  type MatrixEvent,
  type Room,
  RoomEvent,
} from "matrix-js-sdk/lib/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptySearchFilters } from "@/features/chat/search/types";

import { MatrixMessageSearch } from "../MatrixMessageSearch";

vi.mock("../matrixRoomMapping", () => ({
  matrixJoinedRoomToLocalChat: (room: Room) => ({ id: room.roomId }),
}));

const ROOM_ID = "!room:localhost";
const ALICE = "@alice:localhost";
const BOB = "@bob:localhost";

type EventOptions = {
  id: string;
  sender?: string;
  body?: string;
  content?: Record<string, unknown>;
  relation?: { rel_type: string; event_id: string };
  status?: string | null;
  redacts?: string;
  ts?: number;
};

const makeEvent = (options: EventOptions) => {
  const event = {
    id: options.id,
    status: options.status ?? null,
    getId: () => event.id,
    getType: () => "m.room.message",
    getSender: () => options.sender ?? ALICE,
    getTs: () => options.ts ?? 1_000,
    getContent: () =>
      options.content ?? { msgtype: "m.text", body: options.body ?? "" },
    getRelation: () => options.relation ?? null,
    getAssociatedId: () => options.redacts,
    isRedacted: () => false,
    isDecryptionFailure: () => false,
    isEncrypted: () => false,
    threadRootId: undefined,
    isThreadRoot: false,
  };
  return event;
};

const asEvent = (event: ReturnType<typeof makeEvent>) =>
  event as unknown as MatrixEvent;

describe("MatrixMessageSearch live indexing", () => {
  const timeline = new Map<string, MatrixEvent>();
  const room = {
    roomId: ROOM_ID,
    name: "Room",
    getMyMembership: () => "join",
    getMember: () => null,
    findEventById: (id: string) => timeline.get(id),
  } as unknown as Room;
  let client: EventEmitter;
  let search: MatrixMessageSearch;

  const receive = (event: ReturnType<typeof makeEvent>) => {
    timeline.set(event.id, asEvent(event));
    client.emit(RoomEvent.Timeline, asEvent(event), room, false, false, {});
  };

  const find = async (freeText: string, mentions: string[] = []) => {
    const filters = emptySearchFilters();
    filters.mentions.push(...mentions);
    const page = await search.search({ freeText, filters });
    return page.results.map((result) => ({
      eventId: result.eventId,
      excerpt: result.excerpt,
    }));
  };

  beforeEach(async () => {
    timeline.clear();
    client = Object.assign(new EventEmitter(), {
      getRoom: () => room,
      getUserId: () => ALICE,
      decryptEventIfNeeded: () => Promise.resolve(),
    });
    search = new MatrixMessageSearch(
      client as unknown as MatrixClient,
      "test-db",
      () => {},
    );
    await search.start();
  });

  afterEach(() => search.close());

  it("reports the storage missing once opening it failed", () => {
    // No IndexedDB in this environment: the index lives in memory only.
    expect(search.getStatus().storageAvailable).toBe(false);
  });

  it("applies an edit to its original instead of indexing it", async () => {
    receive(makeEvent({ id: "$original", body: "hello world" }));
    receive(
      makeEvent({
        id: "$edit",
        relation: { rel_type: "m.replace", event_id: "$original" },
        content: {
          msgtype: "m.text",
          body: "* goodbye world",
          "m.new_content": { msgtype: "m.text", body: "goodbye world" },
        },
      }),
    );

    expect(await find("hello")).toEqual([]);
    expect(await find("world")).toEqual([
      { eventId: "$original", excerpt: "goodbye world" },
    ]);
  });

  it("ignores an edit from someone else than the sender", async () => {
    receive(makeEvent({ id: "$original", body: "hello world" }));
    receive(
      makeEvent({
        id: "$edit",
        sender: BOB,
        relation: { rel_type: "m.replace", event_id: "$original" },
        content: { "m.new_content": { body: "hijacked" } },
      }),
    );

    expect(await find("hello")).toHaveLength(1);
    expect(await find("hijacked")).toEqual([]);
  });

  it("indexes a local echo once sent, under its real id", async () => {
    const echo = makeEvent({
      id: "~local",
      body: "on its way",
      status: "sending",
    });
    receive(echo);
    expect(await find("way")).toEqual([]);

    echo.id = "$real";
    echo.status = "sent";
    client.emit(RoomEvent.LocalEchoUpdated, asEvent(echo), room, "~local");

    expect(await find("way")).toEqual([
      { eventId: "$real", excerpt: "on its way" },
    ]);
  });

  it("forgets a redacted message", async () => {
    receive(makeEvent({ id: "$secret", body: "a secret" }));
    expect(await find("secret")).toHaveLength(1);

    client.emit(
      RoomEvent.Redaction,
      asEvent(makeEvent({ id: "$redaction", redacts: "$secret" })),
      room,
    );

    expect(await find("secret")).toEqual([]);
  });

  it("matches mentions: against the sender of the replied-to message", async () => {
    receive(makeEvent({ id: "$question", sender: BOB, body: "question?" }));
    receive(
      makeEvent({
        id: "$answer",
        content: {
          body: "answer",
          "m.relates_to": { "m.in_reply_to": { event_id: "$question" } },
        },
      }),
    );

    expect(await find("", ["bob"])).toEqual([
      { eventId: "$answer", excerpt: "answer" },
    ]);
    // The sender of the reply is not the one it mentions.
    expect(await find("", ["alice"])).toEqual([]);
  });

  it("drops the messages of a room left", async () => {
    receive(makeEvent({ id: "$left", body: "gone" }));
    search.setJoinedRooms(new Set(["!other:localhost"]));

    expect(await find("gone")).toEqual([]);
  });

  it("keeps only the most recent messages of a room", async () => {
    for (let index = 0; index <= 2_000; index++) {
      receive(makeEvent({ id: `$m${index}`, body: "note", ts: index + 1 }));
    }

    const page = await search.search({
      freeText: "note",
      filters: emptySearchFilters(),
      limit: 3_000,
    });
    expect(page.total).toBe(2_000);
    expect(page.results.some((result) => result.eventId === "$m0")).toBe(false);
  });
});
