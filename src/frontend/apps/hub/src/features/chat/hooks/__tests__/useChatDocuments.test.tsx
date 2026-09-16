// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatKeys } from "../../chatKeys";
import type { ChatDocument, ChatRef } from "@/features/drivers/types";

import { useChatDocuments } from "../useChatDocuments";

const getChatDocuments = vi.fn<(chatId: string) => Promise<ChatDocument[]>>();
const registry = { get: vi.fn(() => ({ getChatDocuments })) };
vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => registry,
}));

const REF: ChatRef = { accountId: "account-a", chatId: "chat-1" };
const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientProvider";
  return Wrapper;
};

describe("useChatDocuments", () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    getChatDocuments.mockReset();
    registry.get.mockClear();
  });
  afterEach(() => queryClient.clear());

  it("reads room documents through the account's Driver", async () => {
    const documents = [
      { address: "https://example.test/a", title: "A", addedBy: "@a:test" },
    ];
    getChatDocuments.mockResolvedValueOnce(documents);
    const { result } = renderHook(() => useChatDocuments(REF, true), {
      wrapper: wrapper(queryClient),
    });
    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() => expect(result.current.documents).toEqual(documents));
    expect(registry.get).toHaveBeenCalledWith("account-a");
    expect(getChatDocuments).toHaveBeenCalledWith("chat-1");
    expect(queryClient.getQueryData(chatKeys.documents(REF))).toEqual(
      documents,
    );
  });

  it("does not fetch while the panel is closed", () => {
    renderHook(() => useChatDocuments(REF, false), {
      wrapper: wrapper(queryClient),
    });
    expect(getChatDocuments).not.toHaveBeenCalled();
  });

  it("exposes a failed read without changing documents", async () => {
    getChatDocuments.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useChatDocuments(REF, true), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.documents).toEqual([]);
  });
});
