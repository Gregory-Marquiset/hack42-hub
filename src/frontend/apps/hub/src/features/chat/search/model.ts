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

/**
 * Where `needle` (already passed through `normalizeSearch`) occurs in `text`,
 * as offsets into `text` itself. Case is folded one code point at a time so
 * every offset of the folded copy maps back to its source character: the
 * whole-string `normalizeSearch` trims and may change the length, so its
 * offsets do not point into the text shown to the user.
 */
export const findMatchRange = (
  text: string,
  needle: string,
): [number, number] | undefined => {
  if (!needle) return undefined;
  let folded = "";
  const sources: number[] = [];
  let offset = 0;
  for (const char of text) {
    const lower = char.toLowerCase();
    folded += lower;
    for (let i = 0; i < lower.length; i++) sources.push(offset);
    offset += char.length;
  }
  const start = folded.indexOf(needle);
  if (start === -1) return undefined;
  const end = start + needle.length;
  return [sources[start], end < sources.length ? sources[end] : text.length];
};

const EXCERPT_MAX_LENGTH = 150;
const EXCERPT_CONTEXT = 50;
const ELLIPSIS = "…";

/**
 * Cuts the part of `text` shown for a search result around `range`, and
 * returns the range rebased onto that excerpt (shifted by the cut and by the
 * leading ellipsis), ready to be highlighted as is.
 */
export const buildExcerpt = (
  text: string,
  range?: [number, number],
): { excerpt: string; matchRanges: [number, number][] } => {
  if (!range) {
    return {
      excerpt:
        text.length > EXCERPT_MAX_LENGTH
          ? text.slice(0, EXCERPT_MAX_LENGTH) + ELLIPSIS
          : text,
      matchRanges: [],
    };
  }
  const [start, end] = range;
  const from = Math.max(0, start - EXCERPT_CONTEXT);
  const to = Math.min(text.length, end + EXCERPT_CONTEXT);
  const prefix = from > 0 ? ELLIPSIS : "";
  const suffix = to < text.length ? ELLIPSIS : "";
  const shift = prefix.length - from;
  return {
    excerpt: prefix + text.slice(from, to) + suffix,
    matchRanges: [[start + shift, end + shift]],
  };
};

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
  /** Root message's event id, when this message is itself a thread reply
   * (absent for the root and for main-timeline messages outside a thread) —
   * a reply isn't part of the main timeline, so jumping to it means landing
   * on the root there first and opening the thread panel on it. */
  threadRootId?: string;
};

export const matchesMessageFilters = (
  doc: MessageSearchDocument,
  filters: import("./types").SearchFilters,
): boolean => {
  // from: filter — match sender ID or name (case-insensitive substring)
  if (filters.from.length > 0) {
    const matchesFrom = filters.from.some((token) =>
      userTokenMatches(token, doc.senderId, doc.senderName),
    );
    if (!matchesFrom) return false;
  }

  // mentions: filter — match if any mentionedUserIds or replyToSenderId matches
  if (filters.mentions.length > 0) {
    const matchesMentions = filters.mentions.some((token) => {
      // Check direct mentions
      const isMentioned = doc.mentionedUserIds.some((userId) =>
        userTokenMatches(token, userId, doc.senderName),
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
  displayName: string,
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
