import { Button } from "@gouvfr-lasuite/ui-components";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ChatRef } from "@/features/drivers/types";

import { useAddChatDocument } from "../../hooks/useAddChatDocument";
import { useChatDocuments } from "../../hooks/useChatDocuments";

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
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [addError, setAddError] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setAddError(false);
    }
  }, [isOpen]);

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
          <li className="hub__chat-tools-panel__document" key={index}>
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
      {isOpen && !isInitialLoading && !isError && (
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
                  disabled={isAdding}
                />
              </label>
              <label>
                {t("URL")}
                <input
                  type="url"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                  disabled={isAdding}
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
                <Button type="submit" size="small" disabled={isAdding}>
                  {isAdding ? t("Adding…") : t("Add")}
                </Button>
                <Button
                  type="button"
                  size="small"
                  variant="secondary"
                  disabled={isAdding}
                  onClick={() => {
                    setIsEditing(false);
                    setAddError(false);
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
