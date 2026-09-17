import { useTranslation } from "react-i18next";

import { useActiveMeeting } from "@/features/chat/meetings/ActiveMeeting";
import type { AccountId, ChatMeetingInvite } from "@/features/drivers/types";

type MeetingInviteButtonProps = {
  /** Account the message was read with: the meeting lives on the same one. */
  accountId: AccountId;
  invite: ChatMeetingInvite;
};

/**
 * Joins the meeting a message invites to, in the Hub's own window — the same
 * call the conversation opens, with its whiteboard and its documents. The
 * assistant writes these messages in a private conversation, so the meeting
 * belongs to another room than the one being read.
 */
export const MeetingInviteButton = ({
  accountId,
  invite,
}: MeetingInviteButtonProps) => {
  const { t } = useTranslation();
  const { openMeeting } = useActiveMeeting();

  return (
    <button
      type="button"
      className="hub__chat-bubble__meeting"
      onClick={() =>
        openMeeting({
          url: invite.url,
          meetingId: invite.meetingId,
          chatRef: { accountId, chatId: invite.chatId },
        })
      }
    >
      {t("Join the meeting")}
    </button>
  );
};
