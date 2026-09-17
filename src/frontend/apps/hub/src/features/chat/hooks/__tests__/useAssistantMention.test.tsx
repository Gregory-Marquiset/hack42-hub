// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Chat, ChatRef } from "@/features/drivers/types";

import { useAssistantMention } from "../useAssistantMention";

const ASSISTANT_ID = "@hub-as_ariane:localhost";
const CHAT_REF: ChatRef = { accountId: "account-a", chatId: "!room:localhost" };

vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => ({ get: () => ({ inviteToChat: vi.fn() }) }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));
vi.mock("../useAssistant", () => ({
  useAssistant: () => ({
    userId: ASSISTANT_ID,
    names: ["ariane"],
    displayName: "Ariane",
    commands: [],
  }),
  mentionsAssistant: () => true,
}));
vi.mock("../useChatMembers", () => ({
  useChatMembers: () => ({
    present: [],
    pendingInvites: [],
    isLoaded: true,
    isInitialLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const chat = (over: Partial<Chat>): Chat =>
  ({ kind: "group", encrypted: false, ...over }) as Chat;

const render = (over: Partial<Chat>) =>
  renderHook(() => useAssistantMention(CHAT_REF, chat(over)), { wrapper })
    .result.current;

describe("useAssistantMention", () => {
  it("offers her in a clear group room she has not joined", () => {
    const { candidate, unavailableReason } = render({});

    expect(candidate?.id).toBe(ASSISTANT_ID);
    expect(unavailableReason).toBeNull();
  });

  it("says why she is missing from an encrypted room", () => {
    // An empty suggestion list cannot tell a rule from a bug, and her absence
    // in a room she would otherwise be in is exactly what looks like one.
    const { candidate, unavailableReason } = render({ encrypted: true });

    expect(candidate).toBeNull();
    expect(unavailableReason).toBe("Ariane cannot read an encrypted room");
  });

  it("stays silent about a conversation between two people", () => {
    // She was never offered there, so there is no absence to explain.
    const { candidate, unavailableReason } = render({
      kind: "direct",
      encrypted: true,
    });

    expect(candidate).toBeNull();
    expect(unavailableReason).toBeNull();
  });
});
