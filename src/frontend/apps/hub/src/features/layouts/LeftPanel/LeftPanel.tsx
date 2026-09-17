import { Button } from "@gouvfr-lasuite/ui-components";
import { Plus, QuestionMark } from "@gouvfr-lasuite/ui-components/icons";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { readChatRef, readSpaceId, spaceHref } from "@/features/chat/chatRefs";
import { CreateSalonModal } from "@/features/chat/components/CreateSalonModal";
import { CreateSpaceModal } from "@/features/chat/components/CreateSpaceModal";
import { countUnread, formatUnreadBadge } from "@/features/chat/unreadBadge";
import { useChatUnread } from "@/features/chat/hooks/useChatUnread";
import { useChats } from "@/features/chat/hooks/useChats";
import { useSpaces } from "@/features/chat/hooks/useSpaces";
import { useDriverEntries } from "@/features/drivers/DriverRegistry";
import type { Space } from "@/features/drivers/types";
import { AccountSelector } from "@/features/layouts/components/AccountSelector/AccountSelector";
import { Avatar } from "@/features/ui/components/avatar/Avatar";
import { LanguagePickerUserMenu } from "@/features/ui/components/user-profile/LanguagePickerUserMenu";

import { LeftPanelSection } from "./LeftPanelSection";
import { TchapLogo } from "./TchapLogo";
import {
  filterChatsBySpace,
  partitionChats,
  ChatSectionId,
} from "./chatSections";

type ActionItem =
  | { id: string; href: string; icon: ReactNode; label: string }
  | {
      id: string;
      href?: undefined;
      icon: ReactNode;
      label: string;
      keyShortcuts?: string;
      onClick: () => void;
    };

/** The row/menu-item second line: "You : ...", "{name} : ..." or the raw text. */
/** The three lists, in the order the panel shows them. */
const SECTIONS: ReadonlyArray<{
  id: ChatSectionId;
  title: string;
  add?: string;
}> = [
  { id: "favourites", title: "Favourites" },
  { id: "rooms", title: "Rooms", add: "New room" },
  { id: "directs", title: "Direct messages" },
];

export const LeftPanel = ({ onSearch }: { onSearch: () => void }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { spaces } = useSpaces();
  // No espace until one is picked. Falling back to the first one meant that
  // creating an espace silently narrowed the panel to its children, and every
  // room the person already had vanished with no way back - a space is a
  // grouping, not a container rooms have to belong to.
  const activeSpaceId = readSpaceId(router.query);

  // One unfiltered query for the whole panel: the sections show every espace
  // by default, and each narrows itself in memory from the espace's own child
  // ids rather than asking for a filtered list of its own.
  const unscopedChats = useChats();
  const unreadLookup = useChatUnread();
  // Totals from what the panel already holds: the espace carries its child
  // ids and the lookup is in memory, so no espace costs a request. A child
  // the person never joined simply counts as read.
  const unreadOfSpace = useCallback(
    (space: Space) =>
      space.chatIds.reduce(
        (total, chatId) =>
          total +
          countUnread(unreadLookup({ accountId: space.accountId, chatId })),
        0,
      ),
    [unreadLookup],
  );
  const entries = useDriverEntries();
  const accountLabels = new Map(
    entries.map((entry) => [entry.accountId, entry.label]),
  );
  const showAccountLabels = entries.length > 1;
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [isSalonModalOpen, setIsSalonModalOpen] = useState(false);
  // One section at a time may take the whole panel.
  const [expanded, setExpanded] = useState<ChatSectionId | null>(null);
  // Each section narrows itself. The espace picked at the top is where they
  // all start, so switching espace still moves the whole panel, but a section
  // can be held on another one without dragging the others along.
  const [overrides, setOverrides] = useState<
    Partial<Record<ChatSectionId, string | null>>
  >({});
  const spaceOf = (id: ChatSectionId) =>
    id in overrides ? (overrides[id] ?? null) : activeSpaceId;
  const setSpaceOf = (id: ChatSectionId, spaceId: string | null) =>
    setOverrides((current) => ({ ...current, [id]: spaceId }));
  const chatIdsOf = (spaceId: string | null) => {
    if (!spaceId) return null;
    const space = spaces.find((candidate) => candidate.id === spaceId);
    return space ? new Set(space.chatIds) : new Set<string>();
  };

  // What "everything" is worth: the espace bubbles only cover their own
  // children, and a direct message belongs to no espace at all.
  const unreadTotal = useMemo(
    () =>
      [...unscopedChats.favourites, ...unscopedChats.all].reduce(
        (total, chat) => total + countUnread(unreadLookup(chat.ref)),
        0,
      ),
    [unscopedChats.favourites, unscopedChats.all, unreadLookup],
  );

  const sections = useMemo(
    () => partitionChats([...unscopedChats.favourites, ...unscopedChats.all]),
    [unscopedChats.favourites, unscopedChats.all],
  );

  const canCreateSalon = entries.some(
    ({ driver }) => driver.supportsConversationCreation,
  );
  const canCreateSpace = entries.some(
    ({ driver }) => driver.supportsSpaceCreation,
  );

  const actions: ActionItem[] = [];
  if (entries.some(({ driver }) => driver.supportsConversationSearch)) {
    actions.push({
      id: "search",
      icon: (
        <span className="material-icons" aria-hidden="true">
          search
        </span>
      ),
      label: t("Search"),
      keyShortcuts: "Meta+K Control+K",
      onClick: onSearch,
    });
  }

  return (
    <aside className="hub__left-panel" aria-label={t("Side panel")}>
      <div className="hub__left-panel__top">
        <div className="hub__left-panel__logo">
          <TchapLogo />
        </div>

        <nav
          className="hub__left-panel__actions"
          aria-label={t("Quick actions")}
        >
          {actions.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </nav>

        <EspacesRow
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          canCreateSpace={canCreateSpace}
          onCreateSpace={() => setIsSpaceModalOpen(true)}
          unreadOfSpace={unreadOfSpace}
          unreadTotal={unreadTotal}
        />
      </div>

      {/* Three fixed lists, each showing its five most recent. "See all"
          gives one of them the whole panel and its own scrollbar: three lists
          sharing one is what made the old panel hard to read. */}
      <div
        className="hub__left-panel__body"
        data-expanded={expanded ?? undefined}
      >
        {SECTIONS.filter(({ id }) => expanded === null || expanded === id).map(
          ({ id, title, add }) => (
            <LeftPanelSection
              key={id}
              title={t(title)}
              chats={filterChatsBySpace(sections[id], chatIdsOf(spaceOf(id)))}
              isExpanded={expanded === id}
              onToggleExpanded={() =>
                setExpanded((current) => (current === id ? null : id))
              }
              spaces={spaces}
              spaceId={spaceOf(id)}
              onSpaceChange={(spaceId) => setSpaceOf(id, spaceId)}
              unreadLookup={unreadLookup}
              accountLabels={accountLabels}
              showAccountLabels={showAccountLabels}
              addLabel={add && canCreateSalon ? t(add) : undefined}
              onAdd={
                add && canCreateSalon
                  ? () => setIsSalonModalOpen(true)
                  : undefined
              }
            />
          ),
        )}
      </div>

      <div className="hub__left-panel__footer">
        <AccountSelector />
        <div className="hub__left-panel__footer__end">
          <Button
            variant="tertiary"
            color="neutral"
            icon={<QuestionMark size={24} />}
            aria-label={t("Help")}
          />
          <LanguagePickerUserMenu />
        </div>
      </div>

      <CreateSpaceModal
        isOpen={isSpaceModalOpen}
        onClose={() => setIsSpaceModalOpen(false)}
      />
      <CreateSalonModal
        isOpen={isSalonModalOpen}
        onClose={() => setIsSalonModalOpen(false)}
        spaces={spaces}
        defaultSpaceId={activeSpaceId}
      />
    </aside>
  );
};

const ActionRow = ({ action }: { action: ActionItem }) => {
  const body = (
    <>
      <span className="hub__left-panel__action__icon" aria-hidden="true">
        {action.icon}
      </span>
      <span className="hub__left-panel__action__label">{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className="hub__left-panel__action">
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="hub__left-panel__action"
      onClick={"onClick" in action ? action.onClick : undefined}
      aria-keyshortcuts={
        "keyShortcuts" in action ? action.keyShortcuts : undefined
      }
    >
      {body}
    </button>
  );
};

/**
 * Discord-style section header: title + chevron are one tight, content-sized
 * toggle button (not a full-width row) so a separate "+" button can sit on
 * the same line, flush to the right, to add straight into this section.
 */
const EspacesRow = ({
  spaces,
  activeSpaceId,
  canCreateSpace,
  onCreateSpace,
  unreadOfSpace,
  unreadTotal,
}: {
  spaces: Space[];
  activeSpaceId: string | null;
  canCreateSpace: boolean;
  onCreateSpace: () => void;
  unreadOfSpace: (space: Space) => number;
  unreadTotal: number;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const currentChatRef = readChatRef(router.query);

  if (spaces.length === 0 && !canCreateSpace) {
    return null;
  }

  return (
    <div className="hub__left-panel__spaces">
      <span className="hub__left-panel__spaces__title">{t("Spaces")}</span>
      {/* The "+" and its separator stay fixed and visible; only the espace
          bubbles themselves scroll horizontally underneath them. */}
      <div className="hub__left-panel__spaces__bar">
        <div className="hub__left-panel__spaces__row">
          {/* The way back. A room needs no espace, so the unfiltered list is
              a destination of its own rather than the absence of one. */}
          {spaces.length > 0 && (
            <Link
              href={spaceHref(null, currentChatRef)}
              shallow
              aria-current={activeSpaceId === null ? "true" : undefined}
              aria-label={
                unreadTotal > 0
                  ? `${t("All conversations")}, ${t("{{count}} unread messages", { count: unreadTotal })}`
                  : t("All conversations")
              }
              title={t("All conversations")}
              className={clsx(
                "hub__left-panel__spaces__item",
                activeSpaceId === null &&
                  "hub__left-panel__spaces__item--active",
              )}
            >
              <span className="hub__left-panel__spaces__name">
                {t("Everything")}
              </span>
              <Avatar label={t("All conversations")} decorative>
                <span className="material-icons" aria-hidden="true">
                  forum
                </span>
              </Avatar>
              {unreadTotal > 0 && (
                // The words are in the link's label; this is for the eye.
                <span
                  className="hub__left-panel__spaces__badge"
                  aria-hidden="true"
                >
                  {formatUnreadBadge(unreadTotal)}
                </span>
              )}
            </Link>
          )}
          {spaces.map((space) => {
            const isActive = space.id === activeSpaceId;
            const unread = unreadOfSpace(space);
            return (
              <Link
                key={space.id}
                href={spaceHref(space.id, currentChatRef)}
                shallow
                aria-current={isActive ? "true" : undefined}
                aria-label={
                  unread > 0
                    ? `${space.name}, ${t("{{count}} unread messages", { count: unread })}`
                    : space.name
                }
                title={space.name}
                className={clsx(
                  "hub__left-panel__spaces__item",
                  isActive && "hub__left-panel__spaces__item--active",
                )}
              >
                <span className="hub__left-panel__spaces__name">
                  {space.name}
                </span>
                <Avatar label={space.name} decorative>
                  <span className="material-icons" aria-hidden="true">
                    {space.visual.kind === "icon"
                      ? space.visual.icon
                      : "workspaces"}
                  </span>
                </Avatar>
                {unread > 0 && (
                  <span
                    className="hub__left-panel__spaces__badge"
                    aria-hidden="true"
                  >
                    {formatUnreadBadge(unread)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        {canCreateSpace && (
          <>
            {spaces.length > 0 && (
              <span
                className="hub__left-panel__spaces__separator"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              className="hub__left-panel__spaces__add"
              aria-label={t("New space")}
              title={t("New space")}
              onClick={onCreateSpace}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
