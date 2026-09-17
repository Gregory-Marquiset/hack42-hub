import { describe, expect, it } from "vitest";

import { isAssistantConversation } from "../useAssistant";

const ASSISTANT_ID = "@hub-as_ariane:localhost";
describe("isAssistantConversation", () => {
  const assistant = { userId: ASSISTANT_ID };

  it("is true only for a one-to-one with the assistant", () => {
    expect(
      isAssistantConversation(
        { kind: "direct", participantIds: [ASSISTANT_ID] },
        assistant,
      ),
    ).toBe(true);
    expect(
      isAssistantConversation(
        { kind: "direct", participantIds: ["@bob:localhost"] },
        assistant,
      ),
    ).toBe(false);
    expect(
      isAssistantConversation(
        { kind: "group", participantIds: ["@bob:localhost", ASSISTANT_ID] },
        assistant,
      ),
    ).toBe(false);
  });

  it("is never true before the assistant is known", () => {
    expect(
      isAssistantConversation(
        { kind: "direct", participantIds: [""] },
        { userId: "" },
      ),
    ).toBe(false);
  });
});
