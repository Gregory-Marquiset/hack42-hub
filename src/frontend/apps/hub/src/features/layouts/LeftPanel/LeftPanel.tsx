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
  // The rail is the only espace chooser: one place decides where the panel's
  // conversations come from, and every list follows it.
  const activeChatIds = useMemo(() => {
    if (!activeSpaceId) return null;
    const space = spaces.find((candidate) => candidate.id === activeSpaceId);
    return new Set(space?.chatIds ?? []);
  }, [activeSpaceId, spaces]);

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
      <SpacesRail
        spaces={spaces}
        activeSpaceId={activeSpaceId}
        canCreateSpace={canCreateSpace}
        onCreateSpace={() => setIsSpaceModalOpen(true)}
        unreadOfSpace={unreadOfSpace}
        unreadTotal={unreadTotal}
      />
      <div className="hub__left-panel__column">
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
        </div>

        {/* Three fixed lists, each showing its five most recent. "See all"
          gives one of them the whole panel and its own scrollbar: three lists
          sharing one is what made the old panel hard to read. */}
        <div
          className="hub__left-panel__body"
          data-expanded={expanded ?? undefined}
        >
          {SECTIONS.filter(
            ({ id }) => expanded === null || expanded === id,
          ).map(({ id, title, add }) => (
            <LeftPanelSection
              key={id}
              title={t(title)}
              chats={filterChatsBySpace(sections[id], activeChatIds)}
              isExpanded={expanded === id}
              onToggleExpanded={() =>
                setExpanded((current) => (current === id ? null : id))
              }
              spaceId={activeSpaceId}
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
          ))}
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
/**
 * The espaces, stacked on the panel's left edge.
 *
 * It is the only place that decides where the panel's conversations come
 * from: one chooser, and every list follows it. "Everything" sits on top
 * because a conversation needs no espace, and the "+" at the bottom so the
 * list of espaces can grow downwards without the button moving.
 */
const SpacesRail = ({
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

  // Seven espaces used to be seven identical grey circles: the rail was
  // unreadable. Initials on the colour the palette derives from the name tell
  // them apart at a glance, exactly as a person's avatar does.
  const bubble = (
    key: string,
    href: ReturnType<typeof spaceHref>,
    label: string,
    isActive: boolean,
    unread: number,
    icon?: string,
  ) => (
    <Link
      key={key}
      href={href}
      shallow
      aria-current={isActive ? "true" : undefined}
      aria-label={
        unread > 0
          ? `${label}, ${t("{{count}} unread messages", { count: unread })}`
          : label
      }
      title={label}
      className={clsx(
        "hub__left-panel__rail__item",
        isActive && "hub__left-panel__rail__item--active",
      )}
    >
      <Avatar label={label} decorative>
        {icon ? (
          <span className="material-icons" aria-hidden="true">
            {icon}
          </span>
        ) : undefined}
      </Avatar>
      {unread > 0 && (
        // The words are in the link's label; this is for the eye.
        <span className="hub__left-panel__rail__badge" aria-hidden="true">
          {formatUnreadBadge(unread)}
        </span>
      )}
    </Link>
  );

  return (
    <nav className="hub__left-panel__rail" aria-label={t("Spaces")}>
      <div className="hub__left-panel__rail__list">
        {bubble(
          "all",
          spaceHref(null, currentChatRef),
          t("All conversations"),
          activeSpaceId === null,
          unreadTotal,
          "forum",
        )}
        {spaces.length > 0 && (
          <span
            className="hub__left-panel__rail__separator"
            aria-hidden="true"
          />
        )}
        {spaces.map((space) =>
          bubble(
            space.id,
            spaceHref(space.id, currentChatRef),
            space.name,
            space.id === activeSpaceId,
            unreadOfSpace(space),
          ),
        )}
      </div>
      {canCreateSpace && (
        <button
          type="button"
          className="hub__left-panel__rail__add"
          aria-label={t("New space")}
          title={t("New space")}
          onClick={onCreateSpace}
        >
          <Plus aria-hidden="true" />
        </button>
      )}
    </nav>
  );
};
