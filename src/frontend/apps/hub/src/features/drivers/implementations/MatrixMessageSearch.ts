import { EventTimeline, MatrixClient, RoomEvent } from "matrix-js-sdk/lib/matrix";
import type { MatrixEvent } from "matrix-js-sdk/lib/models/event";
import type { Room } from "matrix-js-sdk/lib/models/room";

import { messageBackfills } from "@/features/chat/search/messageBackfillCoordinator";
import { normalizeSearch } from "@/features/chat/search/model";
import {
  type MessageSearchDocument,
  type MessageContentKind,
  matchesMessageFilters,
} from "@/features/chat/search/model";
import { MessageSearchStorage } from "@/features/chat/search/messageStorage";
import {
  EMPTY_MESSAGE_SEARCH_STATUS,
  type MessageBackfillState,
  type MessageSearchPage,
  type MessageSearchRequest,
  type MessageSearchStatus,
  type RoomBackfillInfo,
} from "@/features/chat/search/types";
import {
  extendTimelineWindow,
  mainTimelineEvents,
  scopedTimelineWindow,
} from "./matrixTimelineWindow";
import { matrixJoinedRoomToLocalChat } from "./matrixRoomMapping";

const PERSIST_DEBOUNCE_MS = 250;
const BACKFILL_MAX_MESSAGES = 200;
const BACKFILL_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const BACKFILL_PAGE_SIZE = 50;

const EXTRACT_URL_REGEX = /https?:\/\/\S+/i;
const LEGACY_PILL_REGEX =
  /https:\/\/matrix\.to\/#\/@([^:]+):([^/]+)|@([^:]+):([^/]+)/g;

type MatrixMessageContent = {
  body?: string;
  formatted_body?: string;
  msgtype?: string;
  "m.mentions"?: { user_ids?: string[] };
  "m.relates_to"?: { "m.in_reply_to"?: { event_id?: string } };
};

export class MatrixMessageSearch {
  private readonly messages = new Map<
    string,
    Map<string, MessageSearchDocument>
  >();
  private revision = 0;
  private status: MessageSearchStatus = { ...EMPTY_MESSAGE_SEARCH_STATUS };
  private disposed = false;
  private detach = () => {};
  private readonly poolKey = crypto.randomUUID();
  private joinedRoomIds = new Set<string>();
  private readonly storage: MessageSearchStorage;
  private readonly pendingMessages: MessageSearchDocument[] = [];
  private persistTimer?: ReturnType<typeof setTimeout>;
  private readonly backfillStates = new Map<string, MessageBackfillState>();

  constructor(
    private readonly mx: MatrixClient,
    private readonly accountId: string,
    databaseName: string,
    private readonly changed: () => void,
  ) {
    this.storage = new MessageSearchStorage(databaseName, () => this.close());
  }

  async start(): Promise<void> {
    this.status = { ...EMPTY_MESSAGE_SEARCH_STATUS, freshness: "current" };

    const restored = await this.storage.open();
    if (this.disposed) return;
    for (const doc of restored.messages) this.indexMessage(doc.roomId, doc);
    for (const state of restored.backfill) {
      // The in-memory pagination behind a "backfilling" state is lost on
      // reload: let the room be requested again instead of showing it stuck.
      this.backfillStates.set(
        state.roomId,
        state.status === "backfilling" ? { ...state, status: "pending" } : state,
      );
    }

    // Set up timeline observer for live messages
    this.detach = () => this.mx.off(RoomEvent.Timeline, this.onTimeline);
    this.mx.on(RoomEvent.Timeline, this.onTimeline);

    this.recomputeStatus();
    this.emit();
  }

  private onTimeline = (event: MatrixEvent, room?: Room) => {
    if (this.disposed || !room) return;
    // Read membership synchronously off the room's own state, not the
    // asynchronously-populated joinedRoomIds set: that set is filled by
    // refreshJoinedRoomIds() AFTER the initial sync's timeline events have
    // already fired, so gating on it here silently (and permanently) drops
    // every message received before that population completes.
    if (room.getMyMembership() !== "join") return;
    if (event.isRedacted() || event.getType() !== "m.room.message") return;

    const doc = this.buildMessageDocument(room.roomId, event);
    if (!doc) return;

    this.indexMessage(room.roomId, doc);
    this.pendingMessages.push(doc);
    this.schedulePersist();
    this.emit();
  };

  setJoinedRooms(roomIds: Set<string>): void {
    this.joinedRoomIds = new Set(roomIds);
    this.recomputeStatus();
    this.emit();
  }

  private recomputeStatus(): void {
    let roomsBackfilled = 0;
    let hasFailures = false;
    const pendingRooms: RoomBackfillInfo[] = [];
    for (const roomId of this.joinedRoomIds) {
      const state = this.backfillStates.get(roomId);
      if (state?.status === "done") {
        roomsBackfilled++;
        continue;
      }
      if (state?.status === "error") hasFailures = true;
      pendingRooms.push({
        roomId,
        roomName: this.mx.getRoom(roomId)?.name || roomId,
        status: state?.status ?? "pending",
      });
    }
    this.status = {
      ...this.status,
      roomsEligible: this.joinedRoomIds.size,
      roomsBackfilled,
      roomsPending: this.joinedRoomIds.size - roomsBackfilled,
      hasFailures,
      pendingRooms,
    };
  }

  /** Fetches up to BACKFILL_MAX_MESSAGES or BACKFILL_MAX_AGE_MS of history for one room, whichever bound is hit first. */
  backfillRoom(roomId: string): void {
    if (this.disposed) return;
    const state = this.backfillStates.get(roomId);
    if (state?.status === "done" || state?.status === "backfilling") return;
    const room = this.mx.getRoom(roomId);
    if (!room) return;

    this.setBackfillState({
      roomId,
      status: "backfilling",
      messageCount: state?.messageCount ?? 0,
      oldestTimestamp: state?.oldestTimestamp,
    });
    messageBackfills.enqueue({
      key: `${this.poolKey}:${roomId}`,
      account: this.poolKey,
      activity: Date.now(),
      added: Date.now(),
      due: 0,
      run: (cancelled) => this.runBackfill(roomId, room, cancelled),
    });
  }

  private async runBackfill(
    roomId: string,
    room: Room,
    cancelled: () => boolean,
  ): Promise<void> {
    if (this.disposed || cancelled()) return;
    const cutoff = Date.now() - BACKFILL_MAX_AGE_MS;
    const { window, dispose } = scopedTimelineWindow(this.mx, room);
    try {
      await window.load(undefined, 1);
      await extendTimelineWindow(
        window,
        EventTimeline.BACKWARDS,
        BACKFILL_PAGE_SIZE,
        () => {
          const events = mainTimelineEvents(window);
          const oldest = events[0];
          return (
            events.length >= BACKFILL_MAX_MESSAGES ||
            (!!oldest && oldest.getTs() <= cutoff)
          );
        },
      );
      if (this.disposed || cancelled()) return;

      // Paginated-in history arrives still encrypted; unlike live events it
      // is never awaited elsewhere, so isMainTimelineMessage()/getContent()
      // would otherwise see m.room.encrypted for every backfilled message.
      await Promise.all(
        window
          .getEvents()
          .filter((event) => event.isEncrypted())
          .map((event) => this.mx.decryptEventIfNeeded(event).catch(() => {})),
      );
      if (this.disposed || cancelled()) return;

      const events = mainTimelineEvents(window).filter(
        (event) => !event.isRedacted(),
      );
      const withinAge = events.filter((event) => event.getTs() > cutoff);
      const bounded =
        withinAge.length > BACKFILL_MAX_MESSAGES
          ? withinAge.slice(withinAge.length - BACKFILL_MAX_MESSAGES)
          : withinAge;

      const docs = bounded.flatMap((event) => {
        const doc = this.buildMessageDocument(roomId, event);
        return doc ? [doc] : [];
      });
      for (const doc of docs) this.indexMessage(roomId, doc);
      void this.storage.putMessages(docs);

      this.setBackfillState({
        roomId,
        status: "done",
        messageCount: docs.length,
        oldestTimestamp: docs[0]?.timestamp,
      });
    } catch {
      if (!this.disposed) {
        this.setBackfillState({
          roomId,
          status: "error",
          messageCount: this.backfillStates.get(roomId)?.messageCount ?? 0,
        });
      }
    } finally {
      dispose();
    }
  }

  private setBackfillState(state: MessageBackfillState): void {
    this.backfillStates.set(state.roomId, state);
    void this.storage.putBackfillState(state);
    this.recomputeStatus();
    this.emit();
  }

  async search(request: MessageSearchRequest): Promise<MessageSearchPage> {
    if (this.disposed) {
      return { results: [], total: 0 };
    }

    const { freeText, filters, limit = 100 } = request;
    const normalizedFreeText = normalizeSearch(freeText);
    const allResults: Array<{
      doc: MessageSearchDocument;
      matchRanges: [number, number][];
      excerpt: string;
    }> = [];

    // Search across all messages in all rooms
    for (const roomMessages of this.messages.values()) {
      for (const doc of roomMessages.values()) {
        // Apply filters (AND semantics)
        if (!matchesMessageFilters(doc, filters)) continue;

        // Apply free-text search (OR with any field)
        let matchRanges: [number, number][] = [];
        if (normalizedFreeText) {
          const bodyMatch = doc.normalizedBody.indexOf(normalizedFreeText);
          if (bodyMatch === -1) continue; // No match

          // Map back to original body offset
          matchRanges = [[bodyMatch, bodyMatch + normalizedFreeText.length]];
        }

        // Build excerpt (50 chars before and after match, or from start)
        const excerpt = this.buildExcerpt(doc.body, matchRanges[0]);

        allResults.push({ doc, matchRanges, excerpt });
      }
    }

    // Sort by timestamp descending (newest first)
    allResults.sort((a, b) => b.doc.timestamp - a.doc.timestamp);

    const currentUserId = this.mx.getUserId() ?? undefined;

    // Slice to limit, dropping any result whose room can no longer be resolved
    // (e.g. a room left between indexing and querying).
    const results = allResults
      .slice(0, limit)
      .flatMap(({ doc, matchRanges, excerpt }) => {
        const room = this.mx.getRoom(doc.roomId);
        if (!room) return [];
        const chat = matrixJoinedRoomToLocalChat(room, currentUserId);
        return [
          {
            chat,
            eventId: doc.eventId,
            senderId: doc.senderId,
            senderName: doc.senderName,
            excerpt,
            matchRanges,
            timestamp: new Date(doc.timestamp).toISOString(),
          },
        ];
      });

    return {
      results,
      total: allResults.length,
    };
  }

  getStatus(): MessageSearchStatus {
    return { ...this.status };
  }

  close(): void {
    this.disposed = true;
    this.detach();
    clearTimeout(this.persistTimer);
    messageBackfills.cancel(this.poolKey);
    this.storage.close();
  }

  async remove(): Promise<void> {
    this.close();
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      const batch = this.pendingMessages.splice(0, this.pendingMessages.length);
      void this.storage.putMessages(batch);
    }, PERSIST_DEBOUNCE_MS);
  }

  private indexMessage(roomId: string, doc: MessageSearchDocument): void {
    if (!this.messages.has(roomId)) {
      this.messages.set(roomId, new Map());
    }
    this.messages.get(roomId)!.set(doc.eventId, doc);
    this.revision++;
  }

  private buildMessageDocument(
    roomId: string,
    event: MatrixEvent,
  ): MessageSearchDocument | null {
    try {
      const content = event.getContent<MatrixMessageContent>();
      if (!content.body || typeof content.body !== "string") return null;

      const senderId = event.getSender();
      const timestamp = event.getTs();
      if (!senderId || !timestamp) return null;

      // Determine content kind from msgtype
      const msgtype = content.msgtype || "m.text";
      const contentKind = this.msgtypeToContentKind(msgtype);

      // Extract mentioned user IDs
      const mentionedUserIds = this.extractMentionedUsers(content);

      // Check for links
      const hasLink = EXTRACT_URL_REGEX.test(content.body);

      // Extract reply-to info
      const { replyToEventId, replyToSenderId } =
        this.extractReplyInfo(content);

      // Get sender display name
      const room = this.mx.getRoom(roomId);
      const member = room?.getMember(senderId);
      const senderName = member?.name || senderId;

      return {
        roomId,
        eventId: event.getId() || "",
        senderId,
        senderName,
        body: content.body,
        normalizedBody: normalizeSearch(content.body),
        contentKind,
        hasLink,
        mentionedUserIds,
        replyToEventId,
        replyToSenderId,
        timestamp,
      };
    } catch {
      return null;
    }
  }

  private msgtypeToContentKind(msgtype: string): MessageContentKind {
    switch (msgtype) {
      case "m.image":
        return "image";
      case "m.video":
        return "video";
      case "m.audio":
        return "audio";
      case "m.file":
        return "file";
      default:
        return "text";
    }
  }

  private extractMentionedUsers(content: MatrixMessageContent): string[] {
    const mentioned: Set<string> = new Set();

    // Try m.mentions (MSC3952)
    if (Array.isArray(content["m.mentions"]?.user_ids)) {
      content["m.mentions"]!.user_ids!.forEach((id: string) =>
        mentioned.add(id),
      );
    }

    // Fallback: legacy pill regex in body/formatted_body
    const bodyToSearch = content.formatted_body || content.body || "";
    const matches = bodyToSearch.matchAll(LEGACY_PILL_REGEX);
    for (const match of matches) {
      // match[1]@[2]: or match[3]@[4]:
      const localpart = match[1] || match[3];
      const server = match[2] || match[4];
      if (localpart && server) {
        mentioned.add(`@${localpart}:${server}`);
      }
    }

    return Array.from(mentioned);
  }

  private extractReplyInfo(content: MatrixMessageContent): {
    replyToEventId?: string;
    replyToSenderId?: string;
  } {
    const inReplyTo = content["m.relates_to"]?.["m.in_reply_to"];
    if (!inReplyTo?.event_id) {
      return {};
    }

    return { replyToEventId: inReplyTo.event_id };
    // Note: replyToSenderId will be resolved best-effort on indexing,
    // or lazily when needed for matching
  }

  private buildExcerpt(body: string, matchRange?: [number, number]): string {
    const MAX_EXCERPT_LEN = 150;
    const CONTEXT = 50;

    if (!matchRange) {
      // No specific match, just first MAX_EXCERPT_LEN chars
      return body.length > MAX_EXCERPT_LEN
        ? body.substring(0, MAX_EXCERPT_LEN) + "..."
        : body;
    }

    const [start, end] = matchRange;
    const excerptStart = Math.max(0, start - CONTEXT);
    const excerptEnd = Math.min(body.length, end + CONTEXT);

    let excerpt = body.substring(excerptStart, excerptEnd);
    if (excerptStart > 0) excerpt = "..." + excerpt;
    if (excerptEnd < body.length) excerpt = excerpt + "...";

    return excerpt;
  }

  private emit(): void {
    this.changed();
  }
}
