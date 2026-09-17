// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserAvatar } from "../UserAvatar";

const ASSISTANT_ID = "@hub-as_ariane:localhost";

vi.mock("../../hooks/useAssistant", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../hooks/useAssistant")>();
  return {
    ...actual,
    useAssistant: () => ({
      userId: ASSISTANT_ID,
      names: ["ariane"],
      commands: [],
    }),
  };
});

describe("UserAvatar", () => {
  it("shows the assistant's face on her own fixed colour", () => {
    const { container } = render(
      <UserAvatar
        userId={ASSISTANT_ID}
        label="Ariane"
        color="green"
        initials="A"
        decorative
      />,
    );
    const avatar = container.querySelector(".hub__avatar");
    expect(avatar?.className).toContain("hub__avatar--brand");
    expect(avatar?.className).not.toContain("hub__avatar--green");
    expect(container.querySelector(".hub__avatar__glyph")).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("leaves a person's initials and colour untouched", () => {
    const { container } = render(
      <UserAvatar
        userId="@bob:localhost"
        label="Bob Martin"
        color="green"
        initials="BM"
        decorative
      />,
    );
    const avatar = container.querySelector(".hub__avatar");
    expect(avatar?.className).toContain("hub__avatar--green");
    expect(container.querySelector(".hub__avatar__glyph")).toBeNull();
    expect(container.textContent).toBe("BM");
  });

  it("names the assistant for assistive technology when not decorative", () => {
    const { container } = render(
      <UserAvatar userId={ASSISTANT_ID} label="Ariane" />,
    );
    const avatar = container.querySelector(".hub__avatar");
    expect(avatar?.getAttribute("role")).toBe("img");
    expect(avatar?.getAttribute("aria-label")).toBe("Ariane");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
