import { Plus, XMark } from "@gouvfr-lasuite/ui-components/icons";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Download } from "./MeetingIcons";
import { ToolsPanelHeader } from "./ToolsPanelHeader";

type DraftDocument = {
  id: string;
  title: string;
  url: string;
};

type NewMeetingFormProps = {
  isOpen: boolean;
  /** Whether the immediate call is already being created. */
  isStarting: boolean;
  onClose: () => void;
  onBack: () => void;
  /** Starts the conversation's call right away ("Appel immédiat"). */
  onStartNow: () => void;
};

/**
 * Meeting creation form. The title is renamable, the date opens the browser's
 * calendar and the documents column lists the supports of the meeting.
 *
 * Nothing is persisted yet: the Hub has no store for a planned meeting, so the
 * title, date, agenda and documents live in component state and only the
 * immediate call reaches the server.
 */
export const NewMeetingForm = ({
  isOpen,
  isStarting,
  onClose,
  onBack,
  onStartNow,
}: NewMeetingFormProps) => {
  const { t } = useTranslation();
  const dateId = useId();
  const agendaId = useId();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [agenda, setAgenda] = useState("");
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  const tabIndex = isOpen ? 0 : -1;

  const addDocument = () => {
    const url = draftUrl.trim();
    if (url === "") {
      return;
    }
    setDocuments((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        title: draftTitle.trim() === "" ? url : draftTitle.trim(),
        url,
      },
    ]);
    setDraftTitle("");
    setDraftUrl("");
    setIsAddingDocument(false);
  };

  const removeDocument = (id: string) => {
    setDocuments((current) => current.filter((doc) => doc.id !== id));
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
        <input
          type="text"
          className="hub__chat-meetings__title-input"
          value={title}
          placeholder={t("New meeting")}
          aria-label={t("Meeting name")}
          tabIndex={tabIndex}
          onChange={(event) => setTitle(event.target.value)}
        />

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

        <div className="hub__chat-meetings__field">
          <label className="hub__chat-meetings__label" htmlFor={agendaId}>
            {t("Agenda")}
          </label>
          <textarea
            id={agendaId}
            className="hub__chat-meetings__textarea"
            value={agenda}
            rows={4}
            placeholder={t("One item per line")}
            tabIndex={tabIndex}
            onChange={(event) => setAgenda(event.target.value)}
          />
        </div>

        <section className="hub__chat-meetings__card">
          <h3 className="hub__chat-meetings__card-title">{t("Documents")}</h3>
          {documents.length === 0 && !isAddingDocument && (
            <p className="hub__chat-tools-panel__empty">
              {t("No document yet")}
            </p>
          )}
          <ul className="hub__chat-meetings__list">
            {documents.map((doc) => (
              <li key={doc.id} className="hub__chat-meetings__row">
                <span className="hub__chat-meetings__row-label">
                  {doc.title}
                </span>
                <span className="hub__chat-meetings__row-actions">
                  <button
                    type="button"
                    className="hub__chat-meetings__icon-button"
                    aria-label={t("Remove {{name}}", { name: doc.title })}
                    tabIndex={tabIndex}
                    onClick={() => removeDocument(doc.id)}
                  >
                    <XMark />
                  </button>
                  <a
                    className="hub__chat-meetings__icon-button"
                    href={doc.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("Download {{name}}", {
                      name: doc.title,
                    })}
                    tabIndex={tabIndex}
                  >
                    <Download />
                  </a>
                </span>
              </li>
            ))}
          </ul>

          {isAddingDocument ? (
            <div className="hub__chat-meetings__document-draft">
              <input
                type="text"
                className="hub__chat-meetings__input"
                value={draftTitle}
                placeholder={t("Document name")}
                aria-label={t("Document name")}
                tabIndex={tabIndex}
                onChange={(event) => setDraftTitle(event.target.value)}
              />
              <input
                type="url"
                className="hub__chat-meetings__input"
                value={draftUrl}
                placeholder={t("Link")}
                aria-label={t("Link")}
                tabIndex={tabIndex}
                onChange={(event) => setDraftUrl(event.target.value)}
              />
              <div className="hub__chat-meetings__document-draft-actions">
                <button
                  type="button"
                  className="hub__chat-meetings__action"
                  tabIndex={tabIndex}
                  onClick={() => setIsAddingDocument(false)}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="hub__chat-meetings__action"
                  data-primary="true"
                  disabled={draftUrl.trim() === ""}
                  tabIndex={tabIndex}
                  onClick={addDocument}
                >
                  {t("Add")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="hub__chat-meetings__add-document"
              aria-label={t("Add a document")}
              tabIndex={tabIndex}
              onClick={() => setIsAddingDocument(true)}
            >
              <Plus />
            </button>
          )}
        </section>

        <button
          type="button"
          className="hub__chat-meetings__action hub__chat-meetings__start-now"
          data-primary="true"
          disabled={isStarting}
          aria-busy={isStarting || undefined}
          tabIndex={tabIndex}
          onClick={onStartNow}
        >
          {t("Start now")}
        </button>
      </div>
    </>
  );
};
