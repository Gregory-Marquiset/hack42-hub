import { describe, expect, it, vi } from "vitest";

import { LazyMatrixDriver } from "../LazyMatrixDriver";

const startChatMeetingMock = vi.hoisted(() => vi.fn());
const getChatMeetingsMock = vi.hoisted(() => vi.fn());

// The real driver pulls in matrix-js-sdk: only the meeting calls matter here.
vi.mock("../MatrixDriver", () => ({
  MatrixDriver: class {
    initialize() {}
    destroy() {}
    subscribeToEvents() {
      return () => {};
    }
    subscribeToChatTyping() {
      return () => {};
    }
    startChatMeeting = startChatMeetingMock;
    getChatMeetings = getChatMeetingsMock;
  },
}));

const ROOM_ID = "!room:localhost";

describe("LazyMatrixDriver meetings", () => {
  it("advertises meeting support before the SDK loads", () => {
    expect(new LazyMatrixDriver("matrix").supportsMeetings).toBe(true);
  });

  it("forwards meeting calls to the real Matrix driver", async () => {
    const meeting = {
      id: "abc-defg-hij",
      url: "https://meet.example.com/abc-defg-hij",
      organizerId: "@me:localhost",
      startedAt: "2026-09-16T10:00:00.000Z",
      isOngoing: true,
      documents: [],
    };
    startChatMeetingMock.mockResolvedValue(meeting);
    getChatMeetingsMock.mockResolvedValue([meeting]);
    const createRoom = vi.fn();
    const driver = new LazyMatrixDriver("matrix");

    await expect(driver.startChatMeeting(ROOM_ID, createRoom)).resolves.toBe(
      meeting,
    );
    await expect(driver.getChatMeetings(ROOM_ID)).resolves.toEqual([meeting]);
    expect(startChatMeetingMock).toHaveBeenCalledWith(ROOM_ID, createRoom);
    expect(getChatMeetingsMock).toHaveBeenCalledWith(ROOM_ID);
  });
});
