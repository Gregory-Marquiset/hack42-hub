import { describe, expect, it } from "vitest";

import type { Chat } from "@/features/drivers/types";

import {
  SECTION_PREVIEW_COUNT,
  filterChatsBySpace,
  partitionChats,
} from "../chatSections";

const chat = (over: Partial<Chat> & { id: string }): Chat =>
  ({
    name: over.id,
    section: "all",
    kind: "group",
    participantIds: [],
    visual: { kind: "initials" },
    accountId: "account-a",
    ref: { accountId: "account-a", chatId: over.id },
    ...over,
  }) as Chat;

const at = (id: string, iso: string, over: Partial<Chat> = {}) =>
  chat({ id, lastActivityAt: iso, ...over });

describe("partitionChats", () => {
  it("puts a favourite in Favourites and nowhere else", () => {
    // Seeing one conversation twice in one panel says nothing the first row
    // did not already say.
    const sections = partitionChats([
      chat({ id: "fav-room", section: "favourites", kind: "group" }),
      chat({ id: "fav-dm", section: "favourites", kind: "direct" }),
      chat({ id: "room", kind: "group" }),
      chat({ id: "dm", kind: "direct" }),
    ]);

    expect(sections.favourites.map((c) => c.id)).toEqual([
      "fav-dm",
      "fav-room",
    ]);
    expect(sections.rooms.map((c) => c.id)).toEqual(["room"]);
    expect(sections.directs.map((c) => c.id)).toEqual(["dm"]);
  });

  it("orders every section by recency", () => {
    const sections = partitionChats([
      at("old", "2026-09-01T08:00:00.000Z"),
      at("newest", "2026-09-17T08:00:00.000Z"),
      at("middle", "2026-09-10T08:00:00.000Z"),
    ]);

    expect(sections.rooms.map((c) => c.id)).toEqual([
      "newest",
      "middle",
      "old",
    ]);
  });

  it("leaves every section empty for no conversations", () => {
    expect(partitionChats([])).toEqual({
      favourites: [],
      rooms: [],
      directs: [],
    });
  });
});

describe("filterChatsBySpace", () => {
  const chats = [chat({ id: "!in:x" }), chat({ id: "!out:x" })];

  it("keeps everything when no espace is chosen", () => {
    expect(filterChatsBySpace(chats, null)).toHaveLength(2);
  });

  it("keeps only what the espace groups", () => {
    expect(
      filterChatsBySpace(chats, new Set(["!in:x"])).map((c) => c.id),
    ).toEqual(["!in:x"]);
  });

  it("empties a list of conversations no espace groups", () => {
    // A direct message belongs to none, and the filter says "from this
    // espace" - so it answers honestly rather than pretending.
    expect(filterChatsBySpace(chats, new Set(["!elsewhere:x"]))).toEqual([]);
  });
});

describe("SECTION_PREVIEW_COUNT", () => {
  it("is the five a collapsed section shows", () => {
    expect(SECTION_PREVIEW_COUNT).toBe(5);
  });
});
