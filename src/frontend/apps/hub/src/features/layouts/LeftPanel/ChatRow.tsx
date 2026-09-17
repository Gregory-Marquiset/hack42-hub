import { Lock, Meet } from "@gouvfr-lasuite/ui-components/icons";
import clsx from "clsx";
import type { TFunction } from "i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";

import { chatHref, readChatRef, sameChatRef } from "@/features/chat/chatRefs";
import { formatChatListTimestamp } from "@/features/chat/formatTimestamp";
import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useNow } from "@/features/chat/meetings/useNow";
import { getConversationMeetingState } from "@/features/drivers/meetingTime";
import type { Chat, ChatUnread } from "@/features/drivers/types";
import { ChatPresenceAvatar } from "@/features/ui/components/presence/ChatPresenceAvatar";

const formatPreview = (t: TFunction, chat: Chat): string | undefined => {
  if (!chat.preview) return undefined;
  if (chat.preview.isOwnMessage) return `${t("You")} : ${chat.preview.text}`;
  if (chat.preview.senderName)
    return `${chat.preview.senderName} : ${chat.preview.text}`;
  return chat.preview.text;
};

export const ChatRow = ({
  chat,
  accountLabel,
  showAccountLabel,
  unread,
  spaceId,
}: {
  chat: Chat;
  accountLabel?: string;
  showAccountLabel: boolean;
  unread: ChatUnread;
  spaceId: string | null;
}) => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isActive = sameChatRef(readChatRef(router.query), chat.ref);
  // Read from the room's own state, so this costs no request. Only a call
  // actually in progress earns a mark here: "starting soon" belongs to the
  // conversation's own header, where there is room to say it.
  const { meetings } = useChatMeetings(chat.ref, true);
  const hasOngoingMeeting =
    getConversationMeetingState(meetings, useNow()) === "ongoing";
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const timestamp = chat.lastActivityAt
    ? formatChatListTimestamp(chat.lastActivityAt, locale)
    : null;
  const previewText = formatPreview(t, chat);
  // An explicit label replaces the link's content for assistive technology,
  // so the lock is spoken here or not at all.
  const linkLabel = [
    showAccountLabel && accountLabel
      ? `${chat.name} ${accountLabel}`
      : chat.name,
    ...(chat.encrypted ? [t("End-to-end encrypted")] : []),
    ...(hasOngoingMeeting ? [t("A meeting is in progress")] : []),
  ].join(", ");

  return (
    <Link
      href={chatHref(chat.ref, spaceId)}
      shallow
      aria-label={linkLabel}
      aria-current={isActive ? "page" : undefined}
      className={clsx(
        "hub__left-panel__chat",
        isActive && "hub__left-panel__chat--active",
      )}
    >
      <span className="hub__left-panel__chat__avatar">
        <ChatPresenceAvatar chat={chat} />
        {hasOngoingMeeting && (
          // A corner mark on the avatar: the one thing you want to spot
          // without opening the room. The link's label already says it; this
          // is for the eye. Availability owns the opposite corner.
          <span
            className="hub__left-panel__chat__meeting"
            data-testid="ongoing-meeting"
            aria-hidden="true"
          >
            <Meet />
          </span>
        )}
      </span>
      <span className="hub__left-panel__chat__body">
        <span className="hub__left-panel__chat__row">
          <span
            className={clsx(
              "hub__left-panel__chat__name",
              unread.unread && "hub__left-panel__chat__name--strong",
            )}
          >
            {/* Only the text truncates. The padlock is its sibling, so a
                long name shortens instead of eating the one mark that says
                this conversation is encrypted. */}
            <span className="hub__left-panel__chat__name__text">
              {chat.name}
              {showAccountLabel && accountLabel && (
                <span className="hub__left-panel__chat__account">
                  {" "}
                  · {accountLabel}
                </span>
              )}
            </span>
            {chat.encrypted && (
              // Two conversations with the same person, one clear and one
              // encrypted, are otherwise indistinguishable in this list. The
              // link's label already says it; the icon is for the eye.
              <Lock
                className="hub__left-panel__chat__encrypted"
                aria-hidden="true"
              />
            )}
          </span>
          {timestamp && (
            <span className="hub__left-panel__chat__time">{timestamp}</span>
          )}
        </span>
        <span className="hub__left-panel__chat__row">
          <span className="hub__left-panel__chat__preview">{previewText}</span>
          {unread.unread && unread.count > 0 && (
            <span className="hub__left-panel__chat__badge">{unread.count}</span>
          )}
        </span>
      </span>
      {unread.unread && (
        <span className="hub__visually-hidden">{t("Unread message")}</span>
      )}
    </Link>
  );
};

/**
 * Direct (1:1) conversations don't appear in the list below — they live here
 * instead, in their own collapsible section, so the tabs and list only ever
 * deal with groups. The whole header (title, count, chevron) is one plain,
 * borderless button — a hover background is the only affordance.
 */
