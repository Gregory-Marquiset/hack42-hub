// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ChatMember } from "@/features/drivers/types";

import type { Assistant } from "../../hooks/useAssistant";
import { useComposerAutocomplete } from "../useComposerAutocomplete";

const ASSISTANT: Assistant = {
  userId: "@ariane:localhost",
  names: ["ariane"],
  displayName: "Ariane",
  commands: [{ id: "juriste", primary: "/juriste", secondary: "Juriste" }],
};

const member = (name: string): ChatMember => ({
  id: `@${name.toLowerCase()}:localhost`,
  name,
  secondaryText: "",
});

const render = (members: ChatMember[]) =>
  renderHook(
    ({ members: current }) => useComposerAutocomplete(current, ASSISTANT),
    { initialProps: { members } },
  );

describe("useComposerAutocomplete", () => {
  it("keeps the highlight on a row when the list shrinks", () => {
    const { result, rerender } = render([
      member("Alice"),
      member("Bob"),
      member("Carol"),
    ]);
    act(() => result.current.update("@", 1));
    act(() => result.current.move(2));
    expect(result.current.activeIndex).toBe(2);

    // Two members left the room while the list was open.
    rerender({ members: [member("Alice")] });

    expect(result.current.activeIndex).toBe(0);
    expect(
      result.current.suggestions[result.current.activeIndex],
    ).toBeDefined();
  });

  it("opens the command list only once the assistant is mentioned", () => {
    const { result } = render([]);

    act(() => result.current.update("@Ariane /", 9));
    expect(result.current.suggestions.map(({ id }) => id)).toEqual(["juriste"]);

    // Her name inside another word does not address her.
    act(() => result.current.update("@Mariane /", 10));
    expect(result.current.suggestions).toEqual([]);

    act(() => result.current.update("Ariane /", 8));
    expect(result.current.suggestions).toEqual([]);
  });
});
