import { Plus } from "@gouvfr-lasuite/ui-components/icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { Chat, ChatUnread } from "@/features/drivers/types";

import { ChatRow } from "./ChatRow";
import { SECTION_PREVIEW_COUNT } from "./chatSections";

export type LeftPanelSectionProps = {
  title: string;
  /** Already filtered and ordered, most recent first. */
  chats: Chat[];
  /** All of them, scrolling, instead of the first few. */
  isExpanded: boolean;
  onToggleExpanded: () => void;
  /** The espace the rail has chosen, carried into each row's link. */
  spaceId: string | null;
  unreadLookup: (ref: Chat["ref"]) => ChatUnread;
  accountLabels: Map<string, string>;
  showAccountLabels: boolean;
  addLabel?: string;
  onAdd?: () => void;
};

/**
 * One of the side panel's three lists.
 *
 * Collapsed it shows the five most recent and says how many there are, so the
 * panel stays a glance rather than a scroll. "See all" gives the section the
 * whole panel and its own scrollbar; the other two step aside, because three
 * lists sharing one scrollbar is what made the old panel hard to read.
 *
 * It carries no espace chooser of its own: the rail on the panel's left edge
 * is the single place that decides where these conversations come from.
 */
export const LeftPanelSection = ({
  title,
  chats,
  isExpanded,
  onToggleExpanded,
  spaceId,
  unreadLookup,
  accountLabels,
  showAccountLabels,
  addLabel,
  onAdd,
}: LeftPanelSectionProps) => {
  const { t } = useTranslation();
  const reactId = useId();
  const titleId = `${reactId}-title`;
  const panelId = `${reactId}-panel`;
  const visible = isExpanded ? chats : chats.slice(0, SECTION_PREVIEW_COUNT);
  const hasMore = chats.length > SECTION_PREVIEW_COUNT;

  return (
    <section
      className="hub__left-panel__section"
      data-expanded={isExpanded || undefined}
      aria-labelledby={titleId}
    >
      <div className="hub__left-panel__section__header-row">
        <h2 id={titleId} className="hub__left-panel__section__title">
          {title}
          {chats.length > 0 && (
            <span className="hub__left-panel__section__count">
              {chats.length}
            </span>
          )}
        </h2>
        {(hasMore || isExpanded) && (
          <button
            type="button"
            className="hub__left-panel__section__see-all"
            aria-expanded={isExpanded}
            aria-controls={panelId}
            onClick={onToggleExpanded}
          >
            {isExpanded ? t("Back") : t("See all")}
          </button>
        )}
        {onAdd && (
          <button
            type="button"
            className="hub__left-panel__section__add"
            aria-label={addLabel}
            title={addLabel}
            onClick={onAdd}
          >
            <Plus aria-hidden="true" />
          </button>
        )}
      </div>

      <div id={panelId} className="hub__left-panel__section__panel">
        {visible.length === 0 ? (
          <p className="hub__left-panel__section__empty">
            {t("No conversation here")}
          </p>
        ) : (
          <ul className="hub__left-panel__list">
            {visible.map((chat) => (
              <li key={`${chat.accountId}:${chat.id}`}>
                <ChatRow
                  chat={chat}
                  accountLabel={accountLabels.get(chat.accountId)}
                  showAccountLabel={showAccountLabels}
                  unread={unreadLookup(chat.ref)}
                  spaceId={spaceId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
