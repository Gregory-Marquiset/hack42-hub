import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

import { useActiveMeeting } from "@/features/chat/meetings/ActiveMeeting";
import type { ChatRef } from "@/features/drivers/types";

import { useChatMeetings } from "./useChatMeetings";

/**
 * Joins the meeting named by `?meeting=` in the address, once the
 * conversation is open: the link Ariane sends opens the call in the Hub, with
 * its whiteboard and its documents, rather than the bare Meet page. The
 * parameter is dropped afterwards, so a reload does not reopen a call the
 * user left.
 */
export const useMeetingFromUrl = (chatRef: ChatRef | null): void => {
  const router = useRouter();
  const { openMeeting } = useActiveMeeting();
  const wanted =
    typeof router.query.meeting === "string" ? router.query.meeting : null;
  const { meetings } = useChatMeetings(chatRef, wanted !== null);
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || !chatRef || opened.current === wanted) {
      return;
    }
    const meeting = meetings.find((candidate) => candidate.id === wanted);
    if (!meeting) {
      return;
    }
    opened.current = wanted;
    const query = { ...router.query };
    delete query.meeting;
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
    if (meeting.endedAt) {
      return;
    }
    openMeeting({
      url: meeting.url,
      meetingId: meeting.id,
      chatRef,
    });
  }, [wanted, chatRef, meetings, openMeeting, router]);
};
