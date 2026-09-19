import { useState } from "react";
import { useTranslation } from "react-i18next";

import { isWebLink } from "@/features/drivers/webLink";

type DocsLinkDraftProps = {
  tabIndex: number;
  /** Shown under the fields, e.g. what the link gives access to. */
  hint?: string;
  /** A link is being saved: "Add" waits. */
  isSaving?: boolean;
  /**
   * Adds the link; the draft closes once it resolves, and stays open with
   * what was typed when it rejects. `title` falls back on the link itself.
   */
  onAdd: (link: { title: string; url: string }) => Promise<void> | void;
  onOpenChange?: (isOpen: boolean) => void;
};

/**
 * The "Docs" button that opens a small draft to list a document by its link:
 * a name and a web link, which must start with http(s)://.
 */
export const DocsLinkDraft = ({
  tabIndex,
  hint,
  isSaving = false,
  onAdd,
  onOpenChange,
}: DocsLinkDraftProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const toggle = (next: boolean) => {
    setIsOpen(next);
    onOpenChange?.(next);
  };

  const add = () => {
    const link = url.trim();
    if (!isWebLink(link)) {
      return;
    }
    void Promise.resolve(onAdd({ title: title.trim() || link, url: link }))
      .then(() => {
        setTitle("");
        setUrl("");
        toggle(false);
      })
      .catch(() => {
        // The caller already told the user; what was typed stays.
      });
  };

  if (!isOpen) {
    // Adds a document by link for now; picking it from Docs comes later.
    return (
      <button
        type="button"
        className="hub__chat-meetings__add-document"
        aria-label={t("Add a Docs link")}
        tabIndex={tabIndex}
        onClick={() => toggle(true)}
      >
        {t("Docs")}
      </button>
    );
  }

  return (
    <div className="hub__chat-meetings__document-draft">
      <input
        type="text"
        className="hub__chat-meetings__input"
        value={title}
        placeholder={t("Document name")}
        aria-label={t("Document name")}
        tabIndex={tabIndex}
        onChange={(event) => setTitle(event.target.value)}
      />
      <input
        type="url"
        className="hub__chat-meetings__input"
        value={url}
        placeholder={t("Link")}
        aria-label={t("Link")}
        tabIndex={tabIndex}
        onChange={(event) => setUrl(event.target.value)}
      />
      {hint && <p className="hub__chat-meetings__details-text">{hint}</p>}
      <div className="hub__chat-meetings__document-draft-actions">
        <button
          type="button"
          className="hub__chat-meetings__action"
          tabIndex={tabIndex}
          onClick={() => toggle(false)}
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="hub__chat-meetings__action"
          data-primary="true"
          disabled={!isWebLink(url) || isSaving}
          tabIndex={tabIndex}
          onClick={add}
        >
          {t("Add")}
        </button>
      </div>
    </div>
  );
};
