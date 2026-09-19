// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readChatSelfPresencePreference,
  writeChatSelfPresencePreference,
} from "../presencePreference";

describe("chat self-presence preference persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to automatic online mode", () => {
    expect(readChatSelfPresencePreference("account-a")).toBe("online");
  });

  it.each(["online", "offline"] as const)("persists %s", (preference) => {
    writeChatSelfPresencePreference("account-a", preference);
    expect(readChatSelfPresencePreference("account-a")).toBe(preference);
  });

  it("falls back to online when storage refuses access", () => {
    const refuse = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    getItem.mockImplementation(refuse);
    setItem.mockImplementation(refuse);
    try {
      expect(() =>
        writeChatSelfPresencePreference("account-a", "busy"),
      ).not.toThrow();
      expect(readChatSelfPresencePreference("account-a")).toBe("online");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("isolates accounts", () => {
    writeChatSelfPresencePreference("account-a", "online");
    writeChatSelfPresencePreference("account-b", "offline");

    expect(readChatSelfPresencePreference("account-a")).toBe("online");
    expect(readChatSelfPresencePreference("account-b")).toBe("offline");
  });
});
