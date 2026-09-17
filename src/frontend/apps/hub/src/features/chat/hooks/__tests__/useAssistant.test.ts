import { describe, expect, it } from "vitest";

import { isAssistantConversation, mentionsAssistant } from "../useAssistant";

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

describe("mentionsAssistant", () => {
  const names = ["ariane"];

  it("matches the bot's own rule: @ then a whole name at a word start", () => {
    expect(mentionsAssistant("@Ariane /aide", names)).toBe(true);
    expect(mentionsAssistant("Bonjour @ariane, un avis ?", names)).toBe(true);
    expect(mentionsAssistant("(@ARIANE)", names)).toBe(true);
  });

  it("ignores lookalikes the bot would ignore too", () => {
    expect(mentionsAssistant("ariane sans arobase", names)).toBe(false);
    expect(mentionsAssistant("@arianes", names)).toBe(false);
    expect(mentionsAssistant("mail@ariane", names)).toBe(false);
    expect(mentionsAssistant("@@ariane", names)).toBe(false);
  });

  it("never matches before her names are known", () => {
    expect(mentionsAssistant("@Ariane", [])).toBe(false);
  });
});
