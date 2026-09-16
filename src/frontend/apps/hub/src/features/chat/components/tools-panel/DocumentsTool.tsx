import { Button } from "@gouvfr-lasuite/ui-components";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ChatRef } from "@/features/drivers/types";

import { useAddChatDocument } from "../../hooks/useAddChatDocument";
import { useChatDocumentCapabilities } from "../../hooks/useChatDocumentCapabilities";
import { useChatDocuments } from "../../hooks/useChatDocuments";
import { useChatMembers } from "../../hooks/useChatMembers";
import {
  type CreatedDocsDocument,
  useCreateDocsDocument,
} from "../../hooks/useCreateDocsDocument";

type DocumentsToolProps = {
  chatRef: ChatRef;
  isOpen: boolean;
};

const isWebAddress = (address: string): boolean => {
  try {
    const protocol = new URL(address).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

export const DocumentsTool = ({ chatRef, isOpen }: DocumentsToolProps) => {
  const { t } = useTranslation();
  const { documents, isInitialLoading, isError, refetch } = useChatDocuments(
    chatRef,
    isOpen,
  );
  const { addDocument, isAdding } = useAddChatDocument(chatRef);
  const { createDocument, isCreating } = useCreateDocsDocument();
  const {
    present: presentMembers,
    isInitialLoading: areMembersLoading,
    isError: membersError,
    refetch: refetchMembers,
  } = useChatMembers(chatRef, isOpen);
  const { canAdd } = useChatDocumentCapabilities(chatRef, isOpen);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [addError, setAddError] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [associationError, setAssociationError] = useState(false);
  const [sharingWarningCount, setSharingWarningCount] = useState(0);
  const [createdDocument, setCreatedDocument] =
    useState<CreatedDocsDocument | null>(null);

  useEffect(() => {
    if (!isOpen || !canAdd) {
      setIsEditing(false);
      setAddError(false);
      setCreateError(false);
      setAssociationError(false);
      setSharingWarningCount(0);
      setCreatedDocument(null);
    }
  }, [canAdd, isOpen]);

  const associateCreatedDocument = async (document: CreatedDocsDocument) => {
    setAssociationError(false);
    try {
      await addDocument({
        id: document.id,
        provider: document.provider,
        title: document.title,
        address: document.address,
      });
      setTitle("");
      setAddress("");
      setCreatedDocument(null);
      setIsEditing(false);
    } catch {
      setCreatedDocument(document);
      setAssociationError(true);
    }
  };

  const createInDocs = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setCreateError(true);
      return;
    }
    setCreateError(false);
    setAssociationError(false);
    setSharingWarningCount(0);
    setCreatedDocument(null);
    let document: CreatedDocsDocument;
    try {
      document = await createDocument({
        title: trimmedTitle,
        // The Matrix driver sorts the current user first. Only other joined
        // members need a Docs reader access.
        memberIds: presentMembers.slice(1).map((member) => member.id),
      });
    } catch {
      setCreateError(true);
      return;
    }
    setSharingWarningCount(
      document.sharing.unresolved.length + document.sharing.failed.length,
    );
    setCreatedDocument(document);
    await associateCreatedDocument(document);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedAddress = address.trim();
    if (!trimmedTitle || !trimmedAddress || !isWebAddress(trimmedAddress)) {
      setAddError(true);
      return;
    }
    setAddError(false);
    try {
      await addDocument({ title: trimmedTitle, address: trimmedAddress });
      setTitle("");
      setAddress("");
      setCreateError(false);
      setAssociationError(false);
      setSharingWarningCount(0);
      setCreatedDocument(null);
      setIsEditing(false);
    } catch {
      setAddError(true);
    }
  };

  const renderDocuments = () => {
    if (isInitialLoading) {
      return (
        <p className="hub__chat-tools-panel__state" role="status">
          {t("Loading documents…")}
        </p>
      );
    }
    if (isError) {
      return (
        <div className="hub__chat-tools-panel__state" role="alert">
          <p>{t("Documents could not be loaded.")}</p>
          <button
            type="button"
            className="hub__chat-tools-panel__state__retry"
            onClick={refetch}
          >
            {t("Retry")}
          </button>
        </div>
      );
    }
    if (documents.length === 0) {
      return (
        <p className="hub__chat-tools-panel__empty">{t("No documents yet")}</p>
      );
    }
    return (
      <ul className="hub__chat-tools-panel__list">
        {documents.map((document, index) => (
          <li
            className="hub__chat-tools-panel__document"
            key={document.id ?? `${document.address}-${index}`}
          >
            {isWebAddress(document.address) ? (
              <a
                href={document.address}
                target="_blank"
                rel="noopener noreferrer"
              >
                {document.title}
              </a>
            ) : (
              <span>{document.title}</span>
            )}
            <span className="hub__chat-tools-panel__document__author">
              {t("Added by {{userId}}", { userId: document.addedBy })}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="hub__chat-tools-panel__content">
      {renderDocuments()}
      {sharingWarningCount > 0 && (
        <p role="alert">
          {t(
            "The document was created, but {{count}} room member(s) may not have access.",
            { count: sharingWarningCount },
          )}
        </p>
      )}
      {isOpen && canAdd && !isInitialLoading && !isError && (
        <div className="hub__chat-tools-panel__document-add">
          {!isEditing ? (
            <Button
              type="button"
              size="small"
              onClick={() => setIsEditing(true)}
            >
              {t("Add document")}
            </Button>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              <label>
                {t("Title")}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  disabled={isAdding || isCreating}
                />
              </label>
              <Button
                type="button"
                size="small"
                disabled={
                  isAdding || isCreating || areMembersLoading || membersError
                }
                onClick={() =>
                  void (createdDocument
                    ? associateCreatedDocument(createdDocument)
                    : createInDocs())
                }
              >
                {isCreating
                  ? t("Creating…")
                  : isAdding
                    ? t("Associating…")
                    : createdDocument
                      ? t("Retry association")
                      : t("Create document")}
              </Button>
              {createError && (
                <p role="alert">
                  {t("Document could not be created in Docs.")}
                </p>
              )}
              {membersError && (
                <div role="alert">
                  <p>
                    {t(
                      "Room members could not be loaded. Retry before creating the document.",
                    )}
                  </p>
                  <button type="button" onClick={refetchMembers}>
                    {t("Retry")}
                  </button>
                </div>
              )}
              {createdDocument && (
                <p role="status">
                  {t("Document created:")}{" "}
                  <a
                    href={createdDocument.address}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {createdDocument.title}
                  </a>
                </p>
              )}
              {associationError && (
                <p role="alert">
                  {t(
                    "The document was created in Docs, but could not be added to this conversation.",
                  )}
                </p>
              )}
              <label>
                {t("URL")}
                <input
                  type="url"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                  disabled={isAdding || isCreating}
                />
              </label>
              {addError && (
                <p role="alert">
                  {t(
                    "Document could not be added. Check the title and URL, then try again.",
                  )}
                </p>
              )}
              <div className="hub__chat-tools-panel__document-add__actions">
                <Button
                  type="submit"
                  size="small"
                  disabled={isAdding || isCreating}
                >
                  {isAdding ? t("Adding…") : t("Add")}
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  disabled={isAdding || isCreating}
                  onClick={() => {
                    setIsEditing(false);
                    setAddError(false);
                    setCreateError(false);
                    setAssociationError(false);
                    setSharingWarningCount(0);
                    setCreatedDocument(null);
                  }}
                >
                  {t("Cancel")}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
