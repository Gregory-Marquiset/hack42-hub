import { useEffect, useMemo, useState } from "react";

import { useDriverEntries } from "@/features/drivers/DriverRegistry";
import type { Chat } from "@/features/drivers/types";

import { decorateChat } from "../chatRefs";
import { compareChats } from "../chatSorting";

import { normalizeSearch } from "./model";
import { parseSearchQuery } from "./queryParser";
import { hasActiveFilters, type MessageSearchResult } from "./types";

type Result = { chat: Chat; subtitle: string; accountLabel: string };
type MessageResult = MessageSearchResult & { chat: Chat; accountLabel: string };
const PAGE_SIZE = 40;

export const useConversationSearch = () => {
  const entries = useDriverEntries();
  const [query, setQuery] = useState("");

  // --- Chats (unchanged) ---------------------------------------------------
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [revision, setRevision] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // --- Messages (new) -------------------------------------------------------
  const [messageLimit, setMessageLimit] = useState(PAGE_SIZE);
  const [messageResults, setMessageResults] = useState<MessageResult[]>([]);
  const [messageTotal, setMessageTotal] = useState(0);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageFailed, setMessageFailed] = useState(false);

  const parsed = useMemo(() => parseSearchQuery(query), [query]);
  const hasQuery =
    !!normalizeSearch(parsed.freeText) || hasActiveFilters(parsed.filters);

  const accounts = entries.filter(
    ({ driver }) => driver.supportsConversationSearch,
  );
  const statuses = accounts.map(({ driver }) =>
    driver.getConversationSearchStatus(),
  );
  const partial = statuses.some(
    (status) =>
      status.freshness !== "current" ||
      status.hasUnknownRooms ||
      status.ready < status.eligible,
  );

  const messageAccounts = entries.filter(
    ({ driver }) => driver.supportsMessageSearch,
  );
  const messageStatuses = messageAccounts.map(({ driver }) =>
    driver.getMessageSearchStatus(),
  );
  const messagePartial = messageStatuses.some(
    (status) => status.freshness !== "current" || status.roomsPending > 0,
  );

  useEffect(() => {
    const unsubscribes = entries.map(({ driver }) =>
      driver.subscribeToEvents((event) => {
        if (event.type === "search:changed") setRevision((value) => value + 1);
      }),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [entries]);

  // --- Chat search effect (query is now the parsed free text) --------------
  useEffect(() => {
    const controller = new AbortController();
    if (!normalizeSearch(parsed.freeText)) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    setFailed(false);
    void Promise.allSettled(
      entries
        .filter(({ driver }) => driver.supportsConversationSearch)
        .map(async (entry) => {
          const page = await entry.driver.searchConversations({
            query: parsed.freeText,
            limit,
            signal: controller.signal,
          });
          return {
            total: page.total,
            results: page.results.map(({ chat, subtitle }) => ({
              chat: decorateChat(entry.accountId, chat),
              subtitle,
              accountLabel: entry.label,
            })),
          };
        }),
    )
      .then((settled) => {
        if (controller.signal.aborted) return;
        const pages = settled.flatMap((page) =>
          page.status === "fulfilled" ? [page.value] : [],
        );
        setFailed(settled.some((page) => page.status === "rejected"));
        setResults(
          pages
            .flatMap((page) => page.results)
            .sort((a, b) => compareChats(a.chat, b.chat))
            .slice(0, limit),
        );
        setTotal(pages.reduce((sum, page) => sum + page.total, 0));
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [entries, parsed.freeText, limit, revision]);

  // --- Message search effect (new: free text + structured filters) -------
  useEffect(() => {
    const controller = new AbortController();
    if (!hasQuery) {
      setMessageResults([]);
      setMessageTotal(0);
      setMessageLoading(false);
      return () => controller.abort();
    }
    setMessageLoading(true);
    setMessageFailed(false);
    void Promise.allSettled(
      entries
        .filter(({ driver }) => driver.supportsMessageSearch)
        .map(async (entry) => {
          const page = await entry.driver.searchMessages({
            freeText: parsed.freeText,
            filters: parsed.filters,
            limit: messageLimit,
            signal: controller.signal,
          });
          return {
            total: page.total,
            results: page.results.map((result) => ({
              ...result,
              chat: decorateChat(entry.accountId, result.chat),
              accountLabel: entry.label,
            })),
          };
        }),
    )
      .then((settled) => {
        if (controller.signal.aborted) return;
        const pages = settled.flatMap((page) =>
          page.status === "fulfilled" ? [page.value] : [],
        );
        setMessageFailed(settled.some((page) => page.status === "rejected"));
        setMessageResults(
          pages
            .flatMap((page) => page.results)
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            )
            .slice(0, messageLimit),
        );
        setMessageTotal(pages.reduce((sum, page) => sum + page.total, 0));
        setMessageLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMessageFailed(true);
        setMessageLoading(false);
      });
    return () => controller.abort();
  }, [
    entries,
    parsed.freeText,
    parsed.filters,
    hasQuery,
    messageLimit,
    revision,
  ]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setLimit(PAGE_SIZE);
    setMessageLimit(PAGE_SIZE);
    setResults([]);
    setTotal(0);
    setMessageResults([]);
    setMessageTotal(0);
  };

  const loadMore = () => setLimit((value) => value + PAGE_SIZE);
  const loadMoreMessages = () => setMessageLimit((value) => value + PAGE_SIZE);

  return {
    query,
    changeQuery,
    loadMore,
    hasQuery,
    accounts,
    statuses,
    partial,
    results,
    total,
    loading,
    failed,

    messageAccounts,
    messageStatuses,
    messagePartial,
    messageResults,
    messageTotal,
    messageLoading,
    messageFailed,
    loadMoreMessages,
  };
};
