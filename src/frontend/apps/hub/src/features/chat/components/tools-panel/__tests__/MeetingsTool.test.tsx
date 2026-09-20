// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMeeting, ChatRef } from "@/features/drivers/types";

import { MeetingsTool } from "../MeetingsTool";

const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };
const MEETING: ChatMeeting = {
  id: "abc-defg-hij",
  url: "https://meet.example.com/abc-defg-hij",
  organizerId: "@me:localhost",
  title: "Point",
  startedAt: new Date().toISOString(),
  documents: [],
};

const mocks = vi.hoisted(() => ({
  startMeeting: vi.fn(),
  openMeeting: vi.fn(),
  notifyBrand: vi.fn(),
  meetings: [] as ChatMeeting[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "fr", resolvedLanguage: "fr" },
  }),
  // The i18n setup is pulled in by the API error class, through the hooks.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@/features/chat/hooks/useChatMeetings", () => ({
  useChatMeetings: () => ({
    meetings: mocks.meetings,
    isSupported: true,
    isInitialLoading: false,
  }),
}));
vi.mock("@/features/chat/hooks/useStartChatMeeting", () => ({
  useStartChatMeeting: () => ({
    startMeeting: mocks.startMeeting,
    isPending: false,
  }),
}));
vi.mock("@/features/chat/meetings/ActiveMeeting", () => ({
  useActiveMeeting: () => ({ openMeeting: mocks.openMeeting }),
}));
vi.mock("@/features/ui/components/toast", () => ({
  notify: { brand: mocks.notifyBrand, error: vi.fn() },
}));
// Both views are exercised through the tool, not on their own here.
vi.mock("../MeetingDetails", () => ({
  MeetingDetails: () => <div>details</div>,
}));

describe("MeetingsTool", () => {
  beforeEach(() => {
    mocks.meetings = [];
    mocks.startMeeting.mockResolvedValue({ meeting: MEETING, isReused: false });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("closes the panel once the call is started, and opens its window", async () => {
    const onClose = vi.fn();
    render(<MeetingsTool chatRef={CHAT_REF} isOpen onClose={onClose} />);
    fireEvent.click(screen.getByText("New meeting"));

    await act(async () => {
      fireEvent.click(screen.getByText("Start now"));
    });

    expect(mocks.openMeeting).toHaveBeenCalledWith({
      url: MEETING.url,
      meetingId: MEETING.id,
      chatRef: CHAT_REF,
      showInvitation: true,
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the panel open on the meeting it just scheduled", async () => {
    const onClose = vi.fn();
    render(<MeetingsTool chatRef={CHAT_REF} isOpen onClose={onClose} />);
    fireEvent.click(screen.getByText("New meeting"));
    const date = screen.getByLabelText("Meeting date") as HTMLInputElement;
    const time = screen.getByLabelText("Start time") as HTMLInputElement;
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
    fireEvent.change(date, {
      target: { value: tomorrow.toISOString().slice(0, 10) },
    });
    fireEvent.change(time, { target: { value: "10:00" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Schedule"));
    });

    expect(mocks.notifyBrand).toHaveBeenCalledWith("Meeting scheduled");
    expect(screen.getByText("details")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.openMeeting).not.toHaveBeenCalled();
  });

  it("offers to join the call in progress instead of starting one", () => {
    mocks.meetings = [MEETING];
    render(<MeetingsTool chatRef={CHAT_REF} isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("New meeting"));

    expect(screen.queryByText("Start now")).toBeNull();
    fireEvent.click(screen.getByText("Join the ongoing meeting"));

    expect(mocks.startMeeting).not.toHaveBeenCalled();
    expect(mocks.openMeeting).toHaveBeenCalledWith(
      expect.objectContaining({ meetingId: MEETING.id }),
    );
  });

  it("keeps the form when a call started meanwhile is returned", async () => {
    mocks.startMeeting.mockResolvedValue({ meeting: MEETING, isReused: true });
    const onClose = vi.fn();
    render(<MeetingsTool chatRef={CHAT_REF} isOpen onClose={onClose} />);
    fireEvent.click(screen.getByText("New meeting"));
    fireEvent.change(screen.getByLabelText("Meeting name"), {
      target: { value: "Point hebdo" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start now"));
    });

    expect(mocks.notifyBrand).toHaveBeenCalledWith(
      "A meeting is already in progress: join it, or plan yours.",
    );
    expect(mocks.openMeeting).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Meeting name") as HTMLInputElement).value,
    ).toBe("Point hebdo");
    expect(screen.getByText("Join the ongoing meeting")).toBeTruthy();
  });
});
