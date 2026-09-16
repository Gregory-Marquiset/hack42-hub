// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatDocument, ChatRef } from "@/features/drivers/types";

import { DocumentsTool } from "../DocumentsTool";

const {
  refetch,
  addDocument,
  documentsQuery,
  useChatDocuments,
  useAddChatDocument,
  useChatDocumentCapabilities,
  capabilities,
  pending,
} = vi.hoisted(() => {
  const refetch = vi.fn();
  const addDocument =
    vi.fn<
      (params: { title: string; address: string }) => Promise<ChatDocument>
    >();
  const documentsQuery = {
    documents: [] as ChatDocument[],
    isInitialLoading: false,
    isError: false,
    refetch,
  };
  const pending = { isAdding: false };
  const capabilities = { canRead: true, canAdd: true, canManageAdders: false };
  return {
    refetch,
    pending,
    addDocument,
    documentsQuery,
    useChatDocuments: vi.fn(() => documentsQuery),
    useAddChatDocument: vi.fn(() => ({
      addDocument,
      isAdding: pending.isAdding,
    })),
    useChatDocumentCapabilities: vi.fn(() => capabilities),
    capabilities,
  };
});

vi.mock("../../../hooks/useChatDocuments", () => ({ useChatDocuments }));
vi.mock("../../../hooks/useAddChatDocument", () => ({ useAddChatDocument }));
vi.mock("../../../hooks/useChatDocumentCapabilities", () => ({
  useChatDocumentCapabilities,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { userId: string }) =>
      values ? key.replace("{{userId}}", values.userId) : key,
  }),
}));

const REF: ChatRef = { accountId: "account-a", chatId: "chat-1" };
const renderTool = () => render(<DocumentsTool chatRef={REF} isOpen />);

describe("DocumentsTool", () => {
  beforeEach(() => {
    pending.isAdding = false;
    capabilities.canAdd = true;
    documentsQuery.documents = [];
    documentsQuery.isInitialLoading = false;
    documentsQuery.isError = false;
    refetch.mockClear();
    addDocument.mockReset();
    useChatDocuments.mockClear();
    useAddChatDocument.mockClear();
  });

  it("keeps documents readable but hides add controls without permission", () => {
    capabilities.canAdd = false;
    documentsQuery.documents = [
      {
        address: "https://example.test/visible",
        title: "Visible",
        addedBy: "@a:test",
      },
    ];
    renderTool();

    expect(screen.getByRole("link", { name: "Visible" })).toBeTruthy();
    expect(screen.queryByText("Add document")).toBeNull();
    expect(useChatDocumentCapabilities).toHaveBeenCalledWith(REF, true);
  });

  it("closes an open add form when live permission is revoked", () => {
    const { rerender } = renderTool();
    fireEvent.click(screen.getByText("Add document"));
    expect(screen.getByLabelText("Title")).toBeTruthy();

    capabilities.canAdd = false;
    rerender(<DocumentsTool chatRef={REF} isOpen />);
    expect(screen.queryByLabelText("Title")).toBeNull();
  });

  it("shows add controls when live permission is granted", () => {
    capabilities.canAdd = false;
    const { rerender } = renderTool();
    expect(screen.queryByText("Add document")).toBeNull();

    capabilities.canAdd = true;
    rerender(<DocumentsTool chatRef={REF} isOpen />);
    expect(screen.getByText("Add document")).toBeTruthy();
  });

  it("shows loading, error with retry, and empty states", () => {
    documentsQuery.isInitialLoading = true;
    const { rerender } = renderTool();
    expect(screen.getByRole("status").textContent).toContain(
      "Loading documents…",
    );
    expect(screen.queryByText("Add document")).toBeNull();

    documentsQuery.isInitialLoading = false;
    documentsQuery.isError = true;
    rerender(<DocumentsTool chatRef={REF} isOpen />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Documents could not be loaded.",
    );
    expect(screen.queryByText("Add document")).toBeNull();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledOnce();

    documentsQuery.isError = false;
    rerender(<DocumentsTool chatRef={REF} isOpen />);
    expect(screen.getByText("No documents yet")).toBeTruthy();
    expect(useChatDocuments).toHaveBeenCalledWith(REF, true);
  });

  it("opens only web links and shows the stored Matrix user ID", () => {
    documentsQuery.documents = [
      {
        address: "https://example.test/doc",
        title: "Good",
        addedBy: "@a:test",
      },
      { address: "javascript:alert(1)", title: "Unsafe", addedBy: "@b:test" },
    ];
    renderTool();
    expect(
      screen.getByRole("link", { name: "Good" }).getAttribute("href"),
    ).toBe("https://example.test/doc");
    expect(screen.queryByRole("link", { name: "Unsafe" })).toBeNull();
    expect(screen.getByText("Unsafe")).toBeTruthy();
    expect(screen.getByText("Added by @a:test")).toBeTruthy();
  });

  it("trims fields and closes the form only after a successful add", async () => {
    addDocument.mockResolvedValue({
      address: "https://example.test/doc",
      title: "New",
      addedBy: "@a:test",
    });
    renderTool();
    fireEvent.click(screen.getByText("Add document"));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "  New  " },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "  https://example.test/doc  " },
    });
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() =>
      expect(addDocument).toHaveBeenCalledWith({
        title: "New",
        address: "https://example.test/doc",
      }),
    );
    await waitFor(() => expect(screen.queryByLabelText("Title")).toBeNull());
  });

  it("keeps the form and list on a failed write", async () => {
    documentsQuery.documents = [
      { address: "https://example.test/old", title: "Old", addedBy: "@a:test" },
    ];
    addDocument.mockRejectedValue(new Error("forbidden"));
    renderTool();
    fireEvent.click(screen.getByText("Add document"));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://example.test/new" },
    });
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Document could not be added.",
      ),
    );
    expect(screen.getByRole("link", { name: "Old" })).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "New",
    );
  });

  it("disables submission and shows progress while adding", () => {
    const { rerender } = renderTool();
    fireEvent.click(screen.getByText("Add document"));
    pending.isAdding = true;
    rerender(<DocumentsTool chatRef={REF} isOpen />);
    const addButton = screen.getByText("Adding…").closest("button");
    expect(addButton?.disabled).toBe(true);
    expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(
      true,
    );
  });

  it("rejects non-web addresses without calling the Driver", async () => {
    renderTool();
    fireEvent.click(screen.getByText("Add document"));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Unsafe" },
    });
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.submit(screen.getByLabelText("Title").closest("form")!);
    expect(addDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
