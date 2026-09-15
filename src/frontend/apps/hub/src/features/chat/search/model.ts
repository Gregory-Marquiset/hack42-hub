import type { LocalChat } from "@/features/drivers/types";

export type SearchMode = "participants" | "name-only";
export type SearchMember = { name: string };
export type SearchRoom = {
  id: string;
  chat?: LocalChat;
  explicitName?: string;
  alias?: string;
  count: number | null;
  mode?: SearchMode;
  members: Record<string, SearchMember>;
  /** True only for a snapshot advanced through an uninterrupted sync chain. */
  coherent: boolean;
};

/** Completeness deliberately does not participate in the hysteresis rule. */
export const searchMode = (
  previous: SearchMode | undefined,
  count: number,
): SearchMode => {
  const participantLimit = previous === "participants" ? 60 : 50;
  return count <= participantLimit ? "participants" : "name-only";
};

export const normalizeSearch = (value: string): string =>
  value.normalize("NFC").trim().toLowerCase();

export const emptySearchRoom = (id: string): SearchRoom => ({
  id,
  count: null,
  members: {},
  coherent: false,
});

/** Relit aussi les anciens caches, en ne conservant que les données utiles. */
export const restoreSearchRoom = (room: SearchRoom): SearchRoom => ({
  id: room.id,
  chat: room.chat,
  explicitName: room.explicitName,
  alias: room.alias,
  count: room.count,
  mode: room.mode,
  coherent: room.coherent,
  members: Object.fromEntries(
    Object.entries(room.members).map(([id, member]) => [
      id,
      { name: member.name },
    ]),
  ),
});

export const isComplete = (room: SearchRoom, self: string): boolean =>
  room.coherent &&
  room.count !== null &&
  room.count > 0 &&
  Object.keys(room.members).length === room.count &&
  Object.hasOwn(room.members, self);

export type SearchDocument = {
  chat: LocalChat;
  fields: string[];
  subtitle: string;
};

export const searchDocument = (
  room: SearchRoom,
  self: string,
): SearchDocument | null => {
  if (!room.chat) return null;
  const names = Object.entries(room.members)
    .filter(([id]) => id !== self)
    .map(([, member]) => member.name);
  return {
    chat: room.chat,
    fields: [
      room.chat.name,
      room.explicitName ?? "",
      room.alias ?? "",
      ...(room.mode === "participants" ? names : []),
    ].map(normalizeSearch),
    subtitle: names.join(", "),
  };
};

export const yieldSearchWork = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

export type MessageContentKind = "text" | "image" | "video" | "audio" | "file";

export type MessageSearchDocument = {
  roomId: string;
  eventId: string;
  senderId: string;
  senderName: string;
  body: string;
  normalizedBody: string;
  contentKind: MessageContentKind;
  hasLink: boolean;
  mentionedUserIds: string[];
  replyToEventId?: string;
  replyToSenderId?: string;
  timestamp: number;
};

export const matchesMessageFilters = (
  doc: MessageSearchDocument,
  filters: import("./types").SearchFilters,
): boolean => {
  // from: filter — match sender ID or name (case-insensitive substring)
  if (filters.from.length > 0) {
    const matchesFrom = filters.from.some((token) =>
      userTokenMatches(token, doc.senderId, doc.senderName)
    );
    if (!matchesFrom) return false;
  }

  // mentions: filter — match if any mentionedUserIds or replyToSenderId matches
  if (filters.mentions.length > 0) {
    const matchesMentions = filters.mentions.some((token) => {
      // Check direct mentions
      const isMentioned = doc.mentionedUserIds.some((userId) =>
        userTokenMatches(token, userId, doc.senderName)
      );
      // Check reply-to (mentions: also matches replies-to-that-user)
      const isReplyTo =
        doc.replyToSenderId && userTokenMatches(token, doc.replyToSenderId, "");
      return isMentioned || isReplyTo;
    });
    if (!matchesMentions) return false;
  }

  // has: filter — match content kind or link presence
  if (filters.has.length > 0) {
    const matchesHas = filters.has.some((value) => {
      if (value === "link") {
        return doc.hasLink;
      }
      return doc.contentKind === value;
    });
    if (!matchesHas) return false;
  }

  // before: filter — timestamp strictly before that day start (UTC)
  if (filters.before) {
    const dayStart = Date.parse(filters.before + "T00:00:00.000Z");
    if (isNaN(dayStart) || doc.timestamp >= dayStart) return false;
  }

  // during: filter — timestamp within that day (UTC)
  if (filters.during) {
    const dayStart = Date.parse(filters.during + "T00:00:00.000Z");
    const dayEnd = dayStart + 86_400_000;
    if (isNaN(dayStart) || doc.timestamp < dayStart || doc.timestamp >= dayEnd)
      return false;
  }

  // after: filter — timestamp at or after that day's end (UTC)
  if (filters.after) {
    const dayStart = Date.parse(filters.after + "T00:00:00.000Z");
    const dayEnd = dayStart + 86_400_000;
    if (isNaN(dayStart) || doc.timestamp < dayEnd) return false;
  }

  return true;
};

const userTokenMatches = (
  token: string,
  userId: string,
  displayName: string
): boolean => {
  const normalizedToken = normalizeSearch(token);
  const normalizedId = normalizeSearch(userId);
  const normalizedName = normalizeSearch(displayName);

  // Exact match on normalized ID
  if (normalizedId === normalizedToken) return true;

  // Substring match on either ID or display name
  if (normalizedId.includes(normalizedToken)) return true;
  if (normalizedName.includes(normalizedToken)) return true;

  return false;
};
