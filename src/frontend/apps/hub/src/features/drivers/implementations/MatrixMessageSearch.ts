import { MatrixClient, RoomEvent } from "matrix-js-sdk/lib/matrix";
import type { MatrixEvent } from "matrix-js-sdk/lib/models/event";
import type { Room } from "matrix-js-sdk/lib/models/room";

import { normalizeSearch } from "@/features/chat/search/model";
import {
  type MessageSearchDocument,
  type MessageContentKind,
  matchesMessageFilters,
} from "@/features/chat/search/model";
import {
  EMPTY_MESSAGE_SEARCH_STATUS,
  type MessageSearchPage,
  type MessageSearchRequest,
  type MessageSearchStatus,
  type SearchFilters,
} from "@/features/chat/search/types";
import { SearchStorage } from "@/features/chat/search/storage";
import { matrixJoinedRoomToLocalChat } from "./matrixRoomMapping";

const EXTRACT_URL_REGEX = /https?:\/\/\S+/i;
const LEGACY_PILL_REGEX = /https:\/\/matrix\.to\/#\/@([^:]+):([^/]+)|@([^:]+):([^/]+)/g;

export class MatrixMessageSearch {
  private readonly messages = new Map<string, Map<string, MessageSearchDocument>>();
  private revision = 0;
  private status: MessageSearchStatus = { ...EMPTY_MESSAGE_SEARCH_STATUS };
  private disposed = false;
  private detach = () => {};
  private readonly poolKey = crypto.randomUUID();
  private joinedRoomIds = new Set<string>();

  constructor(
    private readonly mx: MatrixClient,
    private readonly accountId: string,
    private readonly databaseName: string,
    private readonly changed: () => void
  ) {}

  async start(): Promise<void> {
    this.status = { ...EMPTY_MESSAGE_SEARCH_STATUS, freshness: "current" };

    // Set up timeline observer for live messages
    this.detach = () => this.mx.off(RoomEvent.Timeline, this.onTimeline);
    this.mx.on(RoomEvent.Timeline, this.onTimeline);

    this.emit();
  }

  private onTimeline = (event: MatrixEvent, room?: Room, _toStartOfTimeline?: boolean) => {
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
    this.emit();
  };

  setJoinedRooms(roomIds: Set<string>): void {
    this.joinedRoomIds = new Set(roomIds);
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
  }

  async remove(): Promise<void> {
    this.close();
    // TODO: Implement storage cleanup when storage is integrated
  }

  private indexMessage(roomId: string, doc: MessageSearchDocument): void {
    if (!this.messages.has(roomId)) {
      this.messages.set(roomId, new Map());
    }
    this.messages.get(roomId)!.set(doc.eventId, doc);
    this.revision++;
  }

  private buildMessageDocument(roomId: string, event: MatrixEvent): MessageSearchDocument | null {
    try {
      const content = event.getContent();
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
      const { replyToEventId, replyToSenderId } = this.extractReplyInfo(content);

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

  private extractMentionedUsers(content: Record<string, any>): string[] {
    const mentioned: Set<string> = new Set();

    // Try m.mentions (MSC3952)
    if (content["m.mentions"]?.user_ids && Array.isArray(content["m.mentions"].user_ids)) {
      content["m.mentions"].user_ids.forEach((id: string) => mentioned.add(id));
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

  private extractReplyInfo(content: Record<string, any>): {
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
      return body.length > MAX_EXCERPT_LEN ? body.substring(0, MAX_EXCERPT_LEN) + "..." : body;
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
