import { describe, expect, it, vi } from "vitest";

import { LazyMatrixDriver } from "../LazyMatrixDriver";

const startChatMeetingMock = vi.hoisted(() => vi.fn());
const getChatMeetingsMock = vi.hoisted(() => vi.fn());
const endChatMeetingMock = vi.hoisted(() => vi.fn());
const extendChatMeetingMock = vi.hoisted(() => vi.fn());
const renameChatMeetingMock = vi.hoisted(() => vi.fn());
const getNotificationRulesMock = vi.hoisted(() => vi.fn());
const setNotificationRuleEnabledMock = vi.hoisted(() => vi.fn());
const setNotificationRuleActionsMock = vi.hoisted(() => vi.fn());
const isChatMutedMock = vi.hoisted(() => vi.fn());
const setChatMutedMock = vi.hoisted(() => vi.fn());
const addChatMeetingDocumentMock = vi.hoisted(() => vi.fn());
const setChatMeetingBoardMock = vi.hoisted(() => vi.fn());
const getOpenIdTokenMock = vi.hoisted(() => vi.fn());
const getChatFilesMock = vi.hoisted(() => vi.fn());
const uploadChatFileMock = vi.hoisted(() => vi.fn());
const downloadChatFileMock = vi.hoisted(() => vi.fn());

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
    endChatMeeting = endChatMeetingMock;
    extendChatMeeting = extendChatMeetingMock;
    renameChatMeeting = renameChatMeetingMock;
    getNotificationRules = getNotificationRulesMock;
    setNotificationRuleEnabled = setNotificationRuleEnabledMock;
    setNotificationRuleActions = setNotificationRuleActionsMock;
    isChatMuted = isChatMutedMock;
    setChatMuted = setChatMutedMock;
    addChatMeetingDocument = addChatMeetingDocumentMock;
    setChatMeetingBoard = setChatMeetingBoardMock;
    getOpenIdToken = getOpenIdTokenMock;
    getChatFiles = getChatFilesMock;
    uploadChatFile = uploadChatFileMock;
    downloadChatFile = downloadChatFileMock;
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
      documents: [],
    };
    startChatMeetingMock.mockResolvedValue(meeting);
    getChatMeetingsMock.mockResolvedValue([meeting]);
    endChatMeetingMock.mockResolvedValue(undefined);
    extendChatMeetingMock.mockResolvedValue(undefined);
    const createRoom = vi.fn();
    const options = { title: "Point hebdo", plannedDurationMinutes: 30 };
    const driver = new LazyMatrixDriver("matrix");

    await expect(
      driver.startChatMeeting(ROOM_ID, createRoom, options),
    ).resolves.toBe(meeting);
    await expect(driver.getChatMeetings(ROOM_ID)).resolves.toEqual([meeting]);
    await driver.endChatMeeting(ROOM_ID, meeting.id);
    await driver.extendChatMeeting(ROOM_ID, meeting.id, 15);
    await driver.renameChatMeeting(ROOM_ID, meeting.id, "Point hebdo");
    const transcript = { id: "doc", title: "Doc", url: "https://x/doc" };
    await driver.addChatMeetingDocument(ROOM_ID, meeting.id, transcript);

    expect(startChatMeetingMock).toHaveBeenCalledWith(
      ROOM_ID,
      createRoom,
      options,
    );
    expect(getChatMeetingsMock).toHaveBeenCalledWith(ROOM_ID);
    expect(endChatMeetingMock).toHaveBeenCalledWith(ROOM_ID, meeting.id);
    expect(extendChatMeetingMock).toHaveBeenCalledWith(ROOM_ID, meeting.id, 15);
    expect(addChatMeetingDocumentMock).toHaveBeenCalledWith(
      ROOM_ID,
      meeting.id,
      transcript,
    );
    expect(renameChatMeetingMock).toHaveBeenCalledWith(
      ROOM_ID,
      meeting.id,
      "Point hebdo",
    );
  });

  it("forwards opening the whiteboard", async () => {
    await new LazyMatrixDriver("matrix").setChatMeetingBoard(
      ROOM_ID,
      "abc-defg-hij",
      true,
    );

    expect(setChatMeetingBoardMock).toHaveBeenCalledWith(
      ROOM_ID,
      "abc-defg-hij",
      true,
    );
  });

  it("forwards the OpenID token request", async () => {
    getOpenIdTokenMock.mockResolvedValue("openid-token");

    await expect(new LazyMatrixDriver("matrix").getOpenIdToken()).resolves.toBe(
      "openid-token",
    );
  });
});

describe("LazyMatrixDriver documents", () => {
  it("advertises document support before the SDK loads", () => {
    expect(new LazyMatrixDriver("matrix").supportsChatFiles).toBe(true);
  });

  it("forwards document calls to the real Matrix driver", async () => {
    const shared = { id: "$file", name: "cr.pdf" };
    const file = new File(["x"], "cr.pdf");
    const blob = new Blob(["x"]);
    getChatFilesMock.mockResolvedValue([shared]);
    uploadChatFileMock.mockResolvedValue(shared);
    downloadChatFileMock.mockResolvedValue(blob);
    const driver = new LazyMatrixDriver("matrix");

    await expect(driver.getChatFiles(ROOM_ID)).resolves.toEqual([shared]);
    await expect(driver.uploadChatFile(ROOM_ID, file)).resolves.toBe(shared);
    await expect(driver.downloadChatFile(ROOM_ID, "$file")).resolves.toBe(blob);

    expect(getChatFilesMock).toHaveBeenCalledWith(ROOM_ID);
    expect(uploadChatFileMock).toHaveBeenCalledWith(ROOM_ID, file);
    expect(downloadChatFileMock).toHaveBeenCalledWith(ROOM_ID, "$file");
  });
});

describe("LazyMatrixDriver notification rules", () => {
  it("advertises notification-rule support before the SDK loads", () => {
    expect(new LazyMatrixDriver("matrix").supportsNotificationRules).toBe(true);
  });

  it("forwards notification-rule calls to the real Matrix driver", async () => {
    const rules = {
      override: [],
      content: [],
      room: [],
      sender: [],
      underride: [],
    };
    getNotificationRulesMock.mockResolvedValue(rules);
    setNotificationRuleEnabledMock.mockResolvedValue(undefined);
    setNotificationRuleActionsMock.mockResolvedValue(undefined);
    isChatMutedMock.mockResolvedValue(true);
    setChatMutedMock.mockResolvedValue(undefined);
    const driver = new LazyMatrixDriver("matrix");

    await expect(driver.getNotificationRules()).resolves.toBe(rules);
    await driver.setNotificationRuleEnabled({
      kind: "override",
      ruleId: ".m.rule.master",
      enabled: true,
    });
    await driver.setNotificationRuleActions({
      kind: "underride",
      ruleId: ".m.rule.message",
      actions: ["dont_notify"],
    });
    await expect(driver.isChatMuted(ROOM_ID)).resolves.toBe(true);
    await driver.setChatMuted(ROOM_ID, true);

    expect(setNotificationRuleEnabledMock).toHaveBeenCalledWith({
      kind: "override",
      ruleId: ".m.rule.master",
      enabled: true,
    });
    expect(setNotificationRuleActionsMock).toHaveBeenCalledWith({
      kind: "underride",
      ruleId: ".m.rule.message",
      actions: ["dont_notify"],
    });
    expect(isChatMutedMock).toHaveBeenCalledWith(ROOM_ID);
    expect(setChatMutedMock).toHaveBeenCalledWith(ROOM_ID, true);
  });
});
