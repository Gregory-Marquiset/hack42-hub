import { ChevronRight, Link } from "@gouvfr-lasuite/ui-components/icons";
import { useTranslation } from "react-i18next";

import { copyMeetingLink } from "@/features/chat/meetings/copyMeetingLink";
import {
  formatMeetingProgress,
  getMeetingProgress,
} from "@/features/drivers/meetingTime";
import type { ChatMeeting } from "@/features/drivers/types";

import {
  formatMeetingDay,
  formatMeetingLabel,
  formatMeetingTime,
} from "./meetingLabels";
import { ToolsPanelHeader } from "./ToolsPanelHeader";

type MeetingsListProps = {
  /** Meetings in progress, newest first. */
  ongoing: ChatMeeting[];
  /** Scheduled meetings, soonest first. */
  upcoming: ChatMeeting[];
  /** Current time, to show the progress of ongoing meetings. */
  now: number;
  isInitialLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNewMeeting: () => void;
  onOpenHistory: () => void;
  onJoin: (meeting: ChatMeeting) => void;
  /** Shows a scheduled meeting: its invitation link and its documents. */
  onOpenDetails: (meeting: ChatMeeting) => void;
};

/**
 * Landing view of the meetings panel: the two entry points of the mockup
 * ("New meeting" and "History") above the meetings that can be joined, those
 * in progress first, then the scheduled ones.
 */
export const MeetingsList = ({
  ongoing,
  upcoming,
  now,
  isInitialLoading,
  isOpen,
  onClose,
  onNewMeeting,
  onOpenHistory,
  onJoin,
  onOpenDetails,
}: MeetingsListProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const tabIndex = isOpen ? 0 : -1;

  const badge = (meeting: ChatMeeting, isOngoing: boolean) => {
    if (!isOngoing) {
      return `${formatMeetingDay(meeting.startedAt, locale)} ${formatMeetingTime(meeting.startedAt, locale)}`;
    }
    const progress = formatMeetingProgress(getMeetingProgress(meeting, now));
    return `${t("Ongoing")} · ${progress}`;
  };

  const rows = [
    ...ongoing.map((meeting) => ({ meeting, isOngoing: true })),
    ...upcoming.map((meeting) => ({ meeting, isOngoing: false })),
  ];

  return (
    <>
      <ToolsPanelHeader
        title={t("Meetings")}
        isOpen={isOpen}
        onClose={onClose}
      />
      <div className="hub__chat-tools-panel__content">
        <div className="hub__chat-meetings__actions">
          <button
            type="button"
            className="hub__chat-meetings__action"
            onClick={onNewMeeting}
            tabIndex={tabIndex}
          >
            {t("New meeting")}
          </button>
          <button
            type="button"
            className="hub__chat-meetings__action"
            onClick={onOpenHistory}
            tabIndex={tabIndex}
          >
            {t("History")}
          </button>
        </div>

        <section className="hub__chat-meetings__card">
          <h3 className="hub__chat-meetings__card-title">
            {t("Upcoming meetings")}
          </h3>
          {isInitialLoading ? (
            <p className="hub__chat-tools-panel__empty" role="status">
              {t("Loading meetings…")}
            </p>
          ) : rows.length === 0 ? (
            <p className="hub__chat-tools-panel__empty">
              {t("No meeting planned")}
            </p>
          ) : (
            <ul className="hub__chat-meetings__list">
              {rows.map(({ meeting, isOngoing }) => {
                const isOverdue =
                  isOngoing && getMeetingProgress(meeting, now).isOverdue;
                const label = formatMeetingLabel(meeting, t("Meeting"), locale);
                return (
                  <li key={meeting.id} className="hub__chat-meetings__row">
                    <button
                      type="button"
                      className="hub__chat-meetings__row-button"
                      onClick={() =>
                        isOngoing ? onJoin(meeting) : onOpenDetails(meeting)
                      }
                      tabIndex={tabIndex}
                    >
                      <span className="hub__chat-meetings__row-label">
                        {label}
                      </span>
                      <span
                        className="hub__chat-meetings__row-badge"
                        data-ongoing={isOngoing || undefined}
                        data-overdue={isOverdue || undefined}
                      >
                        {badge(meeting, isOngoing)}
                      </span>
                      <span
                        className="hub__chat-meetings__row-chevron"
                        aria-hidden="true"
                      >
                        <ChevronRight />
                      </span>
                    </button>
                    <span className="hub__chat-meetings__row-actions">
                      <button
                        type="button"
                        className="hub__chat-meetings__icon-button"
                        aria-label={t("Copy the invitation link of {{name}}", {
                          name: label,
                        })}
                        title={t("Copy the invitation link")}
                        tabIndex={tabIndex}
                        onClick={() => void copyMeetingLink(meeting.url, t)}
                      >
                        <Link />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
};
