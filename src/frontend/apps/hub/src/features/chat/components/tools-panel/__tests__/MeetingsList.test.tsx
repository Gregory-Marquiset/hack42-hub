// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatMeeting } from "@/features/drivers/types";

import { MeetingsList } from "../MeetingsList";

const copyMeetingLink = vi.hoisted(() => vi.fn(async () => true));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}|${options.name}` : key,
    i18n: { language: "fr", resolvedLanguage: "fr" },
  }),
}));
vi.mock("@/features/chat/meetings/copyMeetingLink", () => ({
  copyMeetingLink,
}));

const NOW = Date.UTC(2026, 8, 17, 10, 0);

const meeting = (id: string, title: string, minutes: number): ChatMeeting => ({
  id,
  url: `https://meet.example.com/${id}`,
  organizerId: "@orga:localhost",
  title,
  startedAt: new Date(NOW + minutes * 60_000).toISOString(),
  plannedDurationMinutes: 30,
  documents: [],
});

describe("MeetingsList invitation links", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("copies the link of a meeting without joining it", () => {
    const onJoin = vi.fn();
    const ongoing = meeting("now-meet-ing", "Rétro", -5);
    const upcoming = meeting("new-meet-ing", "Point", 60);
    render(
      <MeetingsList
        ongoing={[ongoing]}
        upcoming={[upcoming]}
        now={NOW}
        isInitialLoading={false}
        isOpen
        onClose={vi.fn()}
        onNewMeeting={vi.fn()}
        onOpenHistory={vi.fn()}
        onJoin={onJoin}
        onOpenDetails={vi.fn()}
      />,
    );

    const buttons = screen.getAllByLabelText(
      /^Copy the invitation link of {{name}}\|/,
    );
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    expect(copyMeetingLink).toHaveBeenCalledWith(
      upcoming.url,
      expect.any(Function),
    );
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("joins an ongoing meeting and shows a scheduled one", () => {
    const onJoin = vi.fn();
    const onOpenDetails = vi.fn();
    const ongoing = meeting("now-meet-ing", "Rétro", -5);
    const upcoming = meeting("new-meet-ing", "Point", 60);
    render(
      <MeetingsList
        ongoing={[ongoing]}
        upcoming={[upcoming]}
        now={NOW}
        isInitialLoading={false}
        isOpen
        onClose={vi.fn()}
        onNewMeeting={vi.fn()}
        onOpenHistory={vi.fn()}
        onJoin={onJoin}
        onOpenDetails={onOpenDetails}
      />,
    );

    fireEvent.click(screen.getByText(/Rétro$/));
    fireEvent.click(screen.getByText(/Point$/));

    expect(onJoin).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledWith(ongoing);
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(onOpenDetails).toHaveBeenCalledWith(upcoming);
  });
});
