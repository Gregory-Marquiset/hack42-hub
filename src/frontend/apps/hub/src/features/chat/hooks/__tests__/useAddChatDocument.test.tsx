// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatKeys } from "../../chatKeys";
import type { ChatDocument, ChatRef } from "@/features/drivers/types";

import { useAddChatDocument } from "../useAddChatDocument";

const addChatDocument =
  vi.fn<
    (params: {
      chatId: string;
      id?: string;
      provider?: "docs";
      address: string;
      title: string;
    }) => Promise<ChatDocument>
  >();
const registry = { get: vi.fn(() => ({ addChatDocument })) };
vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => registry,
}));

const REF: ChatRef = { accountId: "account-a", chatId: "chat-1" };
const oldDocument: ChatDocument = {
  address: "https://example.test/old",
  title: "Old",
  addedBy: "@a:test",
};
const newDocument: ChatDocument = {
  address: "https://example.test/new",
  title: "New",
  addedBy: "@a:test",
};
const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientProvider";
  return Wrapper;
};

describe("useAddChatDocument", () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    queryClient = new QueryClient();
    queryClient.setQueryData(chatKeys.documents(REF), [oldDocument]);
    addChatDocument.mockReset();
    registry.get.mockClear();
  });
  afterEach(() => queryClient.clear());

  it("passes the room and fields to the Driver, then updates only its warm cache", async () => {
    addChatDocument.mockResolvedValue(newDocument);
    const otherRef: ChatRef = { accountId: "account-b", chatId: "chat-1" };
    queryClient.setQueryData(chatKeys.documents(otherRef), [oldDocument]);
    const { result } = renderHook(() => useAddChatDocument(REF), {
      wrapper: wrapper(queryClient),
    });
    await act(async () => {
      await result.current.addDocument({
        title: "New",
        address: "https://example.test/new",
      });
    });
    expect(registry.get).toHaveBeenCalledWith("account-a");
    expect(addChatDocument).toHaveBeenCalledWith({
      chatId: "chat-1",
      title: "New",
      address: "https://example.test/new",
    });
    expect(queryClient.getQueryData(chatKeys.documents(REF))).toEqual([
      oldDocument,
      newDocument,
    ]);
    expect(queryClient.getQueryData(chatKeys.documents(otherRef))).toEqual([
      oldDocument,
    ]);
  });

  it("does not change the list when the write fails", async () => {
    addChatDocument.mockRejectedValue(new Error("forbidden"));
    const { result } = renderHook(() => useAddChatDocument(REF), {
      wrapper: wrapper(queryClient),
    });
    await expect(
      act(() =>
        result.current.addDocument({
          title: "New",
          address: "https://example.test/new",
        }),
      ),
    ).rejects.toThrow("forbidden");
    expect(queryClient.getQueryData(chatKeys.documents(REF))).toEqual([
      oldDocument,
    ]);
  });

  it("passes Docs identity fields to the existing Driver mutation", async () => {
    const docsDocument: ChatDocument = {
      id: "doc-1",
      provider: "docs",
      address: "https://docs.test/docs/doc-1/",
      title: "Test Hub",
      addedBy: "@a:test",
    };
    addChatDocument.mockResolvedValue(docsDocument);
    const { result } = renderHook(() => useAddChatDocument(REF), {
      wrapper: wrapper(queryClient),
    });

    await act(async () => {
      await result.current.addDocument({
        id: "doc-1",
        provider: "docs",
        address: "https://docs.test/docs/doc-1/",
        title: "Test Hub",
      });
    });

    expect(addChatDocument).toHaveBeenCalledWith({
      chatId: "chat-1",
      id: "doc-1",
      provider: "docs",
      address: "https://docs.test/docs/doc-1/",
      title: "Test Hub",
    });
    expect(queryClient.getQueryData(chatKeys.documents(REF))).toEqual([
      oldDocument,
      docsDocument,
    ]);
  });

  it("does not duplicate an already synchronized document", async () => {
    addChatDocument.mockResolvedValue(newDocument);
    queryClient.setQueryData(chatKeys.documents(REF), [
      oldDocument,
      newDocument,
    ]);
    const { result } = renderHook(() => useAddChatDocument(REF), {
      wrapper: wrapper(queryClient),
    });
    await act(async () => {
      await result.current.addDocument({
        title: "New",
        address: "https://example.test/new",
      });
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(chatKeys.documents(REF))).toEqual([
        oldDocument,
        newDocument,
      ]),
    );
  });
});
