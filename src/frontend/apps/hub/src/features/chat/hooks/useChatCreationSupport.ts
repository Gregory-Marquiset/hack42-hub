import { useAccountDriver } from "@/features/drivers/useAccountDriver";
import type { AccountId } from "@/features/drivers/types";

/**
 * Whether the given account's driver can start a brand-new conversation from a
 * participant set (see `Driver.supportsConversationCreation`). Drives whether the
 * New Chat composer is usable for a not-yet-existing conversation. Keyed by
 * account id (not a `ChatRef`) since a draft conversation has no id yet.
 */
export const useChatCreationSupport = (accountId: AccountId | null): boolean =>
  useAccountDriver(accountId)?.supportsConversationCreation ?? false;
