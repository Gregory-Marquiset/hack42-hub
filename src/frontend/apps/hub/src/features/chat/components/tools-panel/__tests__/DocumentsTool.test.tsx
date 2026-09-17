// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UseChatFilesResult } from "@/features/chat/hooks/useChatFiles";
import type { ChatFile, ChatRef } from "@/features/drivers/types";

import { DocumentsTool } from "../DocumentsTool";

const useChatFiles = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}|${options.name}` : key,
    i18n: { language: "fr", resolvedLanguage: "fr" },
  }),
}));
vi.mock("@/features/chat/hooks/useChatFiles", () => ({ useChatFiles }));

const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };
const FILE: ChatFile = {
  id: "$file",
  name: "compte-rendu.pdf",
  size: 1_500_000,
  mimeType: "application/pdf",
  senderId: "@alice:localhost",
  senderName: "Alice",
  sentAt: "2026-09-17T10:00:00.000Z",
  isEncrypted: true,
};

const state = (
  overrides: Partial<UseChatFilesResult> = {},
): UseChatFilesResult => ({
  files: [],
  isSupported: true,
  isInitialLoading: false,
  isError: false,
  retry: vi.fn(),
  uploadFiles: vi.fn(async () => {}),
  isUploading: false,
  downloadFile: vi.fn(async () => {}),
  pendingFileId: null,
  ...overrides,
});

const renderTool = () =>
  render(<DocumentsTool chatRef={CHAT_REF} isOpen onClose={vi.fn()} />);

describe("DocumentsTool", () => {
  beforeEach(() => {
    useChatFiles.mockReturnValue(state());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shares the documents picked on the device", () => {
    const current = state();
    useChatFiles.mockReturnValue(current);
    renderTool();
    const input = screen.getByTestId<HTMLInputElement>("documents-input");
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByLabelText("Add documents from your device"));
    expect(click).toHaveBeenCalledOnce();

    const picked = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.txt", { type: "text/plain" }),
    ];
    fireEvent.change(input, { target: { files: picked } });

    expect(current.uploadFiles).toHaveBeenCalledWith(picked);
    expect(useChatFiles).toHaveBeenCalledWith(CHAT_REF, true);
  });

  it("disables the add button while documents are being shared", () => {
    useChatFiles.mockReturnValue(state({ isUploading: true }));
    renderTool();

    const add = screen.getByLabelText("Add documents from your device");
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(add.getAttribute("aria-busy")).toBe("true");
  });

  it("lists the documents and downloads one", () => {
    const current = state({ files: [FILE] });
    useChatFiles.mockReturnValue(current);
    renderTool();

    expect(screen.getByText("compte-rendu.pdf")).toBeTruthy();
    const details = screen.getByText(/^Alice · /);
    expect(details.textContent).toContain("1,5");

    fireEvent.click(
      screen.getByLabelText("Download {{name}}|compte-rendu.pdf"),
    );
    expect(current.downloadFile).toHaveBeenCalledWith(FILE);
  });

  it("invites to add a first document", () => {
    renderTool();

    expect(
      screen.getByText(
        "No document shared yet. Use + to add one from your device.",
      ),
    ).toBeTruthy();
  });

  it("offers to retry when the documents cannot be loaded", () => {
    const current = state({ isError: true });
    useChatFiles.mockReturnValue(current);
    renderTool();

    expect(screen.getByRole("alert").textContent).toContain(
      "The documents could not be loaded.",
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(current.retry).toHaveBeenCalledOnce();
  });

  it("keeps the placeholder without the add button when unsupported", () => {
    useChatFiles.mockReturnValue(state({ isSupported: false }));
    renderTool();

    expect(screen.getByText("Available soon")).toBeTruthy();
    expect(
      screen.queryByLabelText("Add documents from your device"),
    ).toBeNull();
  });
});
