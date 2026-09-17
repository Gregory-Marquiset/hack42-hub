import type { AccountId, ChatSelfPresencePreference } from "./types";

const STORAGE_PREFIX = "chatSelfPresencePreference";

const storageKey = (accountId: AccountId): string =>
  `${STORAGE_PREFIX}:${accountId}`;

/** Account-scoped, non-sensitive preference needed before Matrix `/sync`. */
export const readChatSelfPresencePreference = (
  accountId: AccountId,
): ChatSelfPresencePreference => {
  if (typeof localStorage === "undefined") return "online";
  const stored = localStorage.getItem(storageKey(accountId));
  return stored === "offline" || stored === "busy" ? stored : "online";
};

export const writeChatSelfPresencePreference = (
  accountId: AccountId,
  preference: ChatSelfPresencePreference,
): void => {
  localStorage.setItem(storageKey(accountId), preference);
};
