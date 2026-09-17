// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSelfPresencePreference } from "@/features/drivers/types";

import { chatKeys } from "../../chatKeys";
import {
  CHAT_PRESENCE_IDLE_MS,
  useChatPresenceActivity,
} from "../useChatPresenceActivity";

const makeDriver = () => ({
  supportsPresence: true,
  getCurrentUserId: vi.fn<() => string | null>(() => "@me:localhost"),
  getSelfPresencePreference: vi.fn(() => "online" as const),
  setUserPresence: vi.fn().mockResolvedValue(undefined),
});
let entries: Array<{
  accountId: string;
  driver: ReturnType<typeof makeDriver>;
}> = [];

vi.mock("@/features/drivers/DriverRegistry", () => ({
  useDriverEntries: () => entries,
}));

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientProvider";
  return Wrapper;
};

describe("useChatPresenceActivity", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    entries = [];
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  const seed = (accountId: string, preference: ChatSelfPresencePreference) => {
    queryClient.setQueryData(
      chatKeys.selfPresencePreference(accountId),
      preference,
    );
  };

  it("goes online, idles after five minutes, and returns online on activity", async () => {
    const driver = makeDriver();
    entries = [{ accountId: "account-a", driver }];
    seed("account-a", "online");

    renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });

    expect(driver.setUserPresence.mock.calls).toEqual([["online"]]);
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_IDLE_MS - 1_000));
    expect(driver.setUserPresence).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1_000));
    expect(driver.setUserPresence.mock.calls).toEqual([
      ["online"],
      ["unavailable"],
    ]);

    fireEvent.pointerDown(document);
    expect(driver.setUserPresence.mock.calls).toEqual([
      ["online"],
      ["unavailable"],
      ["online"],
    ]);
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document);
    window.dispatchEvent(new FocusEvent("focus"));
    expect(driver.setUserPresence).toHaveBeenCalledTimes(3);
    await act(async () => {});
    expect(
      queryClient.getQueryData(
        chatKeys.userPresence("account-a", "@me:localhost"),
      ),
    ).toEqual({ userId: "@me:localhost", state: "online" });
  });

  it("never leaves a manual offline preference on local activity", () => {
    const driver = makeDriver();
    entries = [{ accountId: "account-a", driver }];
    seed("account-a", "offline");

    renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });

    expect(driver.setUserPresence.mock.calls).toEqual([["offline"]]);
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_IDLE_MS));
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document);
    window.dispatchEvent(new FocusEvent("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(driver.setUserPresence.mock.calls).toEqual([["offline"]]);
  });

  it("never lets activity or idling touch a busy preference", () => {
    // Busy is what silences notification sounds. Typing a message is not a
    // request to become available, and going to lunch is not a request for
    // quiet: neither may move it.
    const driver = makeDriver();
    entries = [{ accountId: "account-a", driver }];
    seed("account-a", "busy");

    renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });

    // Published as the closest value Matrix has, once.
    expect(driver.setUserPresence.mock.calls).toEqual([["unavailable"]]);
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_IDLE_MS));
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document);
    window.dispatchEvent(new FocusEvent("focus"));
    expect(driver.setUserPresence.mock.calls).toEqual([["unavailable"]]);
  });

  it("holds availability at busy for as long as a call lasts", () => {
    // Nothing is stored, so leaving needs nothing undone - and a browser
    // closed mid-call cannot strand anyone as busy.
    const driver = makeDriver();
    entries = [{ accountId: "account-a", driver }];
    seed("account-a", "online");

    const view = renderHook(
      ({ inCall }: { inCall: boolean }) => useChatPresenceActivity(inCall),
      { wrapper: wrapper(queryClient), initialProps: { inCall: true } },
    );

    expect(driver.setUserPresence.mock.calls).toEqual([["unavailable"]]);
    // Typing in the Hub during a call does not mean you are free.
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_IDLE_MS));
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document);
    expect(driver.setUserPresence.mock.calls).toEqual([["unavailable"]]);

    // Leaving restores the chosen state, which was never touched.
    view.rerender({ inCall: false });
    expect(driver.setUserPresence.mock.calls).toEqual([
      ["unavailable"],
      ["online"],
    ]);
  });

  it("isolates automatic and offline modes between accounts", () => {
    const automatic = makeDriver();
    const offline = makeDriver();
    entries = [
      { accountId: "account-a", driver: automatic },
      { accountId: "account-b", driver: offline },
    ];
    seed("account-a", "online");
    seed("account-b", "offline");

    renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_IDLE_MS));
    fireEvent.pointerDown(document);

    expect(automatic.setUserPresence.mock.calls).toEqual([
      ["online"],
      ["unavailable"],
      ["online"],
    ]);
    expect(offline.setUserPresence.mock.calls).toEqual([["offline"]]);
  });

  it("cleans listeners and timers on unmount", () => {
    const driver = makeDriver();
    entries = [{ accountId: "account-a", driver }];
    seed("account-a", "online");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    const removeWindowListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });
    unmount();
    act(() => vi.advanceTimersByTime(CHAT_PRESENCE_IDLE_MS));
    fireEvent.pointerDown(document);

    expect(driver.setUserPresence.mock.calls).toEqual([["online"]]);
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
    );
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
    expect(removeDocumentListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeWindowListener).toHaveBeenCalledWith(
      "focus",
      expect.any(Function),
    );
  });

  it("moves activity ownership to a replacement driver", () => {
    const oldDriver = makeDriver();
    entries = [{ accountId: "account-a", driver: oldDriver }];
    seed("account-a", "online");
    const { rerender } = renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });

    const newDriver = makeDriver();
    entries = [{ accountId: "account-a", driver: newDriver }];
    rerender();
    fireEvent.pointerDown(document);

    expect(oldDriver.setUserPresence).toHaveBeenCalledOnce();
    expect(newDriver.setUserPresence).toHaveBeenCalledOnce();
    expect(newDriver.setUserPresence).toHaveBeenCalledWith("online");
  });

  it("waits for the account driver to become connected", () => {
    const driver = makeDriver();
    driver.getCurrentUserId.mockReturnValue(null);
    entries = [{ accountId: "account-a", driver }];
    seed("account-a", "online");
    const { rerender } = renderHook(() => useChatPresenceActivity(), {
      wrapper: wrapper(queryClient),
    });

    fireEvent.pointerDown(document);
    expect(driver.setUserPresence).not.toHaveBeenCalled();

    driver.getCurrentUserId.mockReturnValue("@me:localhost");
    rerender();
    expect(driver.setUserPresence).toHaveBeenCalledWith("online");
  });
});
