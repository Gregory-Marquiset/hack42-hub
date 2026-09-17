// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMeeting, ChatRef } from "@/features/drivers/types";

import { useMeetingFromUrl } from "../useMeetingFromUrl";

const state = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  meetings: [] as ChatMeeting[],
}));
const openMeeting = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: state.query,
    pathname: "/chat",
    replace,
  }),
}));
vi.mock("@/features/chat/meetings/ActiveMeeting", () => ({
  useActiveMeeting: () => ({ openMeeting }),
}));
vi.mock("../useChatMeetings", () => ({
  useChatMeetings: () => ({
    meetings: state.meetings,
    isSupported: true,
    isInitialLoading: false,
  }),
}));

const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };
const MEETING: ChatMeeting = {
  id: "abc-defg-hij",
  url: "https://meet.example.com/abc-defg-hij",
  organizerId: "@orga:localhost",
  startedAt: new Date().toISOString(),
  documents: [],
};

describe("useMeetingFromUrl", () => {
  afterEach(() => {
    state.query = {};
    state.meetings = [];
    vi.clearAllMocks();
  });

  it("joins the meeting the address names, then drops it from the address", async () => {
    state.query = { chat: CHAT_REF.chatId, meeting: MEETING.id };
    state.meetings = [MEETING];

    renderHook(() => useMeetingFromUrl(CHAT_REF));

    await waitFor(() => expect(openMeeting).toHaveBeenCalledOnce());
    expect(openMeeting).toHaveBeenCalledWith({
      url: MEETING.url,
      meetingId: MEETING.id,
      chatRef: CHAT_REF,
    });
    expect(replace).toHaveBeenCalledWith(
      { pathname: "/chat", query: { chat: CHAT_REF.chatId } },
      undefined,
      { shallow: true },
    );
  });

  it("opens no call for a meeting that is over", async () => {
    state.query = { meeting: MEETING.id };
    state.meetings = [{ ...MEETING, endedAt: new Date().toISOString() }];

    renderHook(() => useMeetingFromUrl(CHAT_REF));

    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
    expect(openMeeting).not.toHaveBeenCalled();
  });

  it("waits for a meeting the conversation does not know yet", () => {
    state.query = { meeting: MEETING.id };

    const { rerender } = renderHook(() => useMeetingFromUrl(CHAT_REF));
    expect(openMeeting).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    state.meetings = [MEETING];
    rerender();

    expect(openMeeting).toHaveBeenCalledOnce();
  });

  it("does nothing without a meeting in the address", () => {
    state.query = { chat: CHAT_REF.chatId };
    state.meetings = [MEETING];

    renderHook(() => useMeetingFromUrl(CHAT_REF));

    expect(openMeeting).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
