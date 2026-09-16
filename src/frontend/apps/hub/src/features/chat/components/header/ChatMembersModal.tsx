import { Button } from "@gouvfr-lasuite/ui-components";
import {
  ShareModal,
  type DropdownMenuOption,
} from "@gouvfr-lasuite/ui-components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useChatMembers } from "@/features/chat/hooks/useChatMembers";
import { useChatDocumentCapabilities } from "@/features/chat/hooks/useChatDocumentCapabilities";
import { useMyAvatarSrc } from "@/features/chat/hooks/useMyAvatarSrc";
import { useSetChatMemberDocumentAddPermission } from "@/features/chat/hooks/useSetChatMemberDocumentAddPermission";
import type { Chat, ChatMember } from "@/features/drivers/types";
import { useAvatarPortalOverlay } from "@/features/ui/components/avatar/useAvatarPortalOverlay";

type ChatMembersModalProps = {
  chat: Chat;
  isOpen: boolean;
  onClose: () => void;
};

const READ_ONLY_ROLE = "member";
const DOCUMENT_CONTRIBUTOR_ROLE = "document-contributor";
const READ_ONLY_ROLES: DropdownMenuOption[] = [
  { label: "", value: READ_ONLY_ROLE },
];
const ignoreSearch = () => {};
const ignoreInvite = () => {};

const toShareUser = (member: ChatMember) => ({
  id: member.id,
  full_name: member.name,
  email: member.secondaryText,
});

type MemberAccess = {
  permission: ChatMember["documentAddPermission"];
};

/** Membership stays read-only; admins may only toggle document contribution. */
export const ChatMembersModal = ({
  chat,
  isOpen,
  onClose,
}: ChatMembersModalProps) => {
  const { t } = useTranslation();
  const { present, pendingInvites, isInitialLoading, isError, refetch } =
    useChatMembers(chat.ref, isOpen);
  const avatarSrc = useMyAvatarSrc(chat.accountId);
  // `present` always sorts the current user first (see `sortChatMembers` in
  // MatrixDriver), so the member list's own row is reliably the first
  // `.c__share-member-item` in the (portaled) members section, in document
  // order — the library gives its `UserRow` no `src` prop to reach it any
  // other way. Not `:first-child`: the section's title div is the actual
  // first child, so that pseudo-class never matches a member row at all.
  useAvatarPortalOverlay(
    ".c__share-modal__members .c__share-member-item .c__avatar",
    isOpen ? avatarSrc : undefined,
  );
  const { canManageAdders } = useChatDocumentCapabilities(chat.ref, isOpen);
  const { setDocumentAddPermission, isUpdating } =
    useSetChatMemberDocumentAddPermission(chat.ref);
  const roles = useMemo<DropdownMenuOption[]>(
    () => [
      { label: t("Member"), value: READ_ONLY_ROLE },
      {
        label: t("Can add documents"),
        value: DOCUMENT_CONTRIBUTOR_ROLE,
      },
    ],
    [t],
  );
  const accesses = useMemo(
    () =>
      present.map((member) => ({
        id: member.id,
        role:
          member.documentAddPermission === "none"
            ? READ_ONLY_ROLE
            : DOCUMENT_CONTRIBUTOR_ROLE,
        permission: member.documentAddPermission ?? "none",
        user: toShareUser(member),
        is_explicit: false,
        can_delete: false,
      })),
    [present],
  );
  const invitations = useMemo(
    () =>
      pendingInvites.map((member) => ({
        id: member.id,
        role: READ_ONLY_ROLE,
        email: member.secondaryText,
        user: toShareUser(member),
      })),
    [pendingInvites],
  );

  return (
    <ShareModal<unknown, unknown, MemberAccess>
      modalTitle={t("Chat members")}
      isOpen={isOpen}
      onClose={onClose}
      canUpdate={canManageAdders && !isUpdating}
      canView={!isError}
      cannotViewMessage={t(
        "The members could not be loaded. Please try again.",
      )}
      cannotViewChildren={
        <Button variant="secondary" size="small" onClick={refetch}>
          {t("Try again")}
        </Button>
      }
      loading={isInitialLoading}
      searchUsersResult={[]}
      onSearchUsers={ignoreSearch}
      onInviteUser={ignoreInvite}
      invitationRoles={READ_ONLY_ROLES}
      accesses={accesses}
      getAccessRoles={(access) =>
        access.permission === "inherited"
          ? [
              {
                label: t("Can add documents (inherited)"),
                value: DOCUMENT_CONTRIBUTOR_ROLE,
              },
            ]
          : roles
      }
      accessRoleTopMessage={(access) =>
        access.permission === "inherited"
          ? t("This permission comes from broader room privileges.")
          : t("Document permission")
      }
      onUpdateAccess={(access, role) => {
        if (access.permission === "inherited") return;
        void setDocumentAddPermission({
          userId: access.id,
          canAdd: role === DOCUMENT_CONTRIBUTOR_ROLE,
        });
      }}
      invitations={invitations}
    />
  );
};
