import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { Chat, ChatMember, ChatRef } from "@/features/drivers/types";

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
  /**
   * Invites the assistant if `content` addresses her and she is not in the
   * room. Resolves at once otherwise. Call it before sending, so her
   * invitation precedes the message that mentions her and she reads it.
   */
  ensureInvited: (content: string) => Promise<void>;
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
  const { present, pendingInvites } = useChatMembers(
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
  const canReach =
    chatRef !== null &&
    assistant.userId !== "" &&
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
      await getRegistry()
        .get(chatRef.accountId)
        .inviteToChat(chatRef.chatId, assistant.userId);
      // The member list feeds the suggestions: refresh it so she stops being
      // offered as "invited when mentioned" once she is in.
      await queryClient.invalidateQueries({
        queryKey: chatKeys.members(chatRef),
      });
    },
    [
      assistant.names,
      assistant.userId,
      canReach,
      chatRef,
      isMember,
      queryClient,
    ],
  );

  return { candidate, ensureInvited };
};
