import type {
  AccountId,
  ChatSelfPresencePreference,
  ChatUserPresenceState,
} from "./types";

const STORAGE_PREFIX = "chatSelfPresencePreference";

const storageKey = (accountId: AccountId): string =>
  `${STORAGE_PREFIX}:${accountId}`;

/**
 * Account-scoped, non-sensitive preference needed before Matrix `/sync`.
 * Storage can be missing or refuse access (private mode, blocked site data):
 * the preference then falls back to automatic online mode.
 */
export const readChatSelfPresencePreference = (
  accountId: AccountId,
): ChatSelfPresencePreference => {
  try {
    const stored = localStorage.getItem(storageKey(accountId));
    return stored === "offline" || stored === "busy" ? stored : "online";
  } catch {
    return "online";
  }
};

/** Best effort: an unwritable storage only loses the choice at reload. */
export const writeChatSelfPresencePreference = (
  accountId: AccountId,
  preference: ChatSelfPresencePreference,
): void => {
  try {
    localStorage.setItem(storageKey(accountId), preference);
  } catch {
    // Kept for this page only.
  }
};

/**
 * The presence others see for a preference. Matrix knows nothing of "busy":
 * it is published as the closest standard value, and kept as itself only in
 * the local preference, which is what decides whether sounds play.
 */
export const publishedPresence = (
  preference: ChatSelfPresencePreference,
): ChatUserPresenceState =>
  preference === "busy" ? "unavailable" : preference;
