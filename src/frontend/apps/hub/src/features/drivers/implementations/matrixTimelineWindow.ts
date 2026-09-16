import {
  EventTimeline,
  type IRoomTimelineData,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  RoomEvent,
  TimelineWindow,
} from "matrix-js-sdk/lib/matrix";

import { isMainTimelineMessage } from "./matrixEventMapping";

const MAX_TIMELINE_PAGINATION_STEPS = 200;
const TIMELINE_WINDOW_LIMIT = Number.MAX_SAFE_INTEGER;

type RoomTimelineListener = (
  event: MatrixEvent,
  room: Room | undefined,
  toStartOfTimeline: boolean | undefined,
  removed: boolean,
  data: IRoomTimelineData,
) => void;

export const mainTimelineEvents = (window: TimelineWindow): MatrixEvent[] =>
  window.getEvents().filter(isMainTimelineMessage);

/**
 * Matrix TimelineWindow installs a Room.timeline listener but exposes no
 * disposal API. These windows are request-scoped, so retain and remove only
 * the listener added by this constructor once the page or scan is complete.
 */
export const scopedTimelineWindow = (mx: MatrixClient, room: Room) => {
  const existingListeners = new Set(room.listeners(RoomEvent.Timeline));
  const window = new TimelineWindow(mx, room.getUnfilteredTimelineSet(), {
    windowLimit: TIMELINE_WINDOW_LIMIT,
  });
  const windowListeners = room
    .listeners(RoomEvent.Timeline)
    .filter((listener) => !existingListeners.has(listener));

  return {
    window,
    dispose: () => {
      windowListeners.forEach((listener) =>
        room.off(
          RoomEvent.Timeline,
          listener as unknown as RoomTimelineListener,
        ),
      );
    },
  };
};

const timelineWindowSignature = (
  window: TimelineWindow,
  direction: typeof EventTimeline.BACKWARDS | typeof EventTimeline.FORWARDS,
): string => {
  const events = window.getEvents();
  const index = window.getTimelineIndex(direction);
  return [
    events.length,
    events[0]?.getId() ?? "",
    events[events.length - 1]?.getId() ?? "",
    index?.index ?? "",
    index?.timeline.getPaginationToken(direction) ?? "",
    index?.timeline.getNeighbouringTimeline(direction) ? "linked" : "",
  ].join(":");
};

/**
 * Extends a contextual SDK window until the caller has enough displayable
 * messages or the requested Matrix direction is genuinely exhausted.
 */
export const extendTimelineWindow = async (
  window: TimelineWindow,
  direction: typeof EventTimeline.BACKWARDS | typeof EventTimeline.FORWARDS,
  limit: number,
  hasEnough: () => boolean,
): Promise<void> => {
  for (let step = 0; step < MAX_TIMELINE_PAGINATION_STEPS; step += 1) {
    if (hasEnough() || !window.canPaginate(direction)) {
      return;
    }
    const before = timelineWindowSignature(window, direction);
    await window.paginate(direction, limit, true, 20);
    const after = timelineWindowSignature(window, direction);
    if (before === after) {
      return;
    }
  }
  throw new Error(
    "matrixTimelineWindow: timeline pagination exceeded the safety limit.",
  );
};
