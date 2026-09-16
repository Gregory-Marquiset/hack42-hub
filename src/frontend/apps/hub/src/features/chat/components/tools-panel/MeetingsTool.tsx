import { useEffect, useMemo, useRef, useState } from "react";

import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useStartChatMeeting } from "@/features/chat/hooks/useStartChatMeeting";
import type { ChatRef } from "@/features/drivers/types";

import { MeetingModal } from "../header/MeetingModal";

import { MeetingHistory } from "./MeetingHistory";
import { MeetingsList } from "./MeetingsList";
import { NewMeetingForm } from "./NewMeetingForm";

type MeetingsView = "list" | "new" | "history";

type MeetingsToolProps = {
  chatRef: ChatRef;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Meetings tool content. Swaps between the meetings list, the creation form
 * and the history, all three sharing the tools panel chrome with the threads
 * and documents tools.
 *
 * The camera button of the header only opens this panel; the call itself is
 * started from "Start now" in the creation form and shown in `MeetingModal`.
 */
export const MeetingsTool = ({
  chatRef,
  isOpen,
  onClose,
}: MeetingsToolProps) => {
  const [view, setView] = useState<MeetingsView>("list");
  const [meetingUrl, setMeetingUrl] = useState<string | null>(null);
  const { meetings, isInitialLoading } = useChatMeetings(chatRef, isOpen);
  const { startMeeting, isPending } = useStartChatMeeting(chatRef);

  // Opening the panel from the header always lands on the list. The reset is
  // done on open rather than on close so the view does not flash back during
  // the panel's slide-out animation, as the threads tool does.
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setView("list");
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const ongoing = useMemo(
    () => meetings.filter((meeting) => meeting.isOngoing),
    [meetings],
  );
  const past = useMemo(
    () => meetings.filter((meeting) => !meeting.isOngoing),
    [meetings],
  );

  const startNow = () => {
    if (isPending) {
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

  return (
    <>
      {view === "list" && (
        <MeetingsList
          ongoing={ongoing}
          isInitialLoading={isInitialLoading}
          isOpen={isOpen}
          onClose={onClose}
          onNewMeeting={() => setView("new")}
          onOpenHistory={() => setView("history")}
          onJoin={(meeting) => setMeetingUrl(meeting.url)}
        />
      )}
      {view === "new" && (
        <NewMeetingForm
          isOpen={isOpen}
          isStarting={isPending}
          onClose={onClose}
          onBack={() => setView("list")}
          onStartNow={startNow}
        />
      )}
      {view === "history" && (
        <MeetingHistory
          meetings={past}
          isInitialLoading={isInitialLoading}
          isOpen={isOpen}
          onClose={onClose}
          onBack={() => setView("list")}
        />
      )}
      <MeetingModal url={meetingUrl} onClose={() => setMeetingUrl(null)} />
    </>
  );
};
