import { Button } from "@gouvfr-lasuite/ui-components";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  QuestionMark,
} from "@gouvfr-lasuite/ui-components/icons";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { readChatRef, readSpaceId, spaceHref } from "@/features/chat/chatRefs";
import { CreateSalonModal } from "@/features/chat/components/CreateSalonModal";
import { CreateSpaceModal } from "@/features/chat/components/CreateSpaceModal";
import { countUnread, formatUnreadBadge } from "@/features/chat/unreadBadge";
import { useAvatarSrc } from "@/features/chat/hooks/useAvatarSrc";
import { useChatUnread } from "@/features/chat/hooks/useChatUnread";
import { useChats } from "@/features/chat/hooks/useChats";
import { useSpaces } from "@/features/chat/hooks/useSpaces";
import { useDriverEntries } from "@/features/drivers/DriverRegistry";
import type { AccountId, ChatVisual, Space } from "@/features/drivers/types";
import { AccountSelector } from "@/features/layouts/components/AccountSelector/AccountSelector";
import { Avatar } from "@/features/ui/components/avatar/Avatar";
import { LanguagePickerUserMenu } from "@/features/ui/components/user-profile/LanguagePickerUserMenu";

import { LeftPanelSection } from "./LeftPanelSection";
import { HubLogo } from "./HubLogo";
import {
  filterChatsBySpace,
  partitionChats,
  ChatSectionId,
} from "./chatSections";
import { SpaceTooltip } from "./SpaceTooltip";
import {
  RAIL_TOOLTIP_DELAY_MS,
  type RailTooltipAnchor,
  anchorFromRect,
} from "./railTooltip";
import { assignSpaceIcons } from "./spaceIcons";

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
/** Where the panel remembers whether it was pushed aside. */
const COLLAPSED_KEY = "hub.left-panel.collapsed";

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
  // Pushed aside, the panel keeps the espaces and hands the conversation the
  // rest of the window. Read after mount rather than during render: the
  // server has no `window`, and a hydration mismatch is worse than one frame
  // of an open panel.
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true");
    } catch {
      // A browser refusing storage is not a reason to render nothing.
    }
  }, []);
  const toggleCollapsed = useCallback(
    () =>
      setIsCollapsed((current) => {
        const next = !current;
        try {
          window.localStorage.setItem(COLLAPSED_KEY, String(next));
        } catch {
          // Then it simply reopens next time.
        }
        return next;
      }),
    [],
  );
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
    <aside
      className="hub__left-panel"
      data-collapsed={isCollapsed || undefined}
      aria-label={t("Side panel")}
    >
      {/* The brand sits in the corner and everything else hangs below it,
          rail included: it names the product once, and belongs to no list.
          The arrow beside it pushes the whole list of conversations away and
          leaves the espaces, so the conversation gets the window. */}
      <div className="hub__left-panel__brand">
        {isCollapsed ? (
          // Closed, the corner is 53px wide and the mark is what fits. The
          // whole thing is the way back, so the arrow is a small badge on it
          // rather than a second control taking the space the logo needs.
          <button
            type="button"
            className="hub__left-panel__brand-toggle"
            aria-label={t("Show the conversations")}
            title={t("Show the conversations")}
            aria-expanded={false}
            onClick={toggleCollapsed}
          >
            <HubLogo variant="mark" decorative />
            <span
              className="hub__left-panel__brand-toggle__chevron"
              aria-hidden="true"
            >
              <ChevronRight />
            </span>
          </button>
        ) : (
          <>
            <HubLogo />
            <button
              type="button"
              className="hub__left-panel__collapse"
              aria-label={t("Hide the conversations")}
              title={t("Hide the conversations")}
              aria-expanded
              onClick={toggleCollapsed}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <div className="hub__left-panel__main">
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
/**
 * An espace's face on the rail: its own picture when it has one, otherwise the
 * icon the rail gave it, on a colour derived from its name. Never initials -
 * a column of single letters is the one thing that reads as nothing.
 *
 * The icon is also what an unreachable picture falls back to, so a dead avatar
 * url leaves the rail intact. `useAvatarSrc` turns the `mxc://` into something
 * the browser can load.
 */
const SpaceAvatar = ({
  accountId,
  label,
  icon,
  visual,
}: {
  accountId: AccountId;
  label: string;
  icon: string;
  visual?: ChatVisual;
}) => {
  const src = useAvatarSrc(accountId, visual ?? { kind: "initials" });
  return (
    <Avatar
      label={label}
      src={visual?.kind === "image" ? src : undefined}
      decorative
    >
      <span className="material-icons" aria-hidden="true">
        {visual?.kind === "icon" ? visual.icon : icon}
      </span>
    </Avatar>
  );
};

/**
 * Shows an espace's name once the pointer has rested on its bubble.
 *
 * A quarter of a second, so crossing the rail on the way somewhere else does
 * not trail a name behind the pointer, and Escape dismisses it - a tooltip
 * that cannot be dismissed is a tooltip in the way.
 */
const useRailTooltip = () => {
  const [tooltip, setTooltip] = useState<
    { label: string; anchor: RailTooltipAnchor } | undefined
  >(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const hide = useCallback(() => {
    cancel();
    setTooltip(undefined);
  }, [cancel]);

  const show = useCallback(
    (target: HTMLElement, label: string) => {
      cancel();
      timer.current = setTimeout(() => {
        setTooltip({
          label,
          anchor: anchorFromRect(
            target.getBoundingClientRect(),
            window.innerHeight,
          ),
        });
      }, RAIL_TOOLTIP_DELAY_MS);
    },
    [cancel],
  );

  // A pending tooltip outliving the panel would set state on nothing.
  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    if (!tooltip) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [tooltip, hide]);

  const handlers = useMemo(
    () => (label: string) => ({
      onMouseEnter: (event: { currentTarget: HTMLElement }) =>
        show(event.currentTarget, label),
      onMouseLeave: hide,
      onFocus: (event: { currentTarget: HTMLElement }) =>
        show(event.currentTarget, label),
      onBlur: hide,
      // Following the link leaves the name hanging over the new page.
      onClick: hide,
    }),
    [show, hide],
  );

  return { tooltip, handlers, hide };
};

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
  // Every espace wears a different icon, decided once for the whole rail so
  // no two of them collide.
  const icons = useMemo(
    () => assignSpaceIcons(spaces.map((space) => space.id)),
    [spaces],
  );
  const { tooltip, handlers, hide: hideTooltip } = useRailTooltip();

  if (spaces.length === 0 && !canCreateSpace) {
    return null;
  }

  // Seven espaces used to be seven identical grey circles: the rail was
  // unreadable. An icon of its own, on the colour the palette derives from the
  // name, tells them apart at a glance without having to read anything.
  const bubble = (
    key: string,
    href: ReturnType<typeof spaceHref>,
    label: string,
    isActive: boolean,
    unread: number,
    icon: string,
    visual?: ChatVisual,
    accountId: AccountId = "",
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
      {...handlers(label)}
      className={clsx(
        "hub__left-panel__rail__item",
        isActive && "hub__left-panel__rail__item--active",
      )}
    >
      <SpaceAvatar
        accountId={accountId}
        label={label}
        icon={icon}
        visual={visual}
      />
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
      {/* A tooltip carries the viewport position the bubble had when the
          pointer stopped on it, so scrolling the rail has to take it away
          rather than leave it pointing at nothing. */}
      <div
        className="hub__left-panel__rail__list"
        onScroll={hideTooltip}
        onMouseLeave={hideTooltip}
      >
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
            icons.get(space.id) ?? "groups",
            space.visual,
            space.accountId,
          ),
        )}
      </div>
      {canCreateSpace && (
        <button
          type="button"
          className="hub__left-panel__rail__add"
          aria-label={t("New space")}
          {...handlers(t("New space"))}
          onClick={() => {
            hideTooltip();
            onCreateSpace();
          }}
        >
          <Plus aria-hidden="true" />
        </button>
      )}
      {tooltip && (
        <SpaceTooltip label={tooltip.label} anchor={tooltip.anchor} />
      )}
    </nav>
  );
};
