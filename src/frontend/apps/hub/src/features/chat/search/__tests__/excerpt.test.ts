import { describe, expect, it } from "vitest";

import { buildExcerpt, findMatchRange, normalizeSearch } from "../model";

const highlighted = (text: string, query: string): string[] => {
  const { excerpt, matchRanges } = buildExcerpt(
    text,
    findMatchRange(text, normalizeSearch(query)),
  );
  return matchRanges.map(([start, end]) => excerpt.slice(start, end));
};

describe("findMatchRange", () => {
  it("returns offsets into the untrimmed text", () => {
    expect(findMatchRange("   Hello World", "world")).toEqual([9, 14]);
  });

  it("keeps offsets when lowercasing changes a character's length", () => {
    // "İ".toLowerCase() is two code units long.
    const text = "İstanbul, then Paris";
    const range = findMatchRange(text, "paris");
    expect(range && text.slice(...range)).toBe("Paris");
  });

  it("returns undefined without a match or a needle", () => {
    expect(findMatchRange("Hello", "bye")).toBeUndefined();
    expect(findMatchRange("Hello", "")).toBeUndefined();
  });
});

describe("buildExcerpt", () => {
  it("highlights the matched characters in a short message", () => {
    expect(highlighted("  Hello World", "WORLD")).toEqual(["World"]);
  });

  it("rebases the range past the leading ellipsis of a cut excerpt", () => {
    const text = `${"a".repeat(120)} needle ${"b".repeat(120)}`;
    const { excerpt } = buildExcerpt(text, findMatchRange(text, "needle"));
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(highlighted(text, "needle")).toEqual(["needle"]);
  });

  it("returns the start of the text without ranges when nothing matched", () => {
    const text = "x".repeat(200);
    const { excerpt, matchRanges } = buildExcerpt(text);
    expect(excerpt).toBe(`${"x".repeat(150)}…`);
    expect(matchRanges).toEqual([]);
  });
});
