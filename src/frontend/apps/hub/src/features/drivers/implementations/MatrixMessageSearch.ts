import {
  EventStatus,
  EventTimeline,
  EventType,
  MatrixClient,
  RelationType,
  RoomEvent,
} from "matrix-js-sdk/lib/matrix";
import type { MatrixEvent } from "matrix-js-sdk/lib/models/event";
import type { Room } from "matrix-js-sdk/lib/models/room";

import { messageBackfills } from "@/features/chat/search/messageBackfillCoordinator";
import {
  buildExcerpt,
  findMatchRange,
  type MessageSearchDocument,
  type MessageContentKind,
  matchesMessageFilters,
  normalizeSearch,
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
import { isMessageEvent } from "./matrixEventMapping";
import { matrixJoinedRoomToLocalChat } from "./matrixRoomMapping";

const PERSIST_DEBOUNCE_MS = 250;
const BACKFILL_MAX_MESSAGES = 200;
const BACKFILL_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const BACKFILL_PAGE_SIZE = 50;
/** The oldest messages of a room beyond this are dropped from the index. */
const MAX_MESSAGES_PER_ROOM = 2_000;

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

/**
 * Sent and acknowledged by the server. A local echo keeps a temporary `~` id
 * until then: it is indexed on its `LocalEchoUpdated`, under its real id.
 */
const isSettledEvent = (event: MatrixEvent): boolean => {
  const id = event.getId();
  return (
    !!id &&
    !id.startsWith("~") &&
    (!event.status || event.status === EventStatus.SENT)
  );
};

/**
 * Whether an event becomes a search document of its own, for the live and
 * the backfill paths alike. An edit is not one: it rewrites its original.
 */
const isIndexableMessage = (event: MatrixEvent): boolean =>
  isMessageEvent(event) &&
  !event.isRedacted() &&
  !event.isDecryptionFailure() &&
  isSettledEvent(event);

export class MatrixMessageSearch {
  private readonly messages = new Map<
    string,
    Map<string, MessageSearchDocument>
  >();
  private revision = 0;
  private status: MessageSearchStatus = { ...EMPTY_MESSAGE_SEARCH_STATUS };
  private disposed = false;
  /** Storage is only reported missing once opening it has settled. */
  private opened = false;
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
    /** Another tab logged out or deleted the index: this instance is over. */
    private readonly revoked: () => void = () => {},
  ) {
    this.storage = new MessageSearchStorage(databaseName, () => {
      this.close();
      this.revoked();
    });
  }

  async start(): Promise<void> {
    this.status = { ...EMPTY_MESSAGE_SEARCH_STATUS, freshness: "current" };

    const restored = await this.storage.open();
    this.opened = true;
    if (this.disposed) return;
    for (const doc of restored.messages) this.indexMessage(doc.roomId, doc);
    for (const roomId of this.messages.keys()) this.trimRoom(roomId);
    for (const state of restored.backfill) {
      // The in-memory pagination behind a "backfilling" state is lost on
      // reload: let the room be requested again instead of showing it stuck.
      this.backfillStates.set(
        state.roomId,
        state.status === "backfilling"
          ? { ...state, status: "pending" }
          : state,
      );
    }

    // Live messages: new events, local echoes once the server has given them
    // their id, and redactions.
    this.detach = () => {
      this.mx.off(RoomEvent.Timeline, this.onTimeline);
      this.mx.off(RoomEvent.LocalEchoUpdated, this.onLocalEchoUpdated);
      this.mx.off(RoomEvent.Redaction, this.onRedaction);
    };
    this.mx.on(RoomEvent.Timeline, this.onTimeline);
    this.mx.on(RoomEvent.LocalEchoUpdated, this.onLocalEchoUpdated);
    this.mx.on(RoomEvent.Redaction, this.onRedaction);

    this.recomputeStatus();
    this.emit();
  }

  private onTimeline = (
    event: MatrixEvent,
    room: Room | undefined,
    _toStartOfTimeline: boolean | undefined,
    removed: boolean,
  ) => {
    if (!removed) this.indexLive(event, room);
  };

  private onLocalEchoUpdated = (event: MatrixEvent, room: Room) =>
    this.indexLive(event, room);

  private onRedaction = (event: MatrixEvent, room: Room) => {
    const redactedId = event.getAssociatedId();
    if (this.disposed || !redactedId) return;
    this.removeMessage(room.roomId, redactedId);
  };

  private indexLive(event: MatrixEvent, room?: Room, decrypted = false): void {
    if (this.disposed || !room) return;
    // Read membership synchronously off the room's own state, not the
    // asynchronously-populated joinedRoomIds set: that set is filled by
    // refreshJoinedRoomIds() AFTER the initial sync's timeline events have
    // already fired, so gating on it here silently (and permanently) drops
    // every message received before that population completes.
    if (room.getMyMembership() !== "join") return;
    // Live events are decrypted on demand, after they are announced.
    if (event.isEncrypted() && !decrypted) {
      void this.mx
        .decryptEventIfNeeded(event)
        .catch(() => {})
        .then(() => this.indexLive(event, room, true));
      return;
    }

    const relation = event.getRelation();
    if (
      relation?.rel_type === RelationType.Replace &&
      relation.event_id &&
      event.getType() === EventType.RoomMessage &&
      isSettledEvent(event)
    ) {
      this.applyEdit(room.roomId, relation.event_id, event);
      return;
    }
    if (!isIndexableMessage(event)) return;

    const doc = this.buildMessageDocument(room.roomId, event);
    if (doc) this.storeLive(doc);
  }

  /** An edit rewrites the text of the message it replaces, never a new one. */
  private applyEdit(roomId: string, targetId: string, edit: MatrixEvent) {
    const original = this.messages.get(roomId)?.get(targetId);
    // Only the original sender can edit a message (spec, m.replace).
    if (!original || original.senderId !== edit.getSender()) return;
    const content = edit.getContent<{
      "m.new_content"?: MatrixMessageContent;
    }>()["m.new_content"];
    const fields = content && this.contentFields(content);
    if (fields) this.storeLive({ ...original, ...fields });
  }

  private storeLive(doc: MessageSearchDocument): void {
    this.indexMessage(doc.roomId, doc);
    this.pendingMessages.push(doc);
    this.trimRoom(doc.roomId);
    this.schedulePersist();
    this.emit();
  }

  private removeMessage(roomId: string, eventId: string): void {
    if (this.forget(roomId, eventId)) this.emit();
  }

  /** Drops one message from memory, from the write queue and from storage. */
  private forget(roomId: string, eventId: string): boolean {
    const removed = this.messages.get(roomId)?.delete(eventId) ?? false;
    // A queued write of it would bring it back after the deletion.
    const pending = this.pendingMessages.filter(
      (doc) => doc.roomId !== roomId || doc.eventId !== eventId,
    );
    this.pendingMessages.splice(0, this.pendingMessages.length, ...pending);
    void this.storage.deleteMessage(roomId, eventId);
    return removed;
  }

  /** Keeps a busy room from growing the index without bound. */
  private trimRoom(roomId: string): void {
    const messages = this.messages.get(roomId);
    if (!messages || messages.size <= MAX_MESSAGES_PER_ROOM) return;
    const oldest = [...messages.values()]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, messages.size - MAX_MESSAGES_PER_ROOM);
    for (const doc of oldest) this.forget(roomId, doc.eventId);
  }

  setJoinedRooms(roomIds: Set<string>): void {
    this.joinedRoomIds = new Set(roomIds);
    // A room left is no longer searchable: drop what was indexed for it.
    const left = [...this.messages.keys(), ...this.backfillStates.keys()];
    for (const roomId of new Set(left)) {
      if (roomIds.has(roomId)) continue;
      this.messages.delete(roomId);
      this.backfillStates.delete(roomId);
      const pending = this.pendingMessages.filter(
        (doc) => doc.roomId !== roomId,
      );
      this.pendingMessages.splice(0, this.pendingMessages.length, ...pending);
      void this.storage.deleteRoom(roomId);
    }
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

      const events = mainTimelineEvents(window).filter(isIndexableMessage);
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
      this.trimRoom(roomId);

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
    const allResults: MessageSearchDocument[] = [];

    // Search across all messages in all rooms
    for (const roomMessages of this.messages.values()) {
      for (const doc of roomMessages.values()) {
        // Apply filters (AND semantics)
        if (!matchesMessageFilters(doc, filters)) continue;
        if (
          normalizedFreeText &&
          !doc.normalizedBody.includes(normalizedFreeText)
        )
          continue;
        allResults.push(doc);
      }
    }

    // Sort by timestamp descending (newest first)
    allResults.sort((a, b) => b.timestamp - a.timestamp);

    const currentUserId = this.mx.getUserId() ?? undefined;

    // Slice to limit, dropping any result whose room can no longer be resolved
    // (e.g. a room left between indexing and querying).
    const results = allResults.slice(0, limit).flatMap((doc) => {
      const room = this.mx.getRoom(doc.roomId);
      if (!room) return [];
      const chat = matrixJoinedRoomToLocalChat(room, currentUserId);
      // Offsets are taken on the displayed text itself, then rebased onto
      // the excerpt, so the highlight lands on the matched characters.
      const text = doc.body.normalize("NFC");
      const { excerpt, matchRanges } = buildExcerpt(
        text,
        findMatchRange(text, normalizedFreeText),
      );
      return [
        {
          chat,
          eventId: doc.eventId,
          senderId: doc.senderId,
          senderName: doc.senderName,
          excerpt,
          matchRanges,
          timestamp: new Date(doc.timestamp).toISOString(),
          threadRootId: doc.threadRootId,
        },
      ];
    });

    return {
      results,
      total: allResults.length,
    };
  }

  getStatus(): MessageSearchStatus {
    return {
      ...this.status,
      storageAvailable: !this.opened || this.storage.state === "persistent",
    };
  }

  /** Requests again every room whose history could not be fetched. */
  retry(): void {
    for (const state of this.backfillStates.values()) {
      if (state.status === "error") this.backfillRoom(state.roomId);
    }
  }

  close(): void {
    this.disposed = true;
    this.detach();
    clearTimeout(this.persistTimer);
    messageBackfills.cancel(this.poolKey);
    this.storage.close();
  }

  /** Closes, then erases the index stored for this account. */
  async remove(): Promise<void> {
    this.close();
    this.messages.clear();
    await this.storage.remove();
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
      const fields = this.contentFields(content);
      if (!fields) return null;

      const senderId = event.getSender();
      const timestamp = event.getTs();
      if (!senderId || !timestamp) return null;

      // Get sender display name
      const room = this.mx.getRoom(roomId);
      const member = room?.getMember(senderId);
      const senderName = member?.name || senderId;

      // Extract reply-to info
      const { replyToEventId, replyToSenderId } = this.extractReplyInfo(
        content,
        room,
      );

      return {
        roomId,
        eventId: event.getId() || "",
        senderId,
        senderName,
        ...fields,
        replyToEventId,
        replyToSenderId,
        timestamp,
        threadRootId:
          event.threadRootId && !event.isThreadRoot
            ? event.threadRootId
            : undefined,
      };
    } catch {
      return null;
    }
  }

  /** The part of a document read from the content, which an edit replaces. */
  private contentFields(
    content: MatrixMessageContent,
  ): Pick<
    MessageSearchDocument,
    "body" | "normalizedBody" | "contentKind" | "hasLink" | "mentionedUserIds"
  > | null {
    if (!content.body || typeof content.body !== "string") return null;
    return {
      body: content.body,
      normalizedBody: normalizeSearch(content.body),
      contentKind: this.msgtypeToContentKind(content.msgtype || "m.text"),
      hasLink: EXTRACT_URL_REGEX.test(content.body),
      mentionedUserIds: this.extractMentionedUsers(content),
    };
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

  /**
   * The replied-to sender is read off the loaded timeline, best effort: a
   * reply to a message outside it only records the event id.
   */
  private extractReplyInfo(
    content: MatrixMessageContent,
    room: Room | null,
  ): {
    replyToEventId?: string;
    replyToSenderId?: string;
  } {
    const inReplyTo = content["m.relates_to"]?.["m.in_reply_to"];
    if (!inReplyTo?.event_id) {
      return {};
    }

    return {
      replyToEventId: inReplyTo.event_id,
      replyToSenderId:
        room?.findEventById(inReplyTo.event_id)?.getSender() ?? undefined,
    };
  }

  private emit(): void {
    this.changed();
  }
}
