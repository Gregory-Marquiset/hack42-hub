import { useAccountDriver } from "@/features/drivers/useAccountDriver";
import type { AccountId, ChatRef } from "@/features/drivers/types";

export const useAccountChatCompositionSupport = (
  accountId: AccountId | null,
): boolean => useAccountDriver(accountId)?.supportsComposition ?? false;

export const useChatCompositionSupport = (ref: ChatRef | null): boolean =>
  useAccountChatCompositionSupport(ref?.accountId ?? null);
