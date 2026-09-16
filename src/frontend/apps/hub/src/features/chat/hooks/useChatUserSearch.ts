import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getRegistry } from "@/features/drivers/DriverRegistry";
// A driver-implementation import in a driver-neutral hook, knowingly: the
// assistant is a Matrix account by construction, and this mapper is what makes
// her look identical to everyone else in search, chips and bubbles.
import { matrixDirectoryUserToChatUser } from "@/features/drivers/implementations/matrixIdentity";
import type { ChatUser } from "@/features/drivers/types";

import { useAssistant } from "./useAssistant";
import { useComposerAccountId } from "./useChatAccounts";

export type UseChatUserSearchResult = {
  users: ChatUser[];
  isInitialLoading: boolean;
  isError: boolean;
};

export const normalizeChatUserQuery = (query: string) => query.trim();

export const useChatUserSearch = (
  query: string,
  excludeIds: string[],
): UseChatUserSearchResult => {
  const accountId = useComposerAccountId();
  const normalizedQuery = normalizeChatUserQuery(query);
  const excludedKey = useMemo(() => [...excludeIds].sort(), [excludeIds]);

  const search = useQuery({
    queryKey: ["chat-user-search", accountId, normalizedQuery, excludedKey],
    queryFn: () => {
      if (!accountId) {
        return [];
      }
      return getRegistry().get(accountId).getChatUsers({
        q: normalizedQuery,
        excludeIds: excludedKey,
      });
    },
    enabled: normalizedQuery.length > 0 && accountId !== null,
    staleTime: 30_000,
    meta: { noGlobalError: true },
  });

  // The assistant is an Application Service account, and Synapse keeps those
  // out of the user directory with no option to change it. Without this she
  // cannot be found, and a conversation with her cannot be started. She is
  // offered on the same terms as anyone: only when the query matches her name.
  const assistant = useAssistant();
  const users = useMemo(() => {
    const found = search.data ?? [];
    const needle = normalizedQuery.toLowerCase();
    if (
      !assistant.userId ||
      needle.length === 0 ||
      excludedKey.includes(assistant.userId) ||
      !assistant.names.some((name) => name.includes(needle))
    ) {
      return found;
    }
    const displayName = assistant.names[0];
    return [
      matrixDirectoryUserToChatUser({
        user_id: assistant.userId,
        display_name:
          displayName.charAt(0).toUpperCase() + displayName.slice(1),
      }),
      ...found.filter((user) => user.id !== assistant.userId),
    ];
  }, [
    assistant.names,
    assistant.userId,
    excludedKey,
    normalizedQuery,
    search.data,
  ]);

  return {
    users,
    isInitialLoading: search.isPending && normalizedQuery.length > 0,
    isError: search.isError,
  };
};
