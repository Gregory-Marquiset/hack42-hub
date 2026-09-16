import { useQuery } from "@tanstack/react-query";

import { fetchAPI } from "@/features/api/fetchApi";

import type { Suggestion } from "../components/useComposerAutocomplete";

type AssistantPayload = {
  user_id: string;
  names: string[];
  commands: { command: string; label: string; description: string }[];
};

export type Assistant = {
  /** Matrix id of the assistant, used to spot her in the member list. */
  userId: string;
  /** Names the assistant answers to, lowercase. Empty until the fetch lands. */
  names: string[];
  /** `/` commands, ready for the suggestion list. */
  commands: Suggestion[];
};

const NO_ASSISTANT: Assistant = { userId: "", names: [], commands: [] };

/**
 * The assistant's identity and commands, straight from the backend.
 *
 * Fetched rather than hardcoded so the composer can never offer a command the
 * bot has stopped understanding, nor look for a name she no longer answers to.
 * Cached for the session: the catalogue only changes on deploy.
 */
export const useAssistant = (): Assistant => {
  const { data } = useQuery({
    queryKey: ["bots", "assistant"],
    queryFn: async (): Promise<AssistantPayload> => {
      const response = await fetchAPI("bots/assistant/");
      if (!response.ok) {
        throw new Error("could not load the assistant");
      }
      return response.json();
    },
    staleTime: Infinity,
    // A missing assistant must not raise a global error toast: the composer
    // simply offers nothing, and everything else keeps working.
    meta: { noGlobalError: true },
    retry: false,
  });

  if (!data) {
    return NO_ASSISTANT;
  }
  return {
    userId: data.user_id,
    names: data.names.map((name) => name.toLowerCase()),
    commands: data.commands.map((entry) => ({
      id: entry.command,
      primary: `/${entry.command}`,
      secondary: entry.description,
    })),
  };
};
