import type { LocalChat } from "@/features/drivers/types";

export type SearchFreshness = "awaiting-sync" | "current" | "stale";
export type SearchPreparation =
  | "awaiting-sync"
  | "unknown-count"
  | "pending"
  | "loading"
  | "complete"
  | "error";

export type ConversationSearchStatus = {
  freshness: SearchFreshness;
  storageAvailable: boolean;
  ready: number;
  eligible: number;
  hasNameOnlyRooms: boolean;
  hasUnknownRooms: boolean;
  hasDeferredRooms: boolean;
  hasFailures: boolean;
};

export const EMPTY_SEARCH_STATUS: ConversationSearchStatus = {
  freshness: "awaiting-sync",
  storageAvailable: true,
  ready: 0,
  eligible: 0,
  hasNameOnlyRooms: false,
  hasUnknownRooms: false,
  hasDeferredRooms: false,
  hasFailures: false,
};

export type ConversationSearchResult = {
  chat: LocalChat;
  subtitle: string;
};

export type ConversationSearchRequest = {
  query: string;
  /** Local display window, never a limit on the searchable universe. */
  limit?: number;
  signal?: AbortSignal;
};

export type ConversationSearchPage = {
  results: ConversationSearchResult[];
  total: number;
};

export type SearchHasValue = "image" | "video" | "link";

export type SearchFilters = {
  from: string[];
  mentions: string[];
  has: SearchHasValue[];
  before?: string;
  during?: string;
  after?: string;
};

export const emptySearchFilters = (): SearchFilters => ({
  from: [],
  mentions: [],
  has: [],
});

export const hasActiveFilters = (f: SearchFilters): boolean =>
  f.from.length > 0 ||
  f.mentions.length > 0 ||
  f.has.length > 0 ||
  !!f.before ||
  !!f.during ||
  !!f.after;

export type MessageSearchRequest = {
  freeText: string;
  filters: SearchFilters;
  limit?: number;
  signal?: AbortSignal;
};

export type MessageSearchResult = {
  chat: LocalChat;
  eventId: string;
  senderId: string;
  senderName: string;
  excerpt: string;
  matchRanges: [number, number][];
  timestamp: string;
  /** Set when this result is a thread reply — see `MessageSearchDocument`. */
  threadRootId?: string;
};

export type MessageSearchPage = {
  results: MessageSearchResult[];
  total: number;
};

export type MessageBackfillStatus =
  | "pending"
  | "backfilling"
  | "done"
  | "error";

export type MessageBackfillState = {
  roomId: string;
  status: MessageBackfillStatus;
  messageCount: number;
  oldestTimestamp?: number;
};

export type RoomBackfillInfo = {
  roomId: string;
  roomName: string;
  status: MessageBackfillStatus;
};

export type MessageSearchStatus = {
  freshness: SearchFreshness;
  storageAvailable: boolean;
  roomsEligible: number;
  roomsBackfilled: number;
  roomsPending: number;
  hasFailures: boolean;
  pendingRooms: RoomBackfillInfo[];
};

export const EMPTY_MESSAGE_SEARCH_STATUS: MessageSearchStatus = {
  freshness: "awaiting-sync",
  storageAvailable: true,
  roomsEligible: 0,
  roomsBackfilled: 0,
  roomsPending: 0,
  hasFailures: false,
  pendingRooms: [],
};
