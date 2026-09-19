// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UseMeetingDocumentsResult } from "@/features/chat/hooks/useMeetingDocuments";
import type { ChatMeeting, ChatRef } from "@/features/drivers/types";

import { MeetingDetails } from "../MeetingDetails";

const SELF_ID = "@me:localhost";
const CHAT_REF: ChatRef = { accountId: "matrix", chatId: "!room:localhost" };

const mocks = vi.hoisted(() => ({
  useMeetingDocuments: vi.fn(),
  addLink: vi.fn(async () => undefined),
  copyMeetingLink: vi.fn(async () => true),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}|${options.name}` : key,
    i18n: { language: "fr", resolvedLanguage: "fr" },
  }),
}));
vi.mock("@/features/auth/Auth", () => ({
  useAuth: () => ({ chatUser: { userId: SELF_ID } }),
}));
vi.mock("@/features/chat/hooks/useMeetingDocuments", () => ({
  useMeetingDocuments: mocks.useMeetingDocuments,
}));
vi.mock("@/features/chat/hooks/useChatMeetingActions", () => ({
  useChatMeetingActions: () => ({ addLink: mocks.addLink, isPending: false }),
}));
vi.mock("@/features/chat/meetings/copyMeetingLink", () => ({
  copyMeetingLink: mocks.copyMeetingLink,
}));

const MEETING: ChatMeeting = {
  id: "abc-defg-hij",
  url: "https://meet.example.com/abc-defg-hij",
  organizerId: SELF_ID,
  title: "Point",
  // A scheduled meeting: documents can still be added to it.
  startedAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
  plannedDurationMinutes: 45,
  documents: [
    { id: "d1", title: "Support", url: "https://docs.example.com/d1" },
    { id: "t1", title: "Local", url: "blob:local" },
  ],
};
const ATTACHMENT = {
  id: "a1",
  name: "plan.pdf",
  size: 2048,
  createdAt: "2026-09-17T08:00:00.000Z",
};

const documents = (
  overrides: Partial<UseMeetingDocumentsResult> = {},
): UseMeetingDocumentsResult => ({
  agenda: "1. Tour de table",
  attachments: [ATTACHMENT],
  isClosed: false,
  isInitialLoading: false,
  isError: false,
  retry: vi.fn(),
  addFiles: vi.fn(async () => {}),
  isAdding: false,
  createDocsDocument: vi.fn(async () => null),
  isCreatingDocument: false,
  download: vi.fn(async () => {}),
  pendingAttachmentId: null,
  ...overrides,
});

const renderDetails = (meeting: ChatMeeting = MEETING) => {
  const onJoin = vi.fn();
  render(
    <MeetingDetails
      chatRef={CHAT_REF}
      meeting={meeting}
      isOpen
      onClose={vi.fn()}
      onBack={vi.fn()}
      onJoin={onJoin}
    />,
  );
  return { onJoin };
};

describe("MeetingDetails", () => {
  beforeEach(() => {
    mocks.useMeetingDocuments.mockReturnValue(documents());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the invitation link and joins the meeting", () => {
    const { onJoin } = renderDetails();

    const link = screen.getByRole("textbox", {
      name: "Invitation link",
    }) as HTMLInputElement;
    expect(link.value).toBe(MEETING.url);
    fireEvent.click(screen.getByText("Copy the link"));
    expect(mocks.copyMeetingLink).toHaveBeenCalledWith(
      MEETING.url,
      expect.any(Function),
    );

    fireEvent.click(screen.getByText("Join the meeting"));
    expect(onJoin).toHaveBeenCalledWith(MEETING);
    expect(mocks.useMeetingDocuments).toHaveBeenCalledWith(
      { ref: CHAT_REF, meetingId: MEETING.id, isOrganizer: true },
      true,
    );
  });

  it("lists the agenda, the web links and the added files", () => {
    const current = documents();
    mocks.useMeetingDocuments.mockReturnValue(current);
    renderDetails();

    expect(screen.getByText("1. Tour de table")).toBeTruthy();
    const support = screen.getByText("Support").closest("a");
    expect(support?.getAttribute("href")).toBe("https://docs.example.com/d1");
    expect(screen.queryByText("Local")).toBeNull();
    expect(screen.getByText("plan.pdf")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Download {{name}}|plan.pdf"));
    expect(current.download).toHaveBeenCalledWith(ATTACHMENT);
  });

  it("adds files from the device", () => {
    const current = documents();
    mocks.useMeetingDocuments.mockReturnValue(current);
    renderDetails();
    const input = screen.getByTestId<HTMLInputElement>(
      "meeting-documents-input",
    );
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByLabelText("Add documents from your device"));
    expect(click).toHaveBeenCalledOnce();

    const file = new File(["x"], "cr.odt");
    fireEvent.change(input, { target: { files: [file] } });
    expect(current.addFiles).toHaveBeenCalledWith([file]);
  });

  it("lets the organizer list a Docs link", async () => {
    renderDetails();

    fireEvent.click(screen.getByLabelText("Add a Docs link"));
    const add = screen.getByText("Add") as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Link"), {
      target: { value: "javascript:alert(1)" },
    });
    expect(add.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "Compte rendu" },
    });
    fireEvent.change(screen.getByLabelText("Link"), {
      target: { value: "https://docs.example.com/cr" },
    });
    await act(async () => {
      fireEvent.click(add);
    });

    expect(mocks.addLink).toHaveBeenCalledWith(MEETING.id, {
      id: expect.stringMatching(/^link-/),
      title: "Compte rendu",
      url: "https://docs.example.com/cr",
    });
    expect(screen.queryByLabelText("Link")).toBeNull();
  });

  it("lets any member list a link and create a Docs document", async () => {
    const current = documents();
    const created = {
      id: "doc-1",
      title: "Compte rendu",
      url: "https://docs.test/docs/doc-1/",
    };
    current.createDocsDocument = vi.fn(async () => created);
    mocks.useMeetingDocuments.mockReturnValue(current);
    // Not the organizer: adding documents is open to the whole conversation.
    renderDetails({ ...MEETING, organizerId: "@alice:localhost" });

    fireEvent.click(screen.getByText("New Docs document"));
    fireEvent.change(screen.getByLabelText("Name of the new document"), {
      target: { value: "Compte rendu" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Create"));
    });

    expect(current.createDocsDocument).toHaveBeenCalledWith("Compte rendu");
    expect(mocks.addLink).toHaveBeenCalledWith(MEETING.id, created);
    expect(screen.getByLabelText("Add a Docs link")).toBeTruthy();
  });

  it("retries listing the created document rather than creating another", async () => {
    const current = documents();
    const created = { id: "doc-1", title: "CR", url: "https://docs.test/1/" };
    current.createDocsDocument = vi.fn(async () => created);
    mocks.useMeetingDocuments.mockReturnValue(current);
    mocks.addLink.mockRejectedValueOnce(new Error("refused"));
    renderDetails();

    fireEvent.click(screen.getByText("New Docs document"));
    await act(async () => {
      fireEvent.click(screen.getByText("Create"));
    });

    // The draft stays, on the document already created.
    expect(
      screen.getByText(
        "The document was created in Docs, but could not be listed with the meeting.",
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    expect(current.createDocsDocument).toHaveBeenCalledOnce();
    expect(mocks.addLink).toHaveBeenCalledTimes(2);
    expect(mocks.addLink).toHaveBeenLastCalledWith(MEETING.id, created);
    expect(screen.queryByLabelText("Name of the new document")).toBeNull();
  });

  it("recalls that a link alone gives no access", () => {
    renderDetails();

    fireEvent.click(screen.getByLabelText("Add a Docs link"));

    expect(
      screen.getByText(
        "Share the document in Docs too: a link alone opens for nobody else.",
      ),
    ).toBeTruthy();
  });

  it("keeps adding documents out of a closed meeting", () => {
    renderDetails({ ...MEETING, organizerId: "@alice:localhost" });

    expect(screen.getByLabelText("Add a Docs link")).toBeTruthy();
    expect(
      screen.getByLabelText("Add documents from your device"),
    ).toBeTruthy();
    expect(mocks.useMeetingDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ isOrganizer: false }),
      true,
    );
  });

  it("adds nothing to a closed meeting", () => {
    renderDetails({ ...MEETING, endedAt: "2026-09-18T09:00:00.000Z" });

    expect(
      screen.queryByLabelText("Add documents from your device"),
    ).toBeNull();
    expect(screen.queryByLabelText("Add a Docs link")).toBeNull();
  });

  it("adds nothing once the Hub closed the meeting", () => {
    mocks.useMeetingDocuments.mockReturnValue(documents({ isClosed: true }));
    renderDetails();

    expect(
      screen.queryByLabelText("Add documents from your device"),
    ).toBeNull();
    expect(screen.queryByText("New Docs document")).toBeNull();
  });

  it("says when there is no document", () => {
    mocks.useMeetingDocuments.mockReturnValue(
      documents({ agenda: "", attachments: [] }),
    );
    renderDetails({ ...MEETING, documents: [] });

    expect(screen.getByText("No document yet")).toBeTruthy();
  });

  it("offers to retry when the documents cannot be loaded", () => {
    const current = documents({ isError: true });
    mocks.useMeetingDocuments.mockReturnValue(current);
    renderDetails();

    fireEvent.click(screen.getByText("Retry"));
    expect(current.retry).toHaveBeenCalledOnce();
  });
});
