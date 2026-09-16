/**
 * Meetings are Matrix room state, not a backend model: starting a call from
 * the camera button writes a `io.lasuite.hub.meeting` state event (one
 * `state_key` per meeting, so the history accumulates instead of being
 * overwritten), and the homeserver's `/sync` replicates it to every member —
 * no polling, no server of our own. See `.context/CHANTIER-2-REUNIONS.md` for
 * the sibling "planned meeting" chantier this convention is modelled on.
 */
import type { MatrixEvent, Room } from "matrix-js-sdk/lib/matrix";

import type { ChatMeeting, ChatMeetingDocument } from "../types";

export const MEETING_EVENT_TYPE = "io.lasuite.hub.meeting";

const DEFAULT_MEET_URL = "https://meet.hack42-suite.duckdns.org";

/** Base URL of the Meet instance, overridable per environment. */
export const MEET_BASE_URL = (
  process.env.NEXT_PUBLIC_MEET_URL || DEFAULT_MEET_URL
).replace(/\/+$/, "");

/**
 * Visio (Meet) exposes no "is this call over" signal (documented dead end —
 * see CHANTIER-2-REUNIONS.md §4.2), so there is no event to flip a meeting
 * from ongoing to ended. Instead a meeting is only offered as "join the
 * existing call" for this long after it started; past that window the next
 * camera click starts a fresh one. Generous enough to cover a long meeting
 * without ever forcing two simultaneous rooms for the same call.
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

export const buildMeetingUrl = (meetingId: string): string =>
  `${MEET_BASE_URL}/${meetingId}`;
