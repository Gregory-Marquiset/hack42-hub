import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { ChatDocument, ChatRef } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

const EMPTY_DOCUMENTS: ChatDocument[] = [];

export const useChatDocuments = (ref: ChatRef, enabled: boolean) => {
  const query = useQuery({
    queryKey: chatKeys.documents(ref),
    queryFn: () =>
      getRegistry().get(ref.accountId).getChatDocuments(ref.chatId),
    enabled,
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    documents: query.data ?? EMPTY_DOCUMENTS,
    isInitialLoading: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
    refetch,
  };
};
