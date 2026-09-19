import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { Chat, ChatMember, ChatRef } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";

import { mentionsAssistant, useAssistant } from "./useAssistant";
import { useChatMembers } from "./useChatMembers";

const NO_REF: ChatRef = { accountId: "", chatId: "" };

export type AssistantMention = {
  /**
   * The assistant as an `@` suggestion when she is not in the room yet, or
   * `null` when she already is, cannot be (encrypted room) or is unknown.
   */
  candidate: ChatMember | null;
  /** Everyone `@` can suggest in this room: its members, and `candidate`. */
  mentionCandidates: ChatMember[];
  /**
   * Invites the assistant if `content` addresses her and she is not in the
   * room. Resolves at once otherwise, and never rejects: the message is what
   * the person asked for, the invitation is a convenience on top. Call it
   * before sending, so her invitation precedes the message that mentions her.
   */
  ensureInvited: (content: string) => Promise<void>;
  /**
   * Why she cannot be here, ready to show, or `null` when the question does
   * not arise. An empty suggestion list cannot tell a rule from a bug: someone
   * typing her name in an encrypted room deserves the reason.
   */
  unavailableReason: string | null;
};

/**
 * Mentioning the assistant is how she gets into a room.
 *
 * She only ever enters on invitation, and the person who addresses her is the
 * one inviting her: `@Ariane` in a room she has not joined sends the invitation
 * first, she accepts at once, and the message that follows is the first thing
 * she reads. Never in an encrypted room, where she could not read anything,
 * and never in a private message between two people: a clear one predates
 * encryption, and is still a conversation between two people.
 */
export const useAssistantMention = (
  chatRef: ChatRef | null,
  chat: Pick<Chat, "encrypted" | "kind"> | null,
): AssistantMention => {
  const { t } = useTranslation();
  const assistant = useAssistant();
  const queryClient = useQueryClient();
  const { present, pendingInvites, isLoaded } = useChatMembers(
    chatRef ?? NO_REF,
    Boolean(chatRef),
  );

  const isMember = useMemo(
    () =>
      assistant.userId !== "" &&
      [...present, ...pendingInvites].some(
        (member) => member.id === assistant.userId,
      ),
    [assistant.userId, pendingInvites, present],
  );
  // Until the member list has actually loaded, "she is not here" is a guess,
  // and the row would promise an invitation to someone already in the room.
  const canReach =
    chatRef !== null &&
    assistant.userId !== "" &&
    isLoaded &&
    chat?.kind === "group" &&
    !chat.encrypted;

  const candidate = useMemo<ChatMember | null>(
    () =>
      canReach && !isMember
        ? {
            id: assistant.userId,
            name: assistant.displayName,
            secondaryText: t("Assistant · invited when mentioned"),
          }
        : null,
    [assistant.displayName, assistant.userId, canReach, isMember, t],
  );

  const ensureInvited = useCallback(
    async (content: string) => {
      if (
        !chatRef ||
        !canReach ||
        isMember ||
        !mentionsAssistant(content, assistant.names)
      ) {
        return;
      }
      try {
        await getRegistry()
          .get(chatRef.accountId)
          .inviteToChat(chatRef.chatId, assistant.userId);
      } catch {
        // Losing the invitation must not lose the message. The homeserver
        // refuses for reasons the sender can do nothing about here - no right
        // to invite, a rate limit, or she joined in the meantime - so say it
        // once and let the message through.
        notify.error(
          t("{{name}} could not be invited. Your message was sent anyway.", {
            name: assistant.displayName,
          }),
        );
        return;
      }
      // The member list feeds the suggestions: refresh it so she stops being
      // offered as "invited when mentioned" once she is in.
      await queryClient.invalidateQueries({
        queryKey: chatKeys.members(chatRef),
      });
    },
    [
      assistant.displayName,
      assistant.names,
      assistant.userId,
      canReach,
      chatRef,
      isMember,
      queryClient,
      t,
    ],
  );

  // Only where her absence is surprising: a group room she would otherwise be
  // in. A conversation between two people is not a room she was ever offered.
  const unavailableReason =
    chat?.kind === "group" && chat.encrypted
      ? t("{{name}} cannot read an encrypted room", {
          name: assistant.displayName,
        })
      : null;

  // Who `@` can suggest: the members, already cached by react-query and
  // shared with the members modal, and the assistant when she can be invited.
  const mentionCandidates = useMemo(
    () => (candidate ? [...present, candidate] : present),
    [candidate, present],
  );

  return { candidate, mentionCandidates, ensureInvited, unavailableReason };
};
