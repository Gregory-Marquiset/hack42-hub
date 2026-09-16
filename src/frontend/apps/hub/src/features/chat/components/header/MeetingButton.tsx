import { Button } from "@gouvfr-lasuite/ui-components";
import { Meet } from "@gouvfr-lasuite/ui-components/icons";
import { useTranslation } from "react-i18next";

import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useStartChatMeeting } from "@/features/chat/hooks/useStartChatMeeting";
import type { ChatRef } from "@/features/drivers/types";

type MeetingButtonProps = {
  /** `null` while the conversation is still being fetched — the button stays
   * disabled until it resolves. */
  chatRef: ChatRef | null;
};

/**
 * Camera button that starts the conversation's Meet call, or rejoins the one
 * already ongoing, and opens it in a new tab.
 */
export const MeetingButton = ({ chatRef }: MeetingButtonProps) => {
  const { t } = useTranslation();
  const { meetings } = useChatMeetings(chatRef, true);
  const { startMeeting, isPending } = useStartChatMeeting(chatRef);

  const handleStartMeeting = () => {
    if (!chatRef || isPending) {
      return;
    }
    void startMeeting()
      .then((meeting) => {
        window.open(meeting.url, "_blank", "noopener,noreferrer");
      })
      .catch(() => {
        // useStartChatMeeting already surfaces a toast on failure.
      });
  };

  const hasOngoingMeeting = meetings.some((meeting) => meeting.isOngoing);

  return (
    <Button
      type="button"
      variant="tertiary"
      color="neutral"
      size="small"
      className="hub__chat-header__icon-button"
      aria-label={t("Start a meeting")}
      data-active={hasOngoingMeeting}
      disabled={!chatRef || isPending}
      icon={<Meet />}
      onClick={handleStartMeeting}
    />
  );
};
