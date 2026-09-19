import type { Driver } from "./Driver";
import { useDriverEntries } from "./DriverRegistry";
import type { AccountId } from "./types";

/**
 * One account's driver, kept current with the registry; none without one.
 *
 * Kept out of `DriverRegistry.ts` on purpose: it reads the registry through
 * `useDriverEntries`, so the many tests that mock that one hook cover it too.
 */
export const useAccountDriver = (
  accountId: AccountId | null | undefined,
): Driver | undefined => {
  const entries = useDriverEntries();
  return accountId
    ? entries.find((entry) => entry.accountId === accountId)?.driver
    : undefined;
};
