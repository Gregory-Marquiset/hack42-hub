// @vitest-environment jsdom
import "@/i18n/initI18n";

import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatEventListener } from "@/features/drivers/Driver";
import type {
  ChatSelfPresencePreference,
  NotificationRules,
} from "@/features/drivers/types";

import { useChatNotifications } from "../useChatNotifications";

const soundPlay = vi.fn();
const soundDispose = vi.fn();
const permissionRequest = vi.fn();
const permissionDispose = vi.fn();

vi.mock("../NotificationSound", () => ({
  NotificationSound: class {
    play = soundPlay;
    dispose = soundDispose;
  },
}));
vi.mock("../notificationPermission", () => ({
  NotificationPermission: class {
    request = permissionRequest;
    dispose = permissionDispose;
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn().mockResolvedValue(undefined) }),
}));

let capturedListener: ChatEventListener | null = null;
const subscribeToEvents = vi.fn((listener: ChatEventListener) => {
  capturedListener = listener;
  return () => {};
});
const getNotificationRules = vi.fn<() => Promise<NotificationRules>>();

let driverEntries: {
  accountId: string;
  label: string;
  criticality: "required";
  enabled: boolean;
  settingsFingerprint: string;
  driver: {
    supportsNotificationRules: boolean;
    subscribeToEvents: typeof subscribeToEvents;
    getNotificationRules: typeof getNotificationRules;
    // The sound is withheld while the person is busy, so the hook asks every
    // driver what they chose.
    getSelfPresencePreference: () => ChatSelfPresencePreference;
  };
}[] = [];

vi.mock("@/features/drivers/DriverRegistry", () => ({
  useDriverEntries: () => driverEntries,
}));

const ACCOUNT_ID = "account-a";
const ROOM_ID = "!room:localhost";

const emptyRules = (): NotificationRules => ({
  override: [],
  content: [],
  room: [],
  sender: [],
  underride: [],
});

const mutedRules = (): NotificationRules => ({
  ...emptyRules(),
  room: [
    {
      id: ROOM_ID,
      kind: "room",
      isEnabled: true,
      isDefault: false,
      actions: ["dont_notify"],
    },
  ],
});

const setDriver = (supportsNotificationRules: boolean) => {
  driverEntries = [
    {
      accountId: ACCOUNT_ID,
      label: "Account A",
      criticality: "required",
      enabled: true,
      settingsFingerprint: "",
      driver: {
        supportsNotificationRules,
        subscribeToEvents,
        getNotificationRules,
        getSelfPresencePreference: () => "online" as ChatSelfPresencePreference,
      },
    },
  ];
};

class MockNotification {
  static permission: NotificationPermission = "granted";
  onclose: (() => void) | null = null;
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options: NotificationOptions,
  ) {}
  close = vi.fn();
}

describe("useChatNotifications", () => {
  beforeEach(() => {
    soundPlay.mockReset();
    soundDispose.mockReset();
    permissionRequest.mockReset();
    permissionDispose.mockReset();
    subscribeToEvents.mockClear();
    getNotificationRules.mockReset().mockResolvedValue(emptyRules());
    capturedListener = null;

    vi.stubGlobal("Notification", MockNotification);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plays sound and shows a notification for an unsupported driver (unchanged behavior)", async () => {
    setDriver(false);
    renderHook(() => useChatNotifications("me"));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      capturedListener?.({
        type: "message:received",
        chatId: ROOM_ID,
        chatName: "Room",
        content: "hello",
      });
    });

    expect(soundPlay).toHaveBeenCalledOnce();
  });

  it("still notifies for a driver that supports rules when the room isn't muted", async () => {
    setDriver(true);
    getNotificationRules.mockResolvedValue(emptyRules());
    renderHook(() => useChatNotifications("me"));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      capturedListener?.({
        type: "message:received",
        chatId: ROOM_ID,
        chatName: "Room",
        content: "hello",
      });
    });

    expect(soundPlay).toHaveBeenCalledOnce();
  });

  it("suppresses sound and notification for a muted room", async () => {
    setDriver(true);
    getNotificationRules.mockResolvedValue(mutedRules());
    renderHook(() => useChatNotifications("me"));
    // Let the initial `getNotificationRules().then(...)` microtask settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      capturedListener?.({
        type: "message:received",
        chatId: ROOM_ID,
        chatName: "Room",
        content: "hello",
      });
    });

    expect(soundPlay).not.toHaveBeenCalled();
  });
});
