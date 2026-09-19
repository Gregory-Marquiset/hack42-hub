import { describe, expect, it } from "vitest";

import { isWebLink } from "../webLink";

describe("isWebLink", () => {
  it("accepts absolute http and https addresses", () => {
    expect(isWebLink("https://docs.example.org/docs/1/")).toBe(true);
    expect(isWebLink("  HTTP://example.org  ")).toBe(true);
  });

  it("refuses an address typed without its scheme", () => {
    expect(isWebLink("docs.example.org/docs/1/")).toBe(false);
    expect(isWebLink("www.example.org")).toBe(false);
  });

  it("refuses other schemes and incomplete addresses", () => {
    expect(isWebLink("javascript:alert(1)")).toBe(false);
    expect(isWebLink("ftp://example.org")).toBe(false);
    expect(isWebLink("https://")).toBe(false);
    expect(isWebLink("https://docs.example.org/a b")).toBe(false);
    expect(isWebLink("")).toBe(false);
  });
});
