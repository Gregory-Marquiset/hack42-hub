import { Plus } from "@gouvfr-lasuite/ui-components/icons";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/features/auth/Auth";
import { useChatMeetingActions } from "@/features/chat/hooks/useChatMeetingActions";
import { useMeetingDocuments } from "@/features/chat/hooks/useMeetingDocuments";
import { copyMeetingLink } from "@/features/chat/meetings/copyMeetingLink";
import {
  formatMeetingDuration,
  getMeetingStatus,
} from "@/features/drivers/meetingTime";
import type {
  ChatMeeting,
  ChatMeetingDocument,
  ChatRef,
} from "@/features/drivers/types";
import { isWebLink } from "@/features/drivers/webLink";

import { formatFileSize } from "./fileSize";
import { Download } from "./MeetingIcons";
import { formatMeetingLabel } from "./meetingLabels";
import { ToolsPanelHeader } from "./ToolsPanelHeader";

type MeetingDetailsProps = {
  chatRef: ChatRef;
  meeting: ChatMeeting;
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onJoin: (meeting: ChatMeeting) => void;
};

/**
 * A scheduled meeting: when it starts, the link that invites people from
 * outside the conversation, and its documents — the agenda, the links listed
 * with it and the files the members added, which go in its archive.
 */
export const MeetingDetails = ({
  chatRef,
  meeting,
  isOpen,
  onClose,
  onBack,
  onJoin,
}: MeetingDetailsProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { chatUser } = useAuth();
  const tabIndex = isOpen ? 0 : -1;
  const linkId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  // Created in Docs, but not listed with the meeting yet.
  const [unlinkedDocument, setUnlinkedDocument] =
    useState<ChatMeetingDocument | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const isOrganizer = meeting.organizerId === chatUser?.userId;
  const documents = useMeetingDocuments(
    { ref: chatRef, meetingId: meeting.id, isOrganizer },
    isOpen,
  );
  const { addLink, isPending: isSavingLink } = useChatMeetingActions(chatRef);
  // The Hub refuses documents once it closed the meeting, which it may do
  // before the meeting state says so.
  const canAdd = !documents.isClosed && getMeetingStatus(meeting) !== "ended";

  const start = new Date(meeting.startedAt);
  const when = Number.isNaN(start.getTime())
    ? meeting.startedAt
    : start.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
  const title = formatMeetingLabel(meeting, t("Meeting"), locale);
  const defaultDocumentTitle = meeting.title?.trim() || title;

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    // Picking the same file again must fire `change` again.
    event.target.value = "";
    if (picked.length > 0) {
      void documents.addFiles(picked);
    }
  };

  const saveLink = () => {
    const url = linkUrl.trim();
    if (!isWebLink(url)) {
      return;
    }
    void addLink(meeting.id, {
      id: `link-${Date.now()}`,
      title: linkTitle.trim() || url,
      url,
    })
      .then(() => {
        setIsAddingLink(false);
        setLinkTitle("");
        setLinkUrl("");
      })
      .catch(() => {
        // useChatMeetingActions already surfaces a toast.
      });
  };

  const closeNaming = () => {
    setIsNaming(false);
    setNewDocTitle("");
    setUnlinkedDocument(null);
  };

  /**
   * Lists a document created in Docs with the meeting. On failure the draft
   * stays open on it, so retrying lists that document rather than creating
   * another one.
   */
  const linkDocument = (document: ChatMeetingDocument) => {
    void addLink(meeting.id, document)
      .then(closeNaming)
      .catch(() => {
        // useChatMeetingActions already surfaces a toast.
        setUnlinkedDocument(document);
      });
  };

  /** A new Docs document, listed with the meeting once it exists. */
  const createDocument = () => {
    if (unlinkedDocument) {
      linkDocument(unlinkedDocument);
      return;
    }
    const title = newDocTitle.trim() || defaultDocumentTitle;
    void documents.createDocsDocument(title).then((document) => {
      if (document) {
        linkDocument(document);
      }
    });
  };

  const links = meeting.documents.filter((doc) => isWebLink(doc.url));
  const isEmpty =
    !documents.agenda.trim() &&
    links.length === 0 &&
    documents.attachments.length === 0;

  return (
    <>
      <ToolsPanelHeader
        title={title}
        isOpen={isOpen}
        onClose={onClose}
        onBack={onBack}
        backLabel={t("Back to meetings")}
      />
      <div className="hub__chat-tools-panel__content">
        <section className="hub__chat-meetings__card">
          <p className="hub__chat-meetings__details-when">{when}</p>
          {meeting.plannedDurationMinutes !== undefined && (
            <p className="hub__chat-meetings__details-text">
              {t("Planned duration: {{duration}}", {
                duration: formatMeetingDuration(
                  meeting.plannedDurationMinutes * 60_000,
                  t,
                ),
              })}
            </p>
          )}
          <button
            type="button"
            className="hub__chat-meetings__action"
            data-primary="true"
            tabIndex={tabIndex}
            onClick={() => onJoin(meeting)}
          >
            {t("Join the meeting")}
          </button>
        </section>

        <section
          className="hub__chat-meetings__card"
          aria-labelledby={`${linkId}-title`}
        >
          <h3 id={`${linkId}-title`} className="hub__chat-meetings__card-title">
            {t("Invitation link")}
          </h3>
          <p className="hub__chat-meetings__details-text">
            {t(
              "Anyone with this link can join the call, even without an account.",
            )}
          </p>
          <div className="hub__chat-meetings__invite-row">
            <input
              type="text"
              readOnly
              className="hub__chat-meetings__input"
              value={meeting.url}
              aria-label={t("Invitation link")}
              tabIndex={tabIndex}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="hub__chat-meetings__action hub__chat-meetings__invite-copy"
              tabIndex={tabIndex}
              onClick={() => void copyMeetingLink(meeting.url, t)}
            >
              {t("Copy the link")}
            </button>
          </div>
        </section>

        <section className="hub__chat-meetings__card">
          <div className="hub__chat-meetings__label-row">
            <h3 className="hub__chat-meetings__card-title">{t("Documents")}</h3>
            {canAdd && (
              <>
                <button
                  type="button"
                  className="hub__chat-meetings__icon-button"
                  aria-label={t("Add documents from your device")}
                  title={t("Add documents from your device")}
                  disabled={documents.isAdding}
                  aria-busy={documents.isAdding || undefined}
                  tabIndex={tabIndex}
                  onClick={() => inputRef.current?.click()}
                >
                  <Plus />
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  data-testid="meeting-documents-input"
                  onChange={onPick}
                />
              </>
            )}
          </div>

          {documents.isInitialLoading ? (
            <p className="hub__chat-tools-panel__empty" role="status">
              {t("Loading documents…")}
            </p>
          ) : documents.isError ? (
            <div className="hub__chat-tools-panel__state" role="alert">
              <p>{t("The documents could not be loaded.")}</p>
              <button
                type="button"
                className="hub__chat-tools-panel__state__retry"
                tabIndex={tabIndex}
                onClick={documents.retry}
              >
                {t("Retry")}
              </button>
            </div>
          ) : (
            <>
              {documents.agenda.trim() && (
                <details className="hub__chat-meetings__agenda">
                  <summary tabIndex={tabIndex}>{t("Agenda")}</summary>
                  <p>{documents.agenda}</p>
                </details>
              )}
              {isEmpty && (
                <p className="hub__chat-tools-panel__empty">
                  {t("No document yet")}
                </p>
              )}
              <ul className="hub__chat-meetings__list">
                {links.map((doc) => (
                  <li key={doc.id} className="hub__chat-meetings__row">
                    <a
                      className="hub__chat-meetings__row-button"
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={tabIndex}
                    >
                      <span className="hub__chat-meetings__row-label">
                        {doc.title}
                      </span>
                    </a>
                  </li>
                ))}
                {documents.attachments.map((attachment) => (
                  <li key={attachment.id} className="hub__chat-meetings__row">
                    <span className="hub__chat-documents__text">
                      <span className="hub__chat-meetings__row-label">
                        {attachment.name}
                      </span>
                      <span className="hub__chat-documents__details">
                        {formatFileSize(attachment.size, locale)}
                      </span>
                    </span>
                    <span className="hub__chat-meetings__row-actions">
                      <button
                        type="button"
                        className="hub__chat-meetings__icon-button"
                        aria-label={t("Download {{name}}", {
                          name: attachment.name,
                        })}
                        disabled={documents.pendingAttachmentId !== null}
                        aria-busy={
                          documents.pendingAttachmentId === attachment.id ||
                          undefined
                        }
                        tabIndex={tabIndex}
                        onClick={() => void documents.download(attachment)}
                      >
                        <Download />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {canAdd &&
            (isNaming ? (
              <div className="hub__chat-meetings__document-draft">
                <input
                  type="text"
                  className="hub__chat-meetings__input"
                  value={newDocTitle}
                  placeholder={defaultDocumentTitle}
                  aria-label={t("Name of the new document")}
                  disabled={unlinkedDocument !== null}
                  tabIndex={tabIndex}
                  onChange={(event) => setNewDocTitle(event.target.value)}
                />
                {unlinkedDocument && (
                  <p className="hub__chat-meetings__details-text" role="alert">
                    {t(
                      "The document was created in Docs, but could not be listed with the meeting.",
                    )}
                  </p>
                )}
                <div className="hub__chat-meetings__document-draft-actions">
                  <button
                    type="button"
                    className="hub__chat-meetings__action"
                    tabIndex={tabIndex}
                    onClick={closeNaming}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    className="hub__chat-meetings__action"
                    data-primary="true"
                    disabled={documents.isCreatingDocument || isSavingLink}
                    aria-busy={
                      documents.isCreatingDocument || isSavingLink || undefined
                    }
                    tabIndex={tabIndex}
                    onClick={createDocument}
                  >
                    {unlinkedDocument ? t("Retry") : t("Create")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="hub__chat-meetings__add-document"
                tabIndex={tabIndex}
                onClick={() => setIsNaming(true)}
              >
                {t("New Docs document")}
              </button>
            ))}

          {canAdd &&
            (isAddingLink ? (
              <div className="hub__chat-meetings__document-draft">
                <input
                  type="text"
                  className="hub__chat-meetings__input"
                  value={linkTitle}
                  placeholder={t("Document name")}
                  aria-label={t("Document name")}
                  tabIndex={tabIndex}
                  onChange={(event) => setLinkTitle(event.target.value)}
                />
                <input
                  type="url"
                  className="hub__chat-meetings__input"
                  value={linkUrl}
                  placeholder={t("Link")}
                  aria-label={t("Link")}
                  tabIndex={tabIndex}
                  onChange={(event) => setLinkUrl(event.target.value)}
                />
                <p className="hub__chat-meetings__details-text">
                  {t(
                    "Share the document in Docs too: a link alone opens for nobody else.",
                  )}
                </p>
                <div className="hub__chat-meetings__document-draft-actions">
                  <button
                    type="button"
                    className="hub__chat-meetings__action"
                    tabIndex={tabIndex}
                    onClick={() => setIsAddingLink(false)}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    className="hub__chat-meetings__action"
                    data-primary="true"
                    disabled={!isWebLink(linkUrl) || isSavingLink}
                    tabIndex={tabIndex}
                    onClick={saveLink}
                  >
                    {t("Add")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="hub__chat-meetings__add-document"
                aria-label={t("Add a Docs link")}
                tabIndex={tabIndex}
                onClick={() => setIsAddingLink(true)}
              >
                Docs
              </button>
            ))}
        </section>
      </div>
    </>
  );
};
