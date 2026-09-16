import { Plus, XMark } from "@gouvfr-lasuite/ui-components/icons";
import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { notify } from "@/features/ui/components/toast";

import { Download } from "./MeetingIcons";
import { TEXT_FILE_ACCEPT, isTextFile } from "./textFile";
import { ToolsPanelHeader } from "./ToolsPanelHeader";

type DraftDocument = {
  id: string;
  title: string;
  url: string;
  /** Picked on this device and served from a blob URL, to release on removal. */
  isLocalFile?: boolean;
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

type DocumentRowProps = {
  document: DraftDocument;
  tabIndex: number;
  onRemove: () => void;
};

/** One attached document: its name, a remove button and a download link. */
const DocumentRow = ({ document, tabIndex, onRemove }: DocumentRowProps) => {
  const { t } = useTranslation();

  return (
    <li className="hub__chat-meetings__row">
      <span className="hub__chat-meetings__row-label">{document.title}</span>
      <span className="hub__chat-meetings__row-actions">
        <button
          type="button"
          className="hub__chat-meetings__icon-button"
          aria-label={t("Remove {{name}}", { name: document.title })}
          tabIndex={tabIndex}
          onClick={onRemove}
        >
          <XMark />
        </button>
        <a
          className="hub__chat-meetings__icon-button"
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
  const [agendaFile, setAgendaFile] = useState<DraftDocument | null>(null);
  const [documents, setDocuments] = useState<DraftDocument[]>([]);
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const agendaFileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const nextDocumentId = useRef(0);
  const localFileUrls = useRef(new Set<string>());

  const tabIndex = isOpen ? 0 : -1;

  // Blob URLs of picked files live until their document is removed, or the
  // form goes away.
  useEffect(() => {
    const urls = localFileUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const newDocumentId = () => `document-${nextDocumentId.current++}`;

  const toLocalDocument = (file: File): DraftDocument => {
    const url = URL.createObjectURL(file);
    localFileUrls.current.add(url);
    return { id: newDocumentId(), title: file.name, url, isLocalFile: true };
  };

  const release = (document: DraftDocument | null | undefined) => {
    if (document?.isLocalFile) {
      URL.revokeObjectURL(document.url);
      localFileUrls.current.delete(document.url);
    }
  };

  /** The picked .txt/.md files; any other type is refused with a message. */
  const pickTextFiles = (event: ChangeEvent<HTMLInputElement>): File[] => {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same file again still fires `change`.
    event.target.value = "";
    const accepted = files.filter((file) => isTextFile(file.name));
    if (accepted.length !== files.length) {
      notify.error(t("Only .txt or .md files can be attached."));
    }
    return accepted;
  };

  const attachAgendaFile = (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = pickTextFiles(event);
    if (!file) {
      return;
    }
    release(agendaFile);
    setAgendaFile(toLocalDocument(file));
  };

  const removeAgendaFile = () => {
    release(agendaFile);
    setAgendaFile(null);
  };

  const attachDocumentFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const added = pickTextFiles(event).map(toLocalDocument);
    if (added.length > 0) {
      setDocuments((current) => [...current, ...added]);
    }
  };

  const addDocument = () => {
    const url = draftUrl.trim();
    if (url === "") {
      return;
    }
    const document = {
      id: newDocumentId(),
      title: draftTitle.trim() === "" ? url : draftTitle.trim(),
      url,
    };
    setDocuments((current) => [...current, document]);
    setDraftTitle("");
    setDraftUrl("");
    setIsAddingDocument(false);
  };

  const removeDocument = (document: DraftDocument) => {
    release(document);
    setDocuments((current) => current.filter((doc) => doc.id !== document.id));
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
          <div className="hub__chat-meetings__label-row">
            <label className="hub__chat-meetings__label" htmlFor={agendaId}>
              {t("Agenda")}
            </label>
            <button
              type="button"
              className="hub__chat-meetings__icon-button"
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
              onChange={attachAgendaFile}
            />
          </div>
          <textarea
            id={agendaId}
            className="hub__chat-meetings__textarea"
            value={agenda}
            rows={4}
            placeholder={t("One item per line")}
            tabIndex={tabIndex}
            onChange={(event) => setAgenda(event.target.value)}
          />
          {agendaFile && (
            <ul className="hub__chat-meetings__list">
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
              className="hub__chat-meetings__icon-button"
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
              onChange={attachDocumentFiles}
            />
          </div>
          {documents.length === 0 && !isAddingDocument && (
            <p className="hub__chat-tools-panel__empty">
              {t("No document yet")}
            </p>
          )}
          <ul className="hub__chat-meetings__list">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                tabIndex={tabIndex}
                onRemove={() => removeDocument(doc)}
              />
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
            // Adds a document by link for now; picking it from Docs comes later.
            <button
              type="button"
              className="hub__chat-meetings__add-document"
              aria-label={t("Add a Docs link")}
              tabIndex={tabIndex}
              onClick={() => setIsAddingDocument(true)}
            >
              Docs
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
