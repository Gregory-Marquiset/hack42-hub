import type { CreateChatOptions } from "../types";

export type RoomCreationPlan = {
  isDirect: boolean;
  wantsEncryption: boolean;
  /** Who the room invites: the participants, and the assistant if due. */
  invite: string[];
};

/**
 * Three shapes of room, three rules.
 *
 * A one-to-one between humans is always encrypted: there is no choice to
 * make, and offering one would only produce private conversations that are
 * not private.
 *
 * A one-to-one with the assistant is never encrypted. She cannot read an
 * encrypted room, and there is no human on the other side whose privacy the
 * encryption would protect - it would only make her deaf.
 *
 * A group follows the toggle, and the assistant is invited into it unless it
 * is encrypted: she is meant to be in every room she can actually read, and
 * an invitation into one she cannot would be a lie in the member list.
 *
 * Pure, and the only place these rules live: the key that coalesces
 * concurrent creations and the creation itself both read it.
 */
export const planRoomCreation = (
  participantIds: string[],
  options?: Pick<CreateChatOptions, "encrypted" | "assistantUserId">,
): RoomCreationPlan => {
  const assistant = options?.assistantUserId;
  const isDirect = participantIds.length === 1;
  const isAssistantOnly = isDirect && participantIds[0] === assistant;
  const wantsEncryption = isAssistantOnly
    ? false
    : isDirect || Boolean(options?.encrypted);
  const invite =
    !isDirect &&
    assistant &&
    !wantsEncryption &&
    !participantIds.includes(assistant)
      ? [...participantIds, assistant]
      : participantIds;
  return { isDirect, wantsEncryption, invite };
};
