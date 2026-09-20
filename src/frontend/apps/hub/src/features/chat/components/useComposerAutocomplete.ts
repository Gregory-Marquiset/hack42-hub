import { useCallback, useMemo, useState } from "react";

import type { ChatMember } from "@/features/drivers/types";

import { type Assistant, mentionsAssistant } from "../hooks/useAssistant";

/**
 * One row of the suggestion list, whatever triggered it.
 *
 * `@` and `/` suggest different things — people and commands — but the list
 * behaves identically for both, so they share one shape and one code path.
 */
export type Suggestion = {
  /** Stable key, and what `@`/`/` matching falls back to. */
  id: string;
  /** Bold part of the row, and the text inserted after the trigger. */
  primary: string;
  /** Muted part of the row: a Matrix id, or what a command does. */
  secondary: string;
};

type Trigger = "@" | "/";

/** The token being typed, per trigger. Anchored to a word start. */
const TOKEN_RE: Record<Trigger, RegExp> = {
  "@": /(?:^|\s)@([^\s@]*)$/,
  // A command is a bare word, so `/` rejects anything with a slash inside it —
  // otherwise pasting a URL would open the command list mid-path.
  "/": /(?:^|\s)\/([^\s/]*)$/,
};

/** How many rows to show. More than a handful is a scroll, not a help. */
const MAX_SUGGESTIONS = 6;

export type AutocompleteState = {
  suggestions: Suggestion[];
  activeIndex: number;
  move: (delta: number) => void;
  update: (value: string, caret: number) => void;
  dismiss: () => void;
  apply: (
    suggestion: Suggestion,
    value: string,
    caret: number,
  ) => { value: string; caret: number } | null;
  /** Open the command list without waiting for a `/` keystroke. */
  openCommands: () => void;
  /** Is this suggestion the assistant herself? */
  isAssistant: (id: string) => boolean;
  /**
   * The `@` token being typed, without its `@`, or `null` when the caret is
   * not in one. Lets the composer say why a name it cannot offer is missing,
   * which an empty list cannot.
   */
  mentionQuery: string | null;
};

const asSuggestions = (members: ChatMember[]): Suggestion[] =>
  members.map((member) => ({
    id: member.id,
    primary: member.name,
    secondary: member.secondaryText || member.id,
  }));

/**
 * `@` mentions and `/` commands in the composer.
 *
 * Headless on purpose: it decides what to show and what the draft becomes, and
 * touches no DOM. The composer owns the textarea and the markup.
 */
export const useComposerAutocomplete = (
  members: ChatMember[],
  assistant: Assistant,
): AutocompleteState => {
  // `synthetic` marks a list opened by the composer rather than by a keystroke:
  // there is no `/` in the draft yet, so the chosen command is inserted at the
  // caret instead of replacing a token that does not exist.
  const [token, setToken] = useState<{
    trigger: Trigger;
    query: string;
    synthetic: boolean;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!token) {
      return [];
    }
    const pool =
      token.trigger === "@" ? asSuggestions(members) : assistant.commands;
    const needle = token.query.toLowerCase();
    return pool
      .filter(
        (item) =>
          item.primary.toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [assistant.commands, members, token]);

  const update = useCallback(
    (value: string, caret: number) => {
      const before = value.slice(0, caret);
      // The two regexes are mutually exclusive: a caret cannot sit inside an
      // `@` token and a `/` token at the same time.
      for (const trigger of ["@", "/"] as Trigger[]) {
        const found = TOKEN_RE[trigger].exec(before);
        if (!found) {
          continue;
        }
        // A command is a modifier, not a trigger: `/juriste` on its own does
        // nothing, because the bot only ever answers when pinged. So `/` only
        // suggests once the draft addresses her by the bot's own rule, which
        // teaches the right order - `@` then `/` - instead of offering a
        // command that would be dropped in silence ("Mariane /" does not).
        if (trigger === "/" && !mentionsAssistant(before, assistant.names)) {
          break;
        }
        setToken({ trigger, query: found[1], synthetic: false });
        setActiveIndex(0);
        return;
      }
      setToken(null);
      setActiveIndex(0);
    },
    [assistant.names],
  );

  /** Open the command list, as if `/` had just been typed. */
  const openCommands = useCallback(() => {
    setToken({ trigger: "/", query: "", synthetic: true });
    setActiveIndex(0);
  }, []);

  const dismiss = useCallback(() => setToken(null), []);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        if (suggestions.length === 0) {
          return 0;
        }
        // Start from the row actually highlighted, which the list shrinking
        // may have moved, then wrap instead of clamp: a list of six is faster
        // to reach backwards.
        const from = Math.min(current, suggestions.length - 1);
        return (from + delta + suggestions.length) % suggestions.length;
      });
    },
    [suggestions.length],
  );

  const apply = useCallback(
    (suggestion: Suggestion, value: string, caret: number) => {
      if (!token) {
        return null;
      }
      const before = value.slice(0, caret);
      const found = TOKEN_RE[token.trigger].exec(before);
      if (!found && !token.synthetic) {
        return null;
      }
      // A synthetic list has no token to replace, so the command lands exactly
      // where the caret is. Otherwise the match may start with the whitespace
      // that anchored it; keep it.
      const start = found
        ? found.index + (found[0].length - found[1].length - 1)
        : caret;
      // A command inserts its own name (`/juriste`), a mention the display name.
      const body = token.trigger === "/" ? suggestion.id : suggestion.primary;
      // The trailing space is what lets you keep typing without reopening the
      // list on the very word that was just inserted.
      const inserted = `${token.trigger}${body} `;
      return {
        value: value.slice(0, start) + inserted + value.slice(caret),
        caret: start + inserted.length,
      };
    },
    [token],
  );

  return {
    suggestions,
    // The list can shrink under the highlight without a keystroke (the
    // members change): the highlight never points past its last row.
    activeIndex: Math.min(activeIndex, Math.max(0, suggestions.length - 1)),
    move,
    update,
    dismiss,
    apply,
    openCommands,
    isAssistant: (id: string) => id === assistant.userId,
    mentionQuery: token?.trigger === "@" ? token.query : null,
  };
};
