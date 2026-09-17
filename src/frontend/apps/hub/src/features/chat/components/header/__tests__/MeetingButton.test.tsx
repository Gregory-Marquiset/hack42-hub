// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMeeting, ChatRef } from "@/features/drivers/types";

import { MeetingButton } from "../MeetingButton";

const state = vi.hoisted(() => ({ meetings: [] as ChatMeeting[] }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/features/chat/hooks/useChatMeetings", () => ({
  useChatMeetings: () => ({
    meetings: state.meetings,
    isSupported: true,
    isInitialLoading: false,
  }),
}));

const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };

const meetingIn = (minutes: number): ChatMeeting => ({
  id: "abc-defg-hij",
  url: "https://meet.example.com/abc-defg-hij",
  organizerId: "@me:localhost",
  startedAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  plannedDurationMinutes: 30,
  documents: [],
});

const renderButton = (onToggle = vi.fn()) => {
  render(
    <MeetingButton chatRef={CHAT_REF} isActive={false} onToggle={onToggle} />,
  );
  return onToggle;
};

describe("MeetingButton", () => {
  afterEach(() => {
    cleanup();
    state.meetings = [];
  });

  it("shows no indicator without a near meeting", () => {
    state.meetings = [meetingIn(60)];
    const onToggle = renderButton();

    expect(screen.queryByTestId("meeting-indicator")).toBeNull();
    fireEvent.click(screen.getByLabelText("Meetings"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("tells a meeting starts soon", () => {
    state.meetings = [meetingIn(10)];
    renderButton();

    expect(
      screen.getByTestId("meeting-indicator").getAttribute("data-state"),
    ).toBe("soon");
    expect(
      screen.getByLabelText("Meetings: a meeting starts soon"),
    ).toBeTruthy();
  });

  it("tells a meeting is in progress", () => {
    state.meetings = [meetingIn(-5)];
    renderButton();

    expect(
      screen.getByTestId("meeting-indicator").getAttribute("data-state"),
    ).toBe("ongoing");
    expect(
      screen
        .getByLabelText("Meetings: a meeting is in progress")
        .getAttribute("data-active"),
    ).toBe("true");
  });
});
