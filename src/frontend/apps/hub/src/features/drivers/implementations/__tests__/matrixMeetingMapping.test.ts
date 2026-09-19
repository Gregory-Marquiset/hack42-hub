import type { MatrixEvent } from "matrix-js-sdk/lib/matrix";
import { describe, expect, it } from "vitest";

import {
  chatMeetingFromContent,
  chatMeetingFromStateEvent,
  mergeLatestMeetingContent,
} from "../matrixMeetingMapping";

const SENDER = "@sender:localhost";
const ORGANIZER = "@orga:localhost";
const STARTED_AT = Date.UTC(2026, 8, 16, 10, 0);
const BASE = {
  meetingUrl: "https://meet.example.com/abc-defg-hij",
  startedAt: STARTED_AT,
};

const stateEvent = (
  content: Record<string, unknown>,
  stateKey: string | undefined = "abc-defg-hij",
): MatrixEvent =>
  ({
    getContent: () => content,
    getSender: () => SENDER,
    getStateKey: () => stateKey,
  }) as unknown as MatrixEvent;

describe("chatMeetingFromStateEvent", () => {
  it("maps a complete meeting", () => {
    expect(
      chatMeetingFromStateEvent(
        stateEvent({
          ...BASE,
          organizerId: ORGANIZER,
          title: "Point hebdo",
          plannedDurationMinutes: 30,
          documents: [{ id: "d", title: "Doc", url: "https://x/d" }],
          boardOpen: true,
        }),
      ),
    ).toEqual({
      id: "abc-defg-hij",
      url: BASE.meetingUrl,
      organizerId: ORGANIZER,
      title: "Point hebdo",
      startedAt: new Date(STARTED_AT).toISOString(),
      plannedDurationMinutes: 30,
      documents: [{ id: "d", title: "Doc", url: "https://x/d" }],
      isBoardOpen: true,
    });
  });

  it.each([
    ["no link", { startedAt: STARTED_AT }],
    ["an empty link", { ...BASE, meetingUrl: "" }],
    ["a start that is not a time", { ...BASE, startedAt: "10:00" }],
  ])("ignores a meeting with %s", (_label, content) => {
    expect(chatMeetingFromStateEvent(stateEvent(content))).toBeNull();
  });

  it("ignores a meeting without state key", () => {
    expect(chatMeetingFromStateEvent(stateEvent(BASE, ""))).toBeNull();
  });

  it("names its sender as organizer when an older state does not", () => {
    expect(chatMeetingFromStateEvent(stateEvent(BASE))?.organizerId).toBe(
      SENDER,
    );
  });

  it("drops a title made of spaces, and trims the others", () => {
    expect(
      chatMeetingFromStateEvent(stateEvent({ ...BASE, title: "   " })),
    ).not.toHaveProperty("title");
    expect(
      chatMeetingFromStateEvent(stateEvent({ ...BASE, title: " Rétro " }))
        ?.title,
    ).toBe("Rétro");
  });

  it("says the organizer closed it unless the server did", () => {
    const closed = (endedBy?: unknown) =>
      chatMeetingFromStateEvent(
        stateEvent({ ...BASE, endedAt: STARTED_AT + 60_000, endedBy }),
      );

    expect(closed()?.endedBy).toBe("organizer");
    expect(closed("someone")?.endedBy).toBe("organizer");
    expect(closed("auto")?.endedBy).toBe("auto");
    expect(closed()?.endedAt).toBe(new Date(STARTED_AT + 60_000).toISOString());
  });

  it("opens the board only when the state says so", () => {
    expect(chatMeetingFromStateEvent(stateEvent(BASE))?.isBoardOpen).toBe(
      false,
    );
    expect(
      chatMeetingFromStateEvent(stateEvent({ ...BASE, boardOpen: "yes" }))
        ?.isBoardOpen,
    ).toBe(false);
  });

  it("keeps only the well-formed web links among the documents", () => {
    const meeting = chatMeetingFromStateEvent(
      stateEvent({
        ...BASE,
        documents: [
          { id: "ok", title: "Doc", url: "https://x/ok" },
          { id: "relative", title: "Doc", url: "docs.example.org/1" },
          { id: "no-title", url: "https://x/2" },
          "not a document",
          null,
        ],
        plannedDurationMinutes: -5,
      }),
    );

    expect(meeting?.documents.map((doc) => doc.id)).toEqual(["ok"]);
    expect(meeting).not.toHaveProperty("plannedDurationMinutes");
  });

  it("reads documents that are not a list as none", () => {
    expect(
      chatMeetingFromStateEvent(stateEvent({ ...BASE, documents: {} }))
        ?.documents,
    ).toEqual([]);
  });
});

describe("chatMeetingFromContent", () => {
  it("maps a meeting just written, before any event carries it", () => {
    expect(
      chatMeetingFromContent("abc-defg-hij", { ...BASE, organizerId: SENDER }),
    ).toMatchObject({ id: "abc-defg-hij", organizerId: SENDER });
    expect(chatMeetingFromContent("abc-defg-hij", BASE)).toBeNull();
  });
});

describe("mergeLatestMeetingContent", () => {
  const local = { ...BASE, organizerId: ORGANIZER };

  it("starts from the homeserver's copy", () => {
    const latest = { ...BASE, title: "Renommée", boardOpen: true };

    expect(mergeLatestMeetingContent(local, latest)).toEqual({
      ...latest,
      organizerId: ORGANIZER,
    });
  });

  it("keeps a closing only the homeserver knows", () => {
    const latest = { ...BASE, endedAt: STARTED_AT, endedBy: "auto" };

    expect(mergeLatestMeetingContent(local, latest)).toMatchObject({
      endedAt: STARTED_AT,
      endedBy: "auto",
    });
  });

  it("keeps a closing only this device knows", () => {
    const closed = { ...local, endedAt: STARTED_AT, endedBy: "organizer" };

    expect(
      mergeLatestMeetingContent(closed as typeof local, BASE),
    ).toMatchObject({ endedAt: STARTED_AT, endedBy: "organizer" });
  });

  it("falls back on the local copy when the answer is not a meeting", () => {
    expect(mergeLatestMeetingContent(local, {})).toEqual(local);
    expect(mergeLatestMeetingContent(local, null)).toEqual(local);
  });
});
