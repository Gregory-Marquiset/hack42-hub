// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Chat } from "@/features/drivers/types";

import { ChatMembersModal } from "../ChatMembersModal";

type CapturedAccess = {
  id: string;
  permission: "none" | "delegated" | "inherited";
};
type CapturedProps = {
  canUpdate: boolean;
  accesses: CapturedAccess[];
  getAccessRoles: (
    access: CapturedAccess,
  ) => Array<{ label: string; value: string }>;
  onUpdateAccess: (access: CapturedAccess, role: string) => void;
};

const { ShareModal, capabilities, members, setDocumentAddPermission } =
  vi.hoisted(() => ({
    ShareModal: vi.fn((props: unknown) => {
      void props;
      return null;
    }),
    capabilities: { canRead: true, canAdd: true, canManageAdders: true },
    members: {
      present: [
        {
          id: "@member:test",
          name: "Member",
          secondaryText: "@member:test",
          documentAddPermission: "none" as const,
        },
        {
          id: "@moderator:test",
          name: "Moderator",
          secondaryText: "@moderator:test",
          documentAddPermission: "inherited" as const,
        },
      ],
      pendingInvites: [],
      isInitialLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    setDocumentAddPermission: vi.fn(async () => undefined),
  }));

vi.mock("@gouvfr-lasuite/ui-components", () => ({
  Button: () => null,
  ShareModal,
}));
vi.mock("@/features/chat/hooks/useChatMembers", () => ({
  useChatMembers: () => members,
}));
vi.mock("@/features/chat/hooks/useChatDocumentCapabilities", () => ({
  useChatDocumentCapabilities: () => capabilities,
}));
vi.mock("@/features/chat/hooks/useSetChatMemberDocumentAddPermission", () => ({
  useSetChatMemberDocumentAddPermission: () => ({
    setDocumentAddPermission,
    isUpdating: false,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const chat = {
  id: "chat-1",
  accountId: "account-1",
  ref: { accountId: "account-1", chatId: "chat-1" },
  name: "Room",
  section: "all",
  kind: "group",
  participantIds: [],
  visual: { kind: "initials" },
} satisfies Chat;

const capturedProps = (): CapturedProps =>
  ShareModal.mock.calls[0][0] as CapturedProps;

describe("ChatMembersModal document permission", () => {
  beforeEach(() => {
    ShareModal.mockClear();
    setDocumentAddPermission.mockClear();
    capabilities.canManageAdders = true;
  });

  it("lets an admin grant the narrow document capability", () => {
    render(<ChatMembersModal chat={chat} isOpen onClose={vi.fn()} />);
    const props = capturedProps();
    const member = props.accesses[0];

    expect(props.canUpdate).toBe(true);
    expect(
      props.getAccessRoles(member).map(({ label }: { label: string }) => label),
    ).toEqual(["Member", "Can add documents"]);
    props.onUpdateAccess(member, "document-contributor");
    expect(setDocumentAddPermission).toHaveBeenCalledWith({
      userId: "@member:test",
      canAdd: true,
    });
  });

  it("does not offer revocation for inherited moderator access", () => {
    render(<ChatMembersModal chat={chat} isOpen onClose={vi.fn()} />);
    const props = capturedProps();
    const moderator = props.accesses[1];

    expect(props.getAccessRoles(moderator)).toEqual([
      {
        label: "Can add documents (inherited)",
        value: "document-contributor",
      },
    ]);
    props.onUpdateAccess(moderator, "member");
    expect(setDocumentAddPermission).not.toHaveBeenCalled();
  });

  it("keeps the control read-only for a normal member", () => {
    capabilities.canManageAdders = false;
    render(<ChatMembersModal chat={chat} isOpen onClose={vi.fn()} />);
    expect(capturedProps().canUpdate).toBe(false);
  });
});
