// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatFile, ChatRef } from "@/features/drivers/types";

import { MAX_CHAT_FILE_BYTES, useChatFiles } from "../useChatFiles";

const mocks = vi.hoisted(() => ({
  driver: {
    supportsChatFiles: true,
    getChatFiles: vi.fn(),
    uploadChatFile: vi.fn(),
    downloadChatFile: vi.fn(),
  },
  notifyBrand: vi.fn(),
  notifyError: vi.fn(),
  saveFile: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => ({ get: () => mocks.driver }),
  useDriverEntries: () => [{ accountId: "matrix", driver: mocks.driver }],
}));
vi.mock("@/features/ui/components/toast", () => ({
  notify: { brand: mocks.notifyBrand, error: mocks.notifyError },
}));
vi.mock("../../saveFile", () => ({ saveFile: mocks.saveFile }));

const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };
const FILE: ChatFile = {
  id: "$file",
  name: "cr.pdf",
  senderId: "@alice:localhost",
  sentAt: "2026-09-17T10:00:00.000Z",
  isEncrypted: false,
};

const setup = (enabled = true) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useChatFiles(CHAT_REF, enabled), { wrapper });
};

describe("useChatFiles", () => {
  beforeEach(() => {
    mocks.driver.getChatFiles.mockResolvedValue([FILE]);
    mocks.driver.uploadChatFile.mockResolvedValue(FILE);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists the documents only once the panel is open", async () => {
    const closed = setup(false);
    expect(closed.result.current.files).toEqual([]);
    expect(mocks.driver.getChatFiles).not.toHaveBeenCalled();

    const { result } = setup();
    await waitFor(() => expect(result.current.files).toEqual([FILE]));
    expect(mocks.driver.getChatFiles).toHaveBeenCalledWith(CHAT_REF.chatId);
  });

  it("shares the documents one after the other and refreshes the list", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.files).toHaveLength(1));
    const first = new File(["a"], "a.txt");
    const second = new File(["b"], "b.txt");

    await act(() => result.current.uploadFiles([first, second]));

    expect(mocks.driver.uploadChatFile.mock.calls).toEqual([
      [CHAT_REF.chatId, first],
      [CHAT_REF.chatId, second],
    ]);
    expect(mocks.notifyBrand).toHaveBeenCalledWith("Documents shared");
    await waitFor(() =>
      expect(mocks.driver.getChatFiles).toHaveBeenCalledTimes(2),
    );
  });

  it("refuses a document that is too large", async () => {
    const { result } = setup();
    const large = new File(["x"], "video.mp4");
    Object.defineProperty(large, "size", { value: MAX_CHAT_FILE_BYTES + 1 });

    await act(() => result.current.uploadFiles([large]));

    expect(mocks.driver.uploadChatFile).not.toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(
      "A document cannot be larger than 50 MB.",
    );
  });

  it("reports a failed upload", async () => {
    mocks.driver.uploadChatFile.mockRejectedValue(new Error("offline"));
    const { result } = setup();

    await act(() => result.current.uploadFiles([new File(["a"], "a.txt")]));

    expect(mocks.notifyBrand).not.toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(
      "The document could not be shared. Please try again.",
    );
  });

  it("saves a downloaded document under its name", async () => {
    const blob = new Blob(["pdf"]);
    mocks.driver.downloadChatFile.mockResolvedValue(blob);
    const { result } = setup();

    await act(() => result.current.downloadFile(FILE));

    expect(mocks.driver.downloadChatFile).toHaveBeenCalledWith(
      CHAT_REF.chatId,
      "$file",
    );
    expect(mocks.saveFile).toHaveBeenCalledWith(blob, "cr.pdf");
  });

  it("reports a failed download", async () => {
    mocks.driver.downloadChatFile.mockRejectedValue(new Error("gone"));
    const { result } = setup();

    await act(() => result.current.downloadFile(FILE));

    expect(mocks.saveFile).not.toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(
      "The document could not be downloaded. Please try again.",
    );
  });
});
