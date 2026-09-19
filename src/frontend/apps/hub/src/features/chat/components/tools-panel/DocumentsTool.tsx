import { Plus } from "@gouvfr-lasuite/ui-components/icons";
import { type ChangeEvent, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useChatFiles } from "@/features/chat/hooks/useChatFiles";
import type { ChatFile, ChatRef } from "@/features/drivers/types";

import { FileRow } from "./FileRow";
import { formatFileSize } from "./fileSize";
import { ToolsPanelHeader } from "./ToolsPanelHeader";

type DocumentsToolProps = {
  chatRef: ChatRef;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Documents tool content: the documents shared in the conversation, newest
 * first, and the "+" button that shares documents from the device.
 */
export const DocumentsTool = ({
  chatRef,
  isOpen,
  onClose,
}: DocumentsToolProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const inputRef = useRef<HTMLInputElement>(null);
  const tabIndex = isOpen ? 0 : -1;
  const {
    files,
    isSupported,
    isInitialLoading,
    isError,
    retry,
    uploadFiles,
    isUploading,
    downloadFile,
    pendingFileId,
  } = useChatFiles(chatRef, isOpen);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    // Picking the same file again must fire `change` again.
    event.target.value = "";
    if (picked.length > 0) {
      void uploadFiles(picked);
    }
  };

  const details = (file: ChatFile) =>
    [
      file.senderName ?? file.senderId,
      new Date(file.sentAt).toLocaleString(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }),
      file.size === undefined ? null : formatFileSize(file.size, locale),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <ToolsPanelHeader
        title={t("Documents")}
        isOpen={isOpen}
        onClose={onClose}
        action={
          isSupported && (
            <>
              <button
                type="button"
                className="hub__chat-tools-panel__header-button"
                aria-label={t("Add documents from your device")}
                title={t("Add documents from your device")}
                disabled={isUploading}
                aria-busy={isUploading || undefined}
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
                data-testid="documents-input"
                onChange={onPick}
              />
            </>
          )
        }
      />
      <div className="hub__chat-tools-panel__content">
        {!isSupported ? (
          <p className="hub__chat-tools-panel__state" role="status">
            {t("Available soon")}
          </p>
        ) : isInitialLoading ? (
          <p className="hub__chat-tools-panel__empty" role="status">
            {t("Loading documents…")}
          </p>
        ) : isError ? (
          <div className="hub__chat-tools-panel__state" role="alert">
            <p>{t("The documents could not be loaded.")}</p>
            <button
              type="button"
              className="hub__chat-tools-panel__state__retry"
              tabIndex={tabIndex}
              onClick={retry}
            >
              {t("Retry")}
            </button>
          </div>
        ) : files.length === 0 ? (
          <p className="hub__chat-tools-panel__empty">
            {t("No document shared yet. Use + to add one from your device.")}
          </p>
        ) : (
          <ul className="hub__tools-list">
            {files.map((file) => (
              <FileRow
                key={file.id}
                name={file.name}
                details={details(file)}
                tabIndex={tabIndex}
                isDownloading={pendingFileId === file.id}
                isDisabled={pendingFileId !== null}
                onDownload={() => void downloadFile(file)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
};
