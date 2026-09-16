import { Modal, ModalSize } from "@gouvfr-lasuite/ui-components";
import { useTranslation } from "react-i18next";

type MeetingModalProps = {
  /** Meet call to show, or `null` when the modal is closed. */
  url: string | null;
  onClose: () => void;
};

/**
 * Shows a Meet call inside the Hub. Meet runs on another site, so its session
 * does not reach the frame: the Hub creates public rooms and participants join
 * with a display name. The new-tab link covers browsers that block the frame.
 */
export const MeetingModal = ({ url, onClose }: MeetingModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={url !== null}
      size={ModalSize.EXTRA_LARGE}
      title={t("Meeting")}
      aria-label={t("Meeting")}
      onClose={onClose}
      closeOnClickOutside={false}
    >
      {url && (
        <div className="hub__chat-header__meeting">
          <iframe
            className="hub__chat-header__meeting-frame"
            src={url}
            title={t("Meeting")}
            allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
            allowFullScreen
          />
          <a
            className="hub__chat-header__meeting-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Open in a new tab")}
          </a>
        </div>
      )}
    </Modal>
  );
};
