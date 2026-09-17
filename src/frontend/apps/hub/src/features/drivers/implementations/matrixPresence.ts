import type { User as MatrixUser } from "matrix-js-sdk/lib/matrix";

import type { ChatUserPresence, ChatUserPresenceState } from "../types";

const MATRIX_PRESENCE_STATES = new Set<ChatUserPresenceState>([
  "online",
  "unavailable",
  "offline",
]);

/** Maps only standard Matrix presence values; product labels live elsewhere. */
export const matrixUserToChatUserPresence = (
  user: Pick<MatrixUser, "userId" | "events"> | null,
): ChatUserPresence | null => {
  const state = user?.events.presence?.getContent().presence;
  if (!user || !MATRIX_PRESENCE_STATES.has(state as ChatUserPresenceState)) {
    return null;
  }

  return {
    userId: user.userId,
    state: state as ChatUserPresenceState,
  };
};

/**
 * Maps the homeserver's own answer to `GET /presence/{userId}/status`.
 *
 * `/sync` only carries presence that changed since the last token, so someone
 * who has been offline for a while is simply absent from the local store. The
 * server still knows, and asking it is the only way to tell "offline" from
 * "not known".
 */
export const matrixPresenceResponseToChatUserPresence = (
  userId: string,
  response: { presence?: string } | null,
): ChatUserPresence | null => {
  const state = response?.presence;
  if (!MATRIX_PRESENCE_STATES.has(state as ChatUserPresenceState)) {
    return null;
  }
  return { userId, state: state as ChatUserPresenceState };
};
