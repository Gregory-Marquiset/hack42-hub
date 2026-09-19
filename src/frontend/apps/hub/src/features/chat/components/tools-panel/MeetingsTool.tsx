import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useChatMeetings } from "@/features/chat/hooks/useChatMeetings";
import { useStartChatMeeting } from "@/features/chat/hooks/useStartChatMeeting";
import { useActiveMeeting } from "@/features/chat/meetings/ActiveMeeting";
import { useNow } from "@/features/chat/meetings/useNow";
import { getMeetingStatus } from "@/features/drivers/meetingTime";
import type {
  ChatMeeting,
  ChatRef,
  StartMeetingOptions,
} from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { MeetingDetails } from "./MeetingDetails";
import { MeetingHistory } from "./MeetingHistory";
import { MeetingsList } from "./MeetingsList";
import { NewMeetingForm } from "./NewMeetingForm";

type MeetingsView = "list" | "new" | "history" | "details";

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
 * started or scheduled from the creation form and shown in the app-wide
 * meeting window (`ActiveMeetingProvider`), which outlives this panel.
 */
export const MeetingsTool = ({
  chatRef,
  isOpen,
  onClose,
}: MeetingsToolProps) => {
  const { t } = useTranslation();
  const [view, setView] = useState<MeetingsView>("list");
  // The scheduled meeting shown, as last known: a meeting just created may
  // not be in the list yet.
  const [shown, setShown] = useState<ChatMeeting | null>(null);
  // A call the driver found ongoing when this user tried to start one: it
  // may not be in the list yet.
  const [reused, setReused] = useState<ChatMeeting | null>(null);
  const { openMeeting } = useActiveMeeting();
  const now = useNow();
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

  const { ongoing, upcoming, past } = useMemo(() => {
    const byStatus = {
      ongoing: [] as ChatMeeting[],
      upcoming: [] as ChatMeeting[],
      past: [] as ChatMeeting[],
    };
    for (const meeting of meetings) {
      const status = getMeetingStatus(meeting, now);
      byStatus[status === "ended" ? "past" : status].push(meeting);
    }
    // `meetings` is newest first: the soonest scheduled meeting goes first.
    byStatus.upcoming.reverse();
    return byStatus;
  }, [meetings, now]);

  const join = (meeting: ChatMeeting, showInvitation = false) =>
    openMeeting({
      url: meeting.url,
      meetingId: meeting.id,
      chatRef,
      showInvitation,
    });

  const openDetails = (meeting: ChatMeeting) => {
    setShown(meeting);
    setView("details");
  };
  const detailed = shown
    ? (meetings.find((candidate) => candidate.id === shown.id) ?? shown)
    : null;

  // The call to join instead of starting another one.
  const ongoingMeeting =
    ongoing[0] ??
    (reused && getMeetingStatus(reused, now) === "ongoing" ? reused : null);

  /**
   * Someone started a call meanwhile, and the driver returned it instead of
   * creating this one: the form stays, for the user to join that call or to
   * schedule theirs, rather than dropping what they typed.
   */
  const keepForm = (meeting: ChatMeeting) => {
    setReused(meeting);
    notify.brand(
      t("A meeting is already in progress: join it, or plan yours."),
    );
  };

  const startNow = (options: StartMeetingOptions) => {
    if (isPending) {
      return;
    }
    // A new call opens with its invitation link in view, and the panel gets
    // out of the way: the meeting window is where everything happens now.
    void startMeeting(options)
      .then(({ meeting, isReused }) => {
        if (isReused) {
          keepForm(meeting);
          return;
        }
        join(meeting, true);
        setView("list");
        onClose();
      })
      .catch(() => {
        // useStartChatMeeting already surfaces a toast on failure.
      });
  };

  const schedule = (options: StartMeetingOptions) => {
    if (isPending) {
      return;
    }
    void startMeeting(options)
      .then(({ meeting, isReused }) => {
        if (isReused) {
          keepForm(meeting);
          return;
        }
        notify.brand(t("Meeting scheduled"));
        // Lands on the meeting, with the link to share.
        openDetails(meeting);
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
          upcoming={upcoming}
          now={now}
          isInitialLoading={isInitialLoading}
          isOpen={isOpen}
          onClose={onClose}
          onNewMeeting={() => setView("new")}
          onOpenHistory={() => setView("history")}
          onJoin={(meeting) => join(meeting)}
          onOpenDetails={openDetails}
        />
      )}
      {view === "details" && detailed && (
        <MeetingDetails
          chatRef={chatRef}
          meeting={detailed}
          isOpen={isOpen}
          onClose={onClose}
          onBack={() => setView("list")}
          onJoin={(meeting) => join(meeting)}
        />
      )}
      {view === "new" && (
        <NewMeetingForm
          isOpen={isOpen}
          isStarting={isPending}
          ongoingMeeting={ongoingMeeting}
          onJoinOngoing={(meeting) => join(meeting)}
          onClose={onClose}
          onBack={() => setView("list")}
          onStartNow={startNow}
          onSchedule={schedule}
        />
      )}
      {view === "history" && (
        <MeetingHistory
          chatRef={chatRef}
          meetings={past}
          isInitialLoading={isInitialLoading}
          isOpen={isOpen}
          onClose={onClose}
          onBack={() => setView("list")}
        />
      )}
    </>
  );
};
