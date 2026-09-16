import { Button } from "@gouvfr-lasuite/ui-components";
import { Meet } from "@gouvfr-lasuite/ui-components/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useStartChatMeeting } from "@/features/chat/hooks/useStartChatMeeting";
import type { ChatRef } from "@/features/drivers/types";

import { MeetingModal } from "./MeetingModal";

type MeetingButtonProps = {
  /** `null` while the conversation is still being fetched — the button stays
   * disabled until it resolves. */
  chatRef: ChatRef | null;
};

/**
 * Camera button that starts the conversation's Meet call, or rejoins the one
 * already ongoing, and shows it in a modal.
 */
export const MeetingButton = ({ chatRef }: MeetingButtonProps) => {
  const { t } = useTranslation();
  const { meetings } = useChatMeetings(chatRef, true);
  const { startMeeting, isPending } = useStartChatMeeting(chatRef);
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);

  const handleStartMeeting = () => {
    if (!chatRef || isPending) {
      return;
    }
    void startMeeting()
      .then((meeting) => {
        setMeetingUrl(meeting.url);
      })
      .catch(() => {
        // useStartChatMeeting already surfaces a toast on failure.
      });
  };

  const hasOngoingMeeting = meetings.some((meeting) => meeting.isOngoing);

  return (
    <>
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
      <MeetingModal url={meetingUrl} onClose={() => setMeetingUrl(null)} />
    </>
  );
};
