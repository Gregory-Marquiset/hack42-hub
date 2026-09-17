import { useQuery } from "@tanstack/react-query";

import { fetchAPI } from "@/features/api/fetchApi";
import type { LocalChat } from "@/features/drivers/types";

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
  /** Her first name as shown to people: "Ariane". Empty until the fetch lands. */
  displayName: string;
  /** `/` commands, ready for the suggestion list. */
  commands: Suggestion[];
};

const NO_ASSISTANT: Assistant = {
  userId: "",
  names: [],
  displayName: "",
  commands: [],
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does this text address the assistant?
 *
 * The same rule as the bot's own: `@` followed by one of her names, at the
 * start of a word and as a whole word. Kept identical so the Hub never invites
 * her for a message she would then ignore, nor the reverse.
 */
export const mentionsAssistant = (text: string, names: string[]): boolean => {
  if (names.length === 0) {
    return false;
  }
  const alternatives = names.map(escapeRegExp).join("|");
  return new RegExp(`(?:^|[^\\w@])@(?:${alternatives})\\b`, "i").test(text);
};

/**
 * Whether a conversation is a one-to-one with the assistant. Her rooms carry
 * her face rather than an initial, in the list, the header and search alike.
 */
export const isAssistantConversation = (
  chat: Pick<LocalChat, "kind" | "participantIds">,
  assistant: Pick<Assistant, "userId">,
): boolean =>
  assistant.userId !== "" &&
  chat.kind === "direct" &&
  chat.participantIds.includes(assistant.userId);

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
    // One attempt per session: the catalogue only changes on deploy, and a
    // failure must not turn every avatar that mounts into a new request.
    retryOnMount: false,
    refetchOnReconnect: false,
  });

  if (!data) {
    return NO_ASSISTANT;
  }
  const names = data.names.map((name) => name.toLowerCase());
  const first = names[0] ?? "";
  return {
    userId: data.user_id,
    names,
    displayName: first.charAt(0).toUpperCase() + first.slice(1),
    commands: data.commands.map((entry) => ({
      id: entry.command,
      primary: `/${entry.command}`,
      secondary: entry.description,
    })),
  };
};
