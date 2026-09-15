import { describe, expect, it } from "vitest";

import { parseSearchQuery } from "../queryParser";

describe("queryParser", () => {
  describe("parseSearchQuery", () => {
    it("parses empty string", () => {
      const result = parseSearchQuery("");
      expect(result.freeText).toBe("");
      expect(result.filters.from).toHaveLength(0);
      expect(result.filters.mentions).toHaveLength(0);
      expect(result.filters.has).toHaveLength(0);
    });

    it("parses bare free text", () => {
      const result = parseSearchQuery("hello world");
      expect(result.freeText).toBe("hello world");
    });

    it("parses from: tag with bare value", () => {
      const result = parseSearchQuery("from:alice");
      expect(result.filters.from).toEqual(["alice"]);
      expect(result.freeText).toBe("");
    });

    it("parses from: tag with quoted value", () => {
      const result = parseSearchQuery('from:"Alice Smith"');
      expect(result.filters.from).toEqual(["Alice Smith"]);
      expect(result.freeText).toBe("");
    });

    it("parses multiple from: tags (OR semantics)", () => {
      const result = parseSearchQuery("from:alice from:bob");
      expect(result.filters.from).toEqual(["alice", "bob"]);
    });

    it("parses mentions: tag", () => {
      const result = parseSearchQuery("mentions:alice");
      expect(result.filters.mentions).toEqual(["alice"]);
    });

    it("parses multiple mentions: tags", () => {
      const result = parseSearchQuery("mentions:alice mentions:bob");
      expect(result.filters.mentions).toEqual(["alice", "bob"]);
    });

    it("parses has: tag with image", () => {
      const result = parseSearchQuery("has:image");
      expect(result.filters.has).toEqual(["image"]);
    });

    it("parses has: tag with video", () => {
      const result = parseSearchQuery("has:video");
      expect(result.filters.has).toEqual(["video"]);
    });

    it("parses has: tag with link", () => {
      const result = parseSearchQuery("has:link");
      expect(result.filters.has).toEqual(["link"]);
    });

    it("parses multiple has: tags (OR semantics)", () => {
      const result = parseSearchQuery("has:image has:video");
      expect(result.filters.has).toEqual(["image", "video"]);
    });

    it("rejects invalid has: value and falls through to free text", () => {
      const result = parseSearchQuery("has:pdf has:image");
      expect(result.filters.has).toEqual(["image"]);
      expect(result.freeText).toContain("has:pdf");
    });

    it("parses before: date tag", () => {
      const result = parseSearchQuery("before:2025-09-15");
      expect(result.filters.before).toBe("2025-09-15");
    });

    it("parses during: date tag", () => {
      const result = parseSearchQuery("during:2025-09-15");
      expect(result.filters.during).toBe("2025-09-15");
    });

    it("parses after: date tag", () => {
      const result = parseSearchQuery("after:2025-09-15");
      expect(result.filters.after).toBe("2025-09-15");
    });

    it("uses last value for repeated date tags", () => {
      const result = parseSearchQuery("before:2025-09-10 before:2025-09-15");
      expect(result.filters.before).toBe("2025-09-15");
    });

    it("rejects invalid date format and falls through to free text", () => {
      const result = parseSearchQuery("before:next-week before:2025-09-15");
      expect(result.filters.before).toBe("2025-09-15");
      expect(result.freeText).toContain("before:next-week");
    });

    it("treats unknown tags as free text (Discord forgiving behavior)", () => {
      const result = parseSearchQuery("de:alice contient:budget");
      expect(result.filters.from).toHaveLength(0);
      expect(result.freeText).toContain("de:alice");
      expect(result.freeText).toContain("contient:budget");
    });

    it("combines free text with tags (AND semantics across kinds)", () => {
      const result = parseSearchQuery("from:alice budget has:image");
      expect(result.filters.from).toEqual(["alice"]);
      expect(result.filters.has).toEqual(["image"]);
      expect(result.freeText).toBe("budget");
    });

    it("combines multiple from and has (different kinds AND, same kind OR)", () => {
      const result = parseSearchQuery("from:alice from:bob has:image has:video budget");
      expect(result.filters.from).toEqual(["alice", "bob"]);
      expect(result.filters.has).toEqual(["image", "video"]);
      expect(result.freeText).toBe("budget");
    });

    it("handles quoted phrases with spaces", () => {
      const result = parseSearchQuery('"hello world" from:alice');
      expect(result.freeText).toBe("hello world");
      expect(result.filters.from).toEqual(["alice"]);
    });

    it("handles quoted tag values with spaces", () => {
      const result = parseSearchQuery('from:"alice smith" budget');
      expect(result.filters.from).toEqual(["alice smith"]);
      expect(result.freeText).toBe("budget");
    });

    it("normalizes case for tag names and has values", () => {
      const result = parseSearchQuery("FROM:alice HAS:IMAGE");
      expect(result.filters.from).toEqual(["alice"]);
      expect(result.filters.has).toEqual(["image"]);
    });

    it("preserves case for tag values (usernames, etc.)", () => {
      const result = parseSearchQuery("from:Alice mentions:Bob");
      expect(result.filters.from).toEqual(["Alice"]);
      expect(result.filters.mentions).toEqual(["Bob"]);
    });

    it("handles complex real-world query", () => {
      const result = parseSearchQuery(
        'from:alice mentions:"Bob Smith" has:image has:video before:2025-09-15 "budget review" project'
      );
      expect(result.filters.from).toEqual(["alice"]);
      expect(result.filters.mentions).toEqual(["Bob Smith"]);
      expect(result.filters.has).toEqual(["image", "video"]);
      expect(result.filters.before).toBe("2025-09-15");
      expect(result.freeText).toBe("budget review project");
    });

    it("trims free text", () => {
      const result = parseSearchQuery("  hello   world  ");
      expect(result.freeText).toBe("hello world");
    });

    it("stores raw input", () => {
      const raw = "from:alice budget";
      const result = parseSearchQuery(raw);
      expect(result.raw).toBe(raw);
    });
  });
});
