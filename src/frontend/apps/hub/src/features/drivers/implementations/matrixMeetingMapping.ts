/**
 * Meetings are Matrix room state, not a backend model: starting a call from
 * the camera button writes a `io.lasuite.hub.meeting` state event (one
 * `state_key` per meeting, so the history accumulates instead of being
 * overwritten), and the homeserver's `/sync` replicates it to every member —
 * no polling. The Meet room itself is created beforehand through the Hub
 * backend, which calls the Meet external API.
 */
import type { MatrixEvent, Room } from "matrix-js-sdk/lib/matrix";

import type { ChatMeeting, ChatMeetingDocument } from "../types";
import { isWebLink } from "../webLink";

export const MEETING_EVENT_TYPE = "io.lasuite.hub.meeting";

/** Content of an `io.lasuite.hub.meeting` state event. */
export type MeetingStateEventContent = {
  meetingUrl: string;
  /** Epoch milliseconds: actual start, or planned start when scheduled. */
  startedAt: number;
  /** Matrix id of the organizer (the sender changes when the state is updated). */
  organizerId?: string;
  title?: string;
  plannedDurationMinutes?: number;
  /** Epoch milliseconds, set when the meeting is closed. */
  endedAt?: number;
  /** "auto" when the server closed it; the organizer otherwise. */
  endedBy?: "organizer" | "auto";
  documents?: unknown;
  summary?: unknown;
  /** Whether the whiteboard is open, for every participant at once. */
  boardOpen?: boolean;
};

// Registers the custom state event so `sendStateEvent` accepts it.
declare module "matrix-js-sdk/lib/@types/event" {
  interface StateEvents {
    "io.lasuite.hub.meeting": MeetingStateEventContent;
  }
}

const toDocument = (raw: unknown): ChatMeetingDocument | undefined => {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { id, title, url } = raw as Record<string, unknown>;
  // A link typed without its scheme would render as a broken relative link.
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof url !== "string" ||
    !isWebLink(url)
  ) {
    return undefined;
  }
  return { id, title, url };
};

const toDocuments = (raw: unknown): ChatMeetingDocument[] =>
  Array.isArray(raw)
    ? raw
        .map(toDocument)
        .filter((doc): doc is ChatMeetingDocument => doc !== undefined)
    : [];

/** Maps one `io.lasuite.hub.meeting` state event to a `ChatMeeting`, or
 * `null` when its content is missing the fields the call needs to be joined. */
export const chatMeetingFromStateEvent = (
  event: MatrixEvent,
): ChatMeeting | null => {
  const content = event.getContent<Record<string, unknown>>();
  const url = content.meetingUrl;
  const startedAt = content.startedAt;
  const organizerId =
    typeof content.organizerId === "string" && content.organizerId
      ? content.organizerId
      : event.getSender();
  const stateKey = event.getStateKey();
  if (
    typeof url !== "string" ||
    !url ||
    typeof startedAt !== "number" ||
    !organizerId ||
    !stateKey
  ) {
    return null;
  }
  const { title, plannedDurationMinutes, endedAt, endedBy } = content;
  return {
    id: stateKey,
    url,
    organizerId,
    ...(typeof title === "string" && title.trim()
      ? { title: title.trim() }
      : {}),
    startedAt: new Date(startedAt).toISOString(),
    ...(typeof plannedDurationMinutes === "number" && plannedDurationMinutes > 0
      ? { plannedDurationMinutes }
      : {}),
    ...(typeof endedAt === "number"
      ? {
          endedAt: new Date(endedAt).toISOString(),
          endedBy: endedBy === "auto" ? "auto" : "organizer",
        }
      : {}),
    documents: toDocuments(content.documents),
    summary: toDocument(content.summary),
    isBoardOpen: content.boardOpen === true,
  };
};

/** The raw state content of one meeting, to update it without losing fields. */
export const getMeetingStateContent = (
  room: Room,
  meetingId: string,
): (MeetingStateEventContent & { organizerId: string }) | null => {
  const event = room.currentState?.getStateEvents(
    MEETING_EVENT_TYPE,
    meetingId,
  );
  const meeting = event ? chatMeetingFromStateEvent(event) : null;
  if (!event || !meeting) {
    return null;
  }
  return {
    ...event.getContent<MeetingStateEventContent>(),
    organizerId: meeting.organizerId,
  };
};

/**
 * The content to update a meeting from: the homeserver's `latest` copy, read
 * right before the write, since the local one may not have synced a closing
 * yet. A closing known on either side is kept: a state rewritten without it
 * would reopen the meeting. `latest` is ignored when it is not a meeting.
 */
export const mergeLatestMeetingContent = (
  local: MeetingStateEventContent & { organizerId: string },
  latest: unknown,
): MeetingStateEventContent & { organizerId: string } => {
  const fetched =
    typeof latest === "object" && latest !== null
      ? (latest as Partial<MeetingStateEventContent>)
      : null;
  const base =
    fetched &&
    typeof fetched.meetingUrl === "string" &&
    typeof fetched.startedAt === "number"
      ? (fetched as MeetingStateEventContent)
      : local;
  const closing = typeof base.endedAt === "number" ? base : local;
  return {
    ...base,
    // The organizer never changes, and older states only name it as sender.
    organizerId: local.organizerId,
    ...(typeof closing.endedAt === "number"
      ? {
          endedAt: closing.endedAt,
          endedBy: closing.endedBy === "auto" ? "auto" : "organizer",
        }
      : {}),
  };
};

/** Every meeting held in a room's history, newest first. */
export const getChatMeetingsFromRoom = (room: Room): ChatMeeting[] =>
  (room.currentState?.getStateEvents(MEETING_EVENT_TYPE) ?? [])
    .map((event) => chatMeetingFromStateEvent(event))
    .filter((meeting): meeting is ChatMeeting => meeting !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
