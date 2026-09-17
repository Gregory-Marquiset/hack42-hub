// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MeetingInviteButton } from "../MeetingInviteButton";

const openMeeting = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/features/chat/meetings/ActiveMeeting", () => ({
  useActiveMeeting: () => ({ openMeeting }),
}));

const INVITE = {
  chatId: "!salon:localhost",
  meetingId: "abc-defg-hij",
  url: "https://meet.example.com/abc-defg-hij",
  title: "Point hebdo",
};

describe("MeetingInviteButton", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the call in the Hub window, on the conversation that holds it", () => {
    render(<MeetingInviteButton accountId="matrix" invite={INVITE} />);

    fireEvent.click(screen.getByText("Join the meeting"));

    // The message is read in a private conversation; the meeting is elsewhere.
    expect(openMeeting).toHaveBeenCalledWith({
      url: INVITE.url,
      meetingId: INVITE.meetingId,
      chatRef: { accountId: "matrix", chatId: INVITE.chatId },
    });
  });
});
