import { useQuery } from "@tanstack/react-query";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { ChatRef } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

const NO_CAPABILITIES = {
  canRead: false,
  canAdd: false,
  canManageAdders: false,
};

export const useChatDocumentCapabilities = (ref: ChatRef, enabled: boolean) => {
  const query = useQuery({
    queryKey: chatKeys.documentCapabilities(ref),
    queryFn: () =>
      getRegistry().get(ref.accountId).getChatDocumentCapabilities(ref.chatId),
    enabled,
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });

  return query.data ?? NO_CAPABILITIES;
};
