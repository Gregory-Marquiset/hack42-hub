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

export const MEETING_EVENT_TYPE = "io.lasuite.hub.meeting";

/** Content of an `io.lasuite.hub.meeting` state event. */
export type MeetingStateEventContent = {
  meetingUrl: string;
  /** Epoch milliseconds. */
  startedAt: number;
  documents?: unknown;
  summary?: unknown;
};

// Registers the custom state event so `sendStateEvent` accepts it.
declare module "matrix-js-sdk/lib/@types/event" {
  interface StateEvents {
    "io.lasuite.hub.meeting": MeetingStateEventContent;
  }
}

/**
 * Visio (Meet) exposes no "is this call over" signal, so there is no event to
 * flip a meeting from ongoing to ended. Instead a meeting is only offered as
 * "join the existing call" for this long after it started; past that window
 * the next camera click starts a fresh one. Generous enough to cover a long
 * meeting without ever forcing two simultaneous rooms for the same call.
 */
export const MEETING_ONGOING_WINDOW_MS = 3 * 60 * 60 * 1000;

const toDocument = (raw: unknown): ChatMeetingDocument | undefined => {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { id, title, url } = raw as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof url !== "string"
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
  now: number = Date.now(),
): ChatMeeting | null => {
  const content = event.getContent<Record<string, unknown>>();
  const url = content.meetingUrl;
  const startedAt = content.startedAt;
  const organizerId = event.getSender();
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
  return {
    id: stateKey,
    url,
    organizerId,
    startedAt: new Date(startedAt).toISOString(),
    isOngoing: now - startedAt < MEETING_ONGOING_WINDOW_MS,
    documents: toDocuments(content.documents),
    summary: toDocument(content.summary),
  };
};

/** Every meeting held in a room's history, newest first. */
export const getChatMeetingsFromRoom = (room: Room): ChatMeeting[] =>
  (room.currentState?.getStateEvents(MEETING_EVENT_TYPE) ?? [])
    .map((event) => chatMeetingFromStateEvent(event))
    .filter((meeting): meeting is ChatMeeting => meeting !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
