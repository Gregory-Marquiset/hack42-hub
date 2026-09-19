import { useAccountDriver } from "@/features/drivers/useAccountDriver";
import type { ChatRef } from "@/features/drivers/types";

/** Thread writing is an independent capability from top-level composition. */
export const useChatThreadCompositionSupport = (ref: ChatRef | null): boolean =>
  useAccountDriver(ref?.accountId)?.supportsThreadComposition ?? false;
