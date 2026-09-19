import { Plus, XMark } from "@gouvfr-lasuite/ui-components/icons";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMeetingDuration } from "@/features/drivers/meetingTime";
import type {
  ChatMeeting,
  StartMeetingOptions,
} from "@/features/drivers/types";

import { DocsLinkDraft } from "./DocsLinkDraft";
import { Download } from "./MeetingIcons";
import { TEXT_FILE_ACCEPT } from "./textFile";
import { ToolsPanelHeader } from "./ToolsPanelHeader";
import { type DraftDocument, useDraftDocuments } from "./useDraftDocuments";

export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "./useDraftDocuments";

/** Planned lengths offered in the form, in minutes. */
export const MEETING_DURATIONS = [15, 30, 45, 60, 90, 120, 180] as const;
export const DEFAULT_MEETING_DURATION = 60;
/** What the Hub accepts (see `MeetingCreateSerializer`). */
export const MAX_AGENDA_LENGTH = 20_000;

type NewMeetingFormProps = {
  isOpen: boolean;
  /** Whether a call is already being created or scheduled. */
  isStarting: boolean;
  /**
   * The conversation's call in progress, if any: "Start now" would only
   * rejoin it without this form, so the form offers to join it instead.
   */
  ongoingMeeting?: ChatMeeting | null;
  onJoinOngoing: (meeting: ChatMeeting) => void;
  onClose: () => void;
  onBack: () => void;
  /** Starts the conversation's call right away ("Appel immédiat"). */
  onStartNow: (options: StartMeetingOptions) => void;
  /** Schedules the call at the chosen date and time. */
  onSchedule: (options: StartMeetingOptions) => void;
};

/** The local date and time of the form as a `Date`, when both are set. */
const toStartDate = (date: string, time: string): Date | undefined => {
  if (!date || !time) {
    return undefined;
  }
  const start = new Date(`${date}T${time}`);
  return Number.isNaN(start.getTime()) ? undefined : start;
};

type DocumentRowProps = {
  document: DraftDocument;
  tabIndex: number;
  onRemove: () => void;
};

/** One attached document: its name, a remove button and a download link. */
const DocumentRow = ({ document, tabIndex, onRemove }: DocumentRowProps) => {
  const { t } = useTranslation();

  return (
    <li className="hub__tools-list__row">
      <span className="hub__tools-list__label">{document.title}</span>
      <span className="hub__tools-list__actions">
        <button
          type="button"
          className="hub__tools-list__icon-button"
          aria-label={t("Remove {{name}}", { name: document.title })}
          tabIndex={tabIndex}
          onClick={onRemove}
        >
          <XMark />
        </button>
        <a
          className="hub__tools-list__icon-button"
          href={document.url}
          {...(document.isLocalFile
            ? { download: document.title }
            : { download: true, target: "_blank", rel: "noopener noreferrer" })}
          aria-label={t("Download {{name}}", { name: document.title })}
          tabIndex={tabIndex}
        >
          <Download />
        </a>
      </span>
    </li>
  );
};

/**
 * Meeting creation form. The title is renamable, the date opens the browser's
 * calendar, and the agenda and the documents accept .txt and .md files from
 * the user's device; documents can also be added by link ("Docs").
 *
 * Links are shown to every member with the meeting. The agenda and the picked
 * files are kept by the Hub for the meeting archive.
 */
export const NewMeetingForm = ({
  isOpen,
  isStarting,
  ongoingMeeting,
  onJoinOngoing,
  onClose,
  onBack,
  onStartNow,
  onSchedule,
}: NewMeetingFormProps) => {
  const { t } = useTranslation();
  const titleId = useId();
  const dateId = useId();
  const timeId = useId();
  const durationId = useId();
  const agendaId = useId();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(
    DEFAULT_MEETING_DURATION,
  );
  const [agenda, setAgenda] = useState("");
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const agendaFileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const {
    agendaFile,
    documents,
    attachments,
    links,
    attachAgendaFile,
    removeAgendaFile,
    attachDocumentFiles,
    addLink,
    removeDocument,
  } = useDraftDocuments();

  const tabIndex = isOpen ? 0 : -1;

  const meetingOptions: StartMeetingOptions = {
    title: title.trim() || undefined,
    plannedDurationMinutes: durationMinutes,
    agenda: agenda.trim() || undefined,
    attachments,
    // Links are listed for every member; picked files only go to the archive.
    documents: links,
  };
  const startsAt = toStartDate(date, time);
  const canSchedule = startsAt !== undefined && startsAt.getTime() > Date.now();

  /** The files of a picker, which is reset to fire again on the same file. */
  const picked = (event: ChangeEvent<HTMLInputElement>): File[] => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    return files;
  };

  return (
    <>
      <ToolsPanelHeader
        title={t("New meeting")}
        isOpen={isOpen}
        onClose={onClose}
        onBack={onBack}
        backLabel={t("Back to meetings")}
      />
      <div className="hub__chat-tools-panel__content">
        <div className="hub__chat-meetings__field">
          <label className="hub__chat-meetings__label" htmlFor={titleId}>
            {t("Meeting name")}
          </label>
          <input
            id={titleId}
            type="text"
            className="hub__chat-meetings__input"
            value={title}
            placeholder={t("E.g. Weekly team meeting")}
            maxLength={120}
            tabIndex={tabIndex}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="hub__chat-meetings__field">
          <label className="hub__chat-meetings__label" htmlFor={dateId}>
            {t("Meeting date")}
          </label>
          <input
            id={dateId}
            type="date"
            className="hub__chat-meetings__input"
            value={date}
            tabIndex={tabIndex}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div className="hub__chat-meetings__field-row">
          <div className="hub__chat-meetings__field">
            <label className="hub__chat-meetings__label" htmlFor={timeId}>
              {t("Start time")}
            </label>
            <input
              id={timeId}
              type="time"
              className="hub__chat-meetings__input"
              value={time}
              tabIndex={tabIndex}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <div className="hub__chat-meetings__field">
            <label className="hub__chat-meetings__label" htmlFor={durationId}>
              {t("Duration")}
            </label>
            <select
              id={durationId}
              className="hub__chat-meetings__input"
              value={durationMinutes}
              tabIndex={tabIndex}
              onChange={(event) =>
                setDurationMinutes(Number(event.target.value))
              }
            >
              {MEETING_DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatMeetingDuration(minutes * 60_000, t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="hub__chat-meetings__field">
          <div className="hub__chat-meetings__label-row">
            <label className="hub__chat-meetings__label" htmlFor={agendaId}>
              {t("Agenda")}
            </label>
            <button
              type="button"
              className="hub__tools-list__icon-button"
              aria-label={t("Attach an agenda file")}
              tabIndex={tabIndex}
              onClick={() => agendaFileInputRef.current?.click()}
            >
              <Plus />
            </button>
            <input
              ref={agendaFileInputRef}
              type="file"
              accept={TEXT_FILE_ACCEPT}
              hidden
              data-testid="agenda-file-input"
              onChange={(event) => void attachAgendaFile(picked(event))}
            />
          </div>
          <textarea
            id={agendaId}
            className="hub__chat-meetings__textarea"
            value={agenda}
            rows={4}
            placeholder={t("One item per line")}
            maxLength={MAX_AGENDA_LENGTH}
            tabIndex={tabIndex}
            onChange={(event) => setAgenda(event.target.value)}
          />
          {agenda.length >= MAX_AGENDA_LENGTH && (
            <p className="hub__chat-meetings__details-text" role="status">
              {t("The agenda is limited to {{max}} characters.", {
                max: MAX_AGENDA_LENGTH,
              })}
            </p>
          )}
          {agendaFile && (
            <ul className="hub__tools-list">
              <DocumentRow
                document={agendaFile}
                tabIndex={tabIndex}
                onRemove={removeAgendaFile}
              />
            </ul>
          )}
        </div>

        <section className="hub__chat-meetings__card">
          <div className="hub__chat-meetings__label-row">
            <h3 className="hub__chat-meetings__card-title">{t("Documents")}</h3>
            <button
              type="button"
              className="hub__tools-list__icon-button"
              aria-label={t("Attach document files")}
              tabIndex={tabIndex}
              onClick={() => documentFileInputRef.current?.click()}
            >
              <Plus />
            </button>
            <input
              ref={documentFileInputRef}
              type="file"
              accept={TEXT_FILE_ACCEPT}
              multiple
              hidden
              data-testid="document-file-input"
              onChange={(event) => void attachDocumentFiles(picked(event))}
            />
          </div>
          {documents.length === 0 && !isAddingDocument && (
            <p className="hub__chat-tools-panel__empty">
              {t("No document yet")}
            </p>
          )}
          <ul className="hub__tools-list">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                tabIndex={tabIndex}
                onRemove={() => removeDocument(doc)}
              />
            ))}
          </ul>

          <DocsLinkDraft
            tabIndex={tabIndex}
            onAdd={addLink}
            onOpenChange={setIsAddingDocument}
          />
        </section>

        {ongoingMeeting && (
          <p className="hub__chat-meetings__details-text" role="status">
            {t("A meeting is already in progress: join it, or plan yours.")}
          </p>
        )}
        <div className="hub__chat-meetings__start-actions">
          <button
            type="button"
            className="hub__chat-meetings__action"
            disabled={isStarting || !canSchedule}
            title={canSchedule ? undefined : t("Pick a date and a future time")}
            tabIndex={tabIndex}
            onClick={() =>
              startsAt && onSchedule({ ...meetingOptions, startsAt })
            }
          >
            {t("Schedule")}
          </button>
          {ongoingMeeting ? (
            <button
              type="button"
              className="hub__chat-meetings__action hub__chat-meetings__start-now"
              data-primary="true"
              tabIndex={tabIndex}
              onClick={() => onJoinOngoing(ongoingMeeting)}
            >
              {t("Join the ongoing meeting")}
            </button>
          ) : (
            <button
              type="button"
              className="hub__chat-meetings__action hub__chat-meetings__start-now"
              data-primary="true"
              disabled={isStarting}
              aria-busy={isStarting || undefined}
              tabIndex={tabIndex}
              onClick={() => onStartNow(meetingOptions)}
            >
              {t("Start now")}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
