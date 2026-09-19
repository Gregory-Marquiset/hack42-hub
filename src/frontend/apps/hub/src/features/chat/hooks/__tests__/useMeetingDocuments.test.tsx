// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRef } from "@/features/drivers/types";

import {
  MAX_MEETING_DOCUMENT_BYTES,
  useMeetingDocuments,
} from "../useMeetingDocuments";

const mocks = vi.hoisted(() => ({
  getOpenIdToken: vi.fn(async () => "openid"),
  fetchMeetingDocuments: vi.fn(),
  uploadMeetingDocument: vi.fn(),
  fetchMeetingDocumentFile: vi.fn(),
  notifyBrand: vi.fn(),
  notifyError: vi.fn(),
  saveFile: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ""),
      ),
    i18n: { language: "en" },
  }),
}));
vi.mock("@/features/api/APIError", () => ({
  APIError: class APIError extends Error {
    constructor(public code: number) {
      super(`API error ${code}`);
    }
  },
}));
vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => ({
    get: () => ({ getOpenIdToken: mocks.getOpenIdToken }),
  }),
}));
vi.mock("@/features/chat/api/meetings", () => ({
  fetchMeetingDocuments: mocks.fetchMeetingDocuments,
  uploadMeetingDocument: mocks.uploadMeetingDocument,
  fetchMeetingDocumentFile: mocks.fetchMeetingDocumentFile,
}));
vi.mock("@/features/ui/components/toast", () => ({
  notify: { brand: mocks.notifyBrand, error: mocks.notifyError },
}));
vi.mock("../../saveFile", () => ({ saveFile: mocks.saveFile }));

const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };
const ATTACHMENT = {
  id: "a1",
  name: "plan.pdf",
  size: 3,
  createdAt: "2026-09-17T08:00:00.000Z",
};

const setup = (isOrganizer = false, enabled = true) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useMeetingDocuments(
        { ref: CHAT_REF, meetingId: "abc-defg-hij", isOrganizer },
        enabled,
      ),
    { wrapper },
  );
};

describe("useMeetingDocuments", () => {
  beforeEach(() => {
    mocks.fetchMeetingDocuments.mockResolvedValue({
      agenda: "1. Tour de table",
      attachments: [ATTACHMENT],
      isClosed: false,
    });
    mocks.uploadMeetingDocument.mockResolvedValue(ATTACHMENT);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads the documents as a member, once shown", async () => {
    setup(false, false);
    expect(mocks.fetchMeetingDocuments).not.toHaveBeenCalled();

    const { result } = setup();

    await waitFor(() =>
      expect(result.current.attachments).toEqual([ATTACHMENT]),
    );
    expect(result.current.agenda).toBe("1. Tour de table");
    expect(mocks.fetchMeetingDocuments).toHaveBeenCalledWith(
      "abc-defg-hij",
      "openid",
    );
  });

  it("needs no Matrix proof for the organizer", async () => {
    const { result } = setup(true);

    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    expect(mocks.getOpenIdToken).not.toHaveBeenCalled();
    expect(mocks.fetchMeetingDocuments).toHaveBeenCalledWith(
      "abc-defg-hij",
      undefined,
    );
  });

  it("adds files one after the other and reads the list again", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));
    const first = new File(["a"], "a.odt");
    const second = new File(["b"], "b.odt");

    await act(() => result.current.addFiles([first, second]));

    expect(mocks.uploadMeetingDocument.mock.calls).toEqual([
      ["abc-defg-hij", first, "openid"],
      ["abc-defg-hij", second, "openid"],
    ]);
    expect(mocks.notifyBrand).toHaveBeenCalledWith(
      "Documents added to the meeting",
    );
    await waitFor(() =>
      expect(mocks.fetchMeetingDocuments).toHaveBeenCalledTimes(2),
    );
  });

  it("refuses a file that is too large", async () => {
    const { result } = setup();
    const large = new File(["x"], "video.mp4");
    Object.defineProperty(large, "size", {
      value: MAX_MEETING_DOCUMENT_BYTES + 1,
    });

    await act(() => result.current.addFiles([large]));

    expect(mocks.uploadMeetingDocument).not.toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(
      "A meeting document cannot be larger than 20 MB.",
    );
  });

  it("says when the meeting closed meanwhile", async () => {
    const { APIError } = await import("@/features/api/APIError");
    mocks.uploadMeetingDocument.mockRejectedValue(new APIError(409));
    const { result } = setup();

    await act(() => result.current.addFiles([new File(["a"], "a.odt")]));

    expect(mocks.notifyError).toHaveBeenCalledWith(
      "The meeting is closed: its documents can no longer change.",
    );
  });

  it("saves a downloaded document under its name", async () => {
    const blob = new Blob(["pdf"]);
    mocks.fetchMeetingDocumentFile.mockResolvedValue(blob);
    const { result } = setup();

    await act(() => result.current.download(ATTACHMENT));

    expect(mocks.fetchMeetingDocumentFile).toHaveBeenCalledWith(
      "abc-defg-hij",
      "a1",
      "openid",
    );
    expect(mocks.saveFile).toHaveBeenCalledWith(blob, "plan.pdf");
  });

  it("reports a failed download", async () => {
    mocks.fetchMeetingDocumentFile.mockRejectedValue(new Error("gone"));
    const { result } = setup();

    await act(() => result.current.download(ATTACHMENT));

    expect(mocks.saveFile).not.toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(
      "The document could not be downloaded. Please try again.",
    );
  });
});
