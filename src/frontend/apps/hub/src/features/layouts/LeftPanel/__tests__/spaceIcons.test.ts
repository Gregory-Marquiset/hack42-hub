import { describe, expect, it } from "vitest";

import { SPACE_ICONS, assignSpaceIcons } from "../spaceIcons";

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `!space-${index}:localhost`);

describe("assignSpaceIcons", () => {
  it("gives every espace an icon", () => {
    const icons = assignSpaceIcons(ids(7));

    expect(icons.size).toBe(7);
    for (const id of ids(7)) {
      expect(SPACE_ICONS).toContain(icons.get(id));
    }
  });

  it("gives no two espaces the same icon", () => {
    const icons = assignSpaceIcons(ids(SPACE_ICONS.length));

    expect(new Set(icons.values()).size).toBe(SPACE_ICONS.length);
  });

  it("keeps an espace's icon when the list around it changes", () => {
    // The rail is a place someone learns: an espace that changes face because
    // a neighbour was created is a landmark that moved.
    const alone = assignSpaceIcons(["!a:x"]);

    expect(assignSpaceIcons(["!a:x", "!b:x", "!c:x"]).get("!a:x")).toBe(
      alone.get("!a:x"),
    );
  });

  it("still answers for more espaces than the palette holds", () => {
    const many = ids(SPACE_ICONS.length + 3);
    const icons = assignSpaceIcons(many);

    expect(icons.size).toBe(many.length);
    for (const id of many) {
      expect(SPACE_ICONS).toContain(icons.get(id));
    }
  });

  it("never omits the espace named twice", () => {
    expect(assignSpaceIcons(["!a:x", "!a:x"]).size).toBe(1);
  });

  it("answers nothing for no espace", () => {
    expect(assignSpaceIcons([])).toEqual(new Map());
  });
});
