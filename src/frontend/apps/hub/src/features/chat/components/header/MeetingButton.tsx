import { Button } from "@gouvfr-lasuite/ui-components";
import { Meet } from "@gouvfr-lasuite/ui-components/icons";
import { useTranslation } from "react-i18next";

import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useNow } from "@/features/chat/meetings/useNow";
import { getConversationMeetingState } from "@/features/drivers/meetingTime";
import type { ChatRef } from "@/features/drivers/types";

type MeetingButtonProps = {
  /** `null` while the conversation is still being fetched — the button stays
   * disabled until it resolves. */
  chatRef: ChatRef | null;
  isActive: boolean;
  onToggle: () => void;
};

/**
 * Camera button of the conversation header. It opens the meetings panel rather
 * than placing the call: the call is started from "Start now" inside that
 * panel, so planning a meeting and joining one share the same entry point. A
 * dot tells a meeting is about to start (within 15 minutes) or in progress.
 */
export const MeetingButton = ({
  chatRef,
  isActive,
  onToggle,
}: MeetingButtonProps) => {
  const { t } = useTranslation();
  const { meetings } = useChatMeetings(chatRef, true);
  const now = useNow();
  const state = getConversationMeetingState(meetings, now);

  const label =
    state === "ongoing"
      ? t("Meetings: a meeting is in progress")
      : state === "soon"
        ? t("Meetings: a meeting starts soon")
        : t("Meetings");

  return (
    <span className="hub__chat-header__meeting-button" data-meeting={state}>
      <Button
        type="button"
        variant="tertiary"
        color="neutral"
        size="small"
        className="hub__chat-header__icon-button"
        aria-label={label}
        title={label}
        aria-pressed={isActive}
        data-active={isActive || state === "ongoing"}
        active={isActive}
        disabled={!chatRef}
        icon={<Meet />}
        onClick={onToggle}
      />
      {state !== "none" && (
        <span
          className="hub__chat-header__meeting-dot"
          data-testid="meeting-indicator"
          data-state={state}
          aria-hidden="true"
        />
      )}
    </span>
  );
};
