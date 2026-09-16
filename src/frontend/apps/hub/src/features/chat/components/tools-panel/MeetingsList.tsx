import { ChevronRight } from "@gouvfr-lasuite/ui-components/icons";
import { useTranslation } from "react-i18next";

import type { ChatMeeting } from "@/features/drivers/types";

import { formatMeetingLabel } from "./meetingLabels";
import { ToolsPanelHeader } from "./ToolsPanelHeader";

type MeetingsListProps = {
  /** Meetings that can still be joined, newest first. */
  ongoing: ChatMeeting[];
  isInitialLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onNewMeeting: () => void;
  onOpenHistory: () => void;
  onJoin: (meeting: ChatMeeting) => void;
};

/**
 * Landing view of the meetings panel: the two entry points of the mockup
 * ("New meeting" and "History") above the meetings that are still joinable.
 *
 * Scheduled meetings are not listed yet — nothing persists a planned date, so
 * the upcoming card only shows calls that are ongoing right now.
 */
export const MeetingsList = ({
  ongoing,
  isInitialLoading,
  isOpen,
  onClose,
  onNewMeeting,
  onOpenHistory,
  onJoin,
}: MeetingsListProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;

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
            tabIndex={isOpen ? 0 : -1}
          >
            {t("New meeting")}
          </button>
          <button
            type="button"
            className="hub__chat-meetings__action"
            onClick={onOpenHistory}
            tabIndex={isOpen ? 0 : -1}
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
          ) : ongoing.length === 0 ? (
            <p className="hub__chat-tools-panel__empty">
              {t("No meeting planned")}
            </p>
          ) : (
            <ul className="hub__chat-meetings__list">
              {ongoing.map((meeting) => (
                <li key={meeting.id} className="hub__chat-meetings__row">
                  <button
                    type="button"
                    className="hub__chat-meetings__row-button"
                    onClick={() => onJoin(meeting)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    <span className="hub__chat-meetings__row-label">
                      {formatMeetingLabel(meeting, t("Meeting"), locale)}
                    </span>
                    <span
                      className="hub__chat-meetings__row-badge"
                      data-ongoing="true"
                    >
                      {t("Ongoing")}
                    </span>
                    <span
                      className="hub__chat-meetings__row-chevron"
                      aria-hidden="true"
                    >
                      <ChevronRight />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
};
