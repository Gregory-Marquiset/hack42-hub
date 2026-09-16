import { useQueries, type UseQueryResult } from "@tanstack/react-query";

import { decorateSpace } from "@/features/chat/chatRefs";
import {
  useDriverEntries,
  type DriverEntry,
} from "@/features/drivers/DriverRegistry";
import type { LocalSpace, Space } from "@/features/drivers/types";

import { chatKeys } from "../chatKeys";

export type SpacesResult = {
  spaces: Space[];
  isLoading: boolean;
  isError: boolean;
};

const compareSpaces = (a: Space, b: Space) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const combineSpaces = (
  entries: DriverEntry[],
  results: UseQueryResult<Space[], Error>[],
): SpacesResult => ({
  spaces: results
    .flatMap((result) => result.data ?? [])
    .sort(compareSpaces),
  isLoading: results.some((result) => result.isPending),
  isError: results.some((result) => result.isError),
});

/** Espaces (Matrix Spaces) the current user belongs to, across every account. */
export const useSpaces = (): SpacesResult => {
  const entries = useDriverEntries();

  return useQueries({
    queries: entries.map((entry) => ({
      queryKey: chatKeys.spacesOf(entry.accountId),
      queryFn: async () => {
        const localSpaces: LocalSpace[] = await entry.driver.getSpaces();
        return localSpaces.map((space) => decorateSpace(entry.accountId, space));
      },
      staleTime: Infinity,
      meta: { noGlobalError: true },
      enabled: entry.driver.supportsSpaces,
    })),
    combine: (results) =>
      combineSpaces(entries, results as UseQueryResult<Space[], Error>[]),
  });
};
