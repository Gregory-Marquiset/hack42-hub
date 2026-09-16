import { describe, expect, it } from "vitest";

import { matchesMessageFilters, MessageSearchDocument } from "../model";
import { emptySearchFilters } from "../types";

const createDoc = (
  overrides?: Partial<MessageSearchDocument>,
): MessageSearchDocument => ({
  roomId: "!room:example.com",
  eventId: "$event1",
  senderId: "@alice:example.com",
  senderName: "Alice",
  body: "Hello world with a link https://example.com",
  normalizedBody: "hello world with a link https://example.com",
  contentKind: "text",
  hasLink: true,
  mentionedUserIds: ["@bob:example.com"],
  timestamp: Date.parse("2025-09-15T10:00:00Z"),
  ...overrides,
});

describe("model.matchesMessageFilters", () => {
  it("matches when no filters are active", () => {
    const doc = createDoc();
    const filters = emptySearchFilters();
    expect(matchesMessageFilters(doc, filters)).toBe(true);
  });

  describe("from: filter", () => {
    it("matches when sender ID matches", () => {
      const doc = createDoc({ senderId: "@alice:example.com" });
      const filters = emptySearchFilters();
      filters.from.push("@alice:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches when sender name matches (substring)", () => {
      const doc = createDoc({ senderName: "Alice Smith" });
      const filters = emptySearchFilters();
      filters.from.push("alice");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches when sender name matches (case-insensitive)", () => {
      const doc = createDoc({ senderName: "Alice" });
      const filters = emptySearchFilters();
      filters.from.push("ALICE");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches when any from: token matches (OR semantics)", () => {
      const doc = createDoc({ senderId: "@alice:example.com" });
      const filters = emptySearchFilters();
      filters.from.push("@bob:example.com");
      filters.from.push("@alice:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when no from: token matches", () => {
      const doc = createDoc({ senderId: "@alice:example.com" });
      const filters = emptySearchFilters();
      filters.from.push("@charlie:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });
  });

  describe("mentions: filter", () => {
    it("matches when user is mentioned", () => {
      const doc = createDoc({ mentionedUserIds: ["@bob:example.com"] });
      const filters = emptySearchFilters();
      filters.mentions.push("@bob:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches when replying to a user", () => {
      const doc = createDoc({
        replyToSenderId: "@bob:example.com",
        mentionedUserIds: [],
      });
      const filters = emptySearchFilters();
      filters.mentions.push("@bob:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches mentions with substring (case-insensitive)", () => {
      const doc = createDoc({ mentionedUserIds: ["@bob:example.com"] });
      const filters = emptySearchFilters();
      filters.mentions.push("bob");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when user is not mentioned or replied-to", () => {
      const doc = createDoc({ mentionedUserIds: ["@bob:example.com"] });
      const filters = emptySearchFilters();
      filters.mentions.push("@charlie:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });

    it("matches when any mentions: token matches (OR semantics)", () => {
      const doc = createDoc({ mentionedUserIds: ["@alice:example.com"] });
      const filters = emptySearchFilters();
      filters.mentions.push("@bob:example.com");
      filters.mentions.push("@alice:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });
  });

  describe("has: filter", () => {
    it("matches has:link when message contains a link", () => {
      const doc = createDoc({ hasLink: true });
      const filters = emptySearchFilters();
      filters.has.push("link");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects has:link when message has no link", () => {
      const doc = createDoc({ hasLink: false });
      const filters = emptySearchFilters();
      filters.has.push("link");
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });

    it("matches has:image when contentKind is image", () => {
      const doc = createDoc({ contentKind: "image" });
      const filters = emptySearchFilters();
      filters.has.push("image");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches has:video when contentKind is video", () => {
      const doc = createDoc({ contentKind: "video" });
      const filters = emptySearchFilters();
      filters.has.push("video");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("matches when any has: token matches (OR semantics)", () => {
      const doc = createDoc({ contentKind: "video" });
      const filters = emptySearchFilters();
      filters.has.push("image");
      filters.has.push("video");
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when no has: token matches", () => {
      const doc = createDoc({ contentKind: "text" });
      const filters = emptySearchFilters();
      filters.has.push("image");
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });
  });

  describe("before: filter", () => {
    it("matches when timestamp is before the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-10T10:00:00Z") });
      const filters = emptySearchFilters();
      filters.before = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when timestamp is on or after the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-15T00:00:00Z") });
      const filters = emptySearchFilters();
      filters.before = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });
  });

  describe("during: filter", () => {
    it("matches when timestamp is within the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-15T10:00:00Z") });
      const filters = emptySearchFilters();
      filters.during = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when timestamp is before the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-14T23:59:59Z") });
      const filters = emptySearchFilters();
      filters.during = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });

    it("rejects when timestamp is after the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-16T00:00:00Z") });
      const filters = emptySearchFilters();
      filters.during = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });
  });

  describe("after: filter", () => {
    it("matches when timestamp is after the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-16T10:00:00Z") });
      const filters = emptySearchFilters();
      filters.after = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when timestamp is before or on the date", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-15T23:59:59Z") });
      const filters = emptySearchFilters();
      filters.after = "2025-09-15";
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });
  });

  describe("combined filters (AND semantics across kinds)", () => {
    it("matches when all filters match", () => {
      const doc = createDoc({
        senderId: "@alice:example.com",
        contentKind: "image",
        timestamp: Date.parse("2025-09-15T10:00:00Z"),
      });
      const filters = emptySearchFilters();
      filters.from.push("@alice:example.com");
      filters.has.push("image");
      filters.before = "2025-09-20";
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });

    it("rejects when one filter doesn't match", () => {
      const doc = createDoc({
        senderId: "@alice:example.com",
        contentKind: "text",
        timestamp: Date.parse("2025-09-15T10:00:00Z"),
      });
      const filters = emptySearchFilters();
      filters.from.push("@alice:example.com");
      filters.has.push("image"); // No image
      filters.before = "2025-09-20";
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });

    it("combines from + mentions + has + before + during + after", () => {
      const doc = createDoc({
        senderId: "@alice:example.com",
        mentionedUserIds: ["@bob:example.com"],
        contentKind: "video",
        timestamp: Date.parse("2025-09-15T10:00:00Z"),
      });
      const filters = emptySearchFilters();
      filters.from.push("@alice:example.com");
      filters.mentions.push("@bob:example.com");
      filters.has.push("video");
      filters.before = "2025-09-20";
      filters.during = "2025-09-15";
      filters.after = "2025-09-10";
      expect(matchesMessageFilters(doc, filters)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty mentionedUserIds", () => {
      const doc = createDoc({ mentionedUserIds: [] });
      const filters = emptySearchFilters();
      filters.mentions.push("@alice:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });

    it("handles undefined replyToSenderId", () => {
      const doc = createDoc({ replyToSenderId: undefined });
      const filters = emptySearchFilters();
      filters.mentions.push("@alice:example.com");
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });

    it("treats invalid date format gracefully (doesn't match)", () => {
      const doc = createDoc({ timestamp: Date.parse("2025-09-15T10:00:00Z") });
      const filters = emptySearchFilters();
      filters.before = "invalid-date";
      expect(matchesMessageFilters(doc, filters)).toBe(false);
    });
  });
});
