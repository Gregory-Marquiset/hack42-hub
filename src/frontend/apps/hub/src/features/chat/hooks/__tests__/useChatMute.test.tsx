// @vitest-environment jsdom
import "@/i18n/initI18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRef } from "@/features/drivers/types";

import { useChatMute } from "../useChatMute";

const { isChatMuted, setChatMuted, notifyError } = vi.hoisted(() => ({
  isChatMuted: vi.fn<(chatId: string) => Promise<boolean>>(),
  setChatMuted: vi.fn<(chatId: string, muted: boolean) => Promise<void>>(),
  notifyError: vi.fn(),
}));

const driver = { supportsNotificationRules: true, isChatMuted, setChatMuted };

vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => ({ get: () => driver }),
  useDriverEntries: () => [
    {
      accountId: "account-a",
      label: "Account A",
      criticality: "required",
      enabled: true,
      settingsFingerprint: "",
      driver,
    },
  ],
}));
vi.mock("@/features/ui/components/toast", () => ({
  notify: { error: notifyError },
}));

const CHAT_REF: ChatRef = { accountId: "account-a", chatId: "chat-1" };

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientProvider";
  return Wrapper;
};

describe("useChatMute", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    isChatMuted.mockReset().mockResolvedValue(false);
    setChatMuted.mockReset().mockResolvedValue(undefined);
    notifyError.mockReset();
  });

  afterEach(() => queryClient.clear());

  it("reads the initial mute state from the driver", async () => {
    isChatMuted.mockResolvedValue(true);
    const { result } = renderHook(() => useChatMute(CHAT_REF, true), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isMuted).toBe(true));
    expect(isChatMuted).toHaveBeenCalledWith("chat-1");
  });

  it("optimistically flips the mute state before the driver resolves", async () => {
    let resolveMutation: (() => void) | undefined;
    setChatMuted.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const { result } = renderHook(() => useChatMute(CHAT_REF, true), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    act(() => result.current.setMuted(true));

    await waitFor(() => expect(result.current.isMuted).toBe(true));
    act(() => resolveMutation?.());
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("rolls back and notifies on failure", async () => {
    setChatMuted.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useChatMute(CHAT_REF, true), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    act(() => result.current.setMuted(true));

    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce());
    expect(result.current.isMuted).toBe(false);
  });

  it("reports isSupported from the account's driver capability flag", async () => {
    const { result } = renderHook(() => useChatMute(CHAT_REF, true), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isSupported).toBe(true));
  });
});
