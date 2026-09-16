import {
  Button,
  DropdownMenu,
  type DropdownMenuItem,
  useDropdownMenu,
} from "@gouvfr-lasuite/ui-components";
import { File, Meet, Thread } from "@gouvfr-lasuite/ui-components/icons";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { formatChatGroupTimestamp } from "@/features/chat/formatTimestamp";
import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useStartChatMeeting } from "@/features/chat/hooks/useStartChatMeeting";
import type {
  ChatMeeting,
  ChatMeetingDocument,
  ChatRef,
} from "@/features/drivers/types";

/** Small delay before a hover reveals the history menu, so a mouse merely
 * passing over the button on its way elsewhere does not flash it open. */
const HOVER_OPEN_DELAY_MS = 150;

type MeetingButtonProps = {
  /** `null` while the conversation is still being fetched — the button stays
   * disabled and the history menu unavailable until it resolves. */
  chatRef: ChatRef | null;
};

type MeetingLink = {
  id: string;
  label: string;
  document: ChatMeetingDocument;
};

/**
 * Camera button that starts (or rejoins) the conversation's Meet call, and
 * on hover reveals its meeting history split into the documents and the
 * summaries attached to past calls.
 */
export const MeetingButton = ({ chatRef }: MeetingButtonProps) => {
  const { t, i18n } = useTranslation();
  const menu = useDropdownMenu();
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { meetings, isSupported } = useChatMeetings(chatRef, true);
  const { startMeeting, isPending } = useStartChatMeeting(chatRef);

  useEffect(
    () => () => {
      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current);
      }
    },
    [],
  );

  const openOnHover = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
    }
    openTimeoutRef.current = setTimeout(() => {
      menu.setIsOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  };

  const cancelHoverOpen = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  };

  const handleStartMeeting = () => {
    if (!chatRef || isPending) {
      return;
    }
    void startMeeting()
      .then((meeting) => {
        window.open(meeting.url, "_blank", "noopener,noreferrer");
      })
      .catch(() => {
        // useStartChatMeeting already surfaces a toast on failure.
      });
  };

  const documentLinks = useMemo<MeetingLink[]>(
    () =>
      meetings.flatMap((meeting) =>
        meeting.documents.map((document) => ({
          id: `document-${document.id}`,
          label: `${document.title} · ${formatChatGroupTimestamp(meeting.startedAt, i18n.language)}`,
          document,
        })),
      ),
    [meetings, i18n.language],
  );

  const summaryLinks = useMemo<MeetingLink[]>(
    () =>
      meetings
        .filter(
          (meeting): meeting is ChatMeeting & { summary: ChatMeetingDocument } =>
            meeting.summary !== undefined,
        )
        .map((meeting) => ({
          id: `summary-${meeting.id}`,
          label: `${meeting.summary.title} · ${formatChatGroupTimestamp(meeting.startedAt, i18n.language)}`,
          document: meeting.summary,
        })),
    [meetings, i18n.language],
  );

  const options = useMemo<DropdownMenuItem[]>(() => {
    const openLink = (url: string) => () => {
      window.open(url, "_blank", "noopener,noreferrer");
    };
    const toItems = (
      links: MeetingLink[],
      icon: ReactNode,
      emptyLabel: string,
    ): DropdownMenuItem[] =>
      links.length > 0
        ? links.map(({ id, label, document }) => ({
            id,
            label,
            icon,
            callback: openLink(document.url),
          }))
        : [{ id: `${emptyLabel}-empty`, label: emptyLabel, isDisabled: true }];

    return [
      { id: "documents-header", label: t("Meeting documents"), isDisabled: true },
      ...toItems(
        documentLinks,
        <File aria-hidden="true" />,
        t("No documents shared yet"),
      ),
      { type: "separator" },
      { id: "summaries-header", label: t("Meeting summaries"), isDisabled: true },
      ...toItems(
        summaryLinks,
        <Thread aria-hidden="true" />,
        t("No summary yet"),
      ),
    ];
  }, [documentLinks, summaryLinks, t]);

  const hasOngoingMeeting = meetings.some((meeting) => meeting.isOngoing);

  const button = (
    <Button
      type="button"
      variant="tertiary"
      color="neutral"
      size="small"
      className="hub__chat-header__icon-button"
      aria-label={t("Start a meeting")}
      aria-haspopup={isSupported ? "menu" : undefined}
      aria-expanded={isSupported ? menu.isOpen : undefined}
      data-active={hasOngoingMeeting}
      disabled={!chatRef || isPending}
      icon={<Meet />}
      onClick={handleStartMeeting}
    />
  );

  if (!isSupported) {
    return button;
  }

  // A native wrapper (rather than props on `Button` itself) carries the hover
  // affordance, since the design-system Button's prop surface is not known to
  // forward raw `onMouseEnter`/`onFocus` DOM handlers.
  const trigger = (
    <span
      className="hub__chat-header__meeting-trigger"
      onMouseEnter={openOnHover}
      onMouseLeave={cancelHoverOpen}
      onFocus={() => menu.setIsOpen(true)}
    >
      {button}
    </span>
  );

  return (
    <DropdownMenu options={options} {...menu} onOpenChange={menu.setIsOpen}>
      {trigger}
    </DropdownMenu>
  );
};
