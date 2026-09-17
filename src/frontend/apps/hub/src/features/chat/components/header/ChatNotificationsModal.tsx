import { Button, Modal, ModalSize } from "@gouvfr-lasuite/ui-components";
import { useTranslation } from "react-i18next";

import type { ChatRef } from "@/features/drivers/types";

import { useChatMute } from "../../hooks/useChatMute";

type ChatNotificationsModalProps = {
  chatRef: ChatRef;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Room-scoped quick settings: this conversation's own mute state. Anything
 * more granular (per-category rules) lives in the account-wide notification
 * settings panel, reachable from the profile menu.
 */
export const ChatNotificationsModal = ({
  chatRef,
  isOpen,
  onClose,
}: ChatNotificationsModalProps) => {
  const { t } = useTranslation();
  const { isMuted, setMuted, isPending } = useChatMute(chatRef, isOpen);

  return (
    <Modal
      isOpen={isOpen}
      size={ModalSize.SMALL}
      title={t("Notifications")}
      aria-label={t("Notifications")}
      onClose={onClose}
      closeOnClickOutside
      rightActions={
        <>
          <Button
            type="button"
            variant="secondary"
            color="neutral"
            fullWidth
            onClick={onClose}
          >
            {t("Close")}
          </Button>
          <Button
            type="button"
            fullWidth
            disabled={isPending}
            onClick={() => setMuted(!isMuted)}
          >
            {isMuted ? t("Unmute conversation") : t("Mute conversation")}
          </Button>
        </>
      }
    >
      {isMuted
        ? t("This conversation is muted: it won't notify you.")
        : t(
            "This conversation notifies you following your account's notification settings.",
          )}
    </Modal>
  );
};
