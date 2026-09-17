import type { ParsedUrlQuery } from "querystring";

import type {
  AccountId,
  Chat,
  ChatRef,
  ChatSections,
  LocalChat,
  LocalChatSections,
  LocalSpace,
  Space,
} from "@/features/drivers/types";

export const decorateChat = (accountId: AccountId, chat: LocalChat): Chat => ({
  ...chat,
  accountId,
  ref: { accountId, chatId: chat.id },
});

export const decorateChatSections = (
  accountId: AccountId,
  sections: LocalChatSections,
): ChatSections => ({
  favourites: sections.favourites.map((chat) => decorateChat(accountId, chat)),
  all: sections.all.map((chat) => decorateChat(accountId, chat)),
});

export const decorateSpace = (
  accountId: AccountId,
  space: LocalSpace,
): Space => ({
  ...space,
  accountId,
});

export const sameChatRef = (
  a: ChatRef | null | undefined,
  b: ChatRef | null | undefined,
): boolean =>
  Boolean(a && b && a.accountId === b.accountId && a.chatId === b.chatId);

/**
 * Builds the `/chat` href for `ref`, carrying over the currently-open espace
 * (if any) so following a chat link from inside a space keeps that space
 * active. Pass `spaceId: null` to explicitly clear it.
 */
export const chatHref = (ref: ChatRef, spaceId?: string | null) => ({
  pathname: "/chat",
  query: {
    account: ref.accountId,
    chat: ref.chatId,
    ...(ref.eventId ? { event: ref.eventId } : {}),
    ...(ref.threadEventId ? { thread: ref.threadEventId } : {}),
    ...(spaceId ? { space: spaceId } : {}),
  },
});

export const readChatRef = (query: ParsedUrlQuery): ChatRef | null => {
  if (typeof query.account !== "string" || typeof query.chat !== "string") {
    return null;
  }
  return {
    accountId: query.account,
    chatId: query.chat,
    ...(typeof query.event === "string" ? { eventId: query.event } : {}),
    ...(typeof query.thread === "string"
      ? { threadEventId: query.thread }
      : {}),
  };
};

/** Currently-open espace id, read from the same `/chat` query as `readChatRef`. */
export const readSpaceId = (query: ParsedUrlQuery): string | null =>
  typeof query.space === "string" ? query.space : null;

/**
 * Href that switches to `spaceId` (or clears it) without disrupting whatever
 * chat is open. Carries over `chatRef` (the currently-open chat, if any) so
 * `ChatRoute` still sees a known chat and doesn't redirect. With no open
 * chat, targets `/chat/new` instead of `/chat` — `ChatRoute` only redirects
 * a chat-less `/chat`, never `/chat/new`, so this is the one combination
 * that keeps `?space=` from being dropped by that redirect.
 */
export const spaceHref = (
  spaceId: string | null,
  chatRef?: ChatRef | null,
) => ({
  pathname: chatRef ? "/chat" : "/chat/new",
  query: {
    ...(chatRef ? { account: chatRef.accountId, chat: chatRef.chatId } : {}),
    ...(spaceId ? { space: spaceId } : {}),
  },
});
