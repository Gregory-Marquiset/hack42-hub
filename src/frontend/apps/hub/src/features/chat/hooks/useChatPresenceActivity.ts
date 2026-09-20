import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { chatKeys } from "@/features/chat/chatKeys";
import { useDriverEntries } from "@/features/drivers/DriverRegistry";
import type { Driver } from "@/features/drivers/Driver";
import type {
  AccountId,
  ChatSelfPresencePreference,
  ChatUserPresenceState,
} from "@/features/drivers/types";

import { selfPresencePreferenceQuery } from "./useChatSelfPresencePreference";

export const CHAT_PRESENCE_IDLE_MS = 5 * 60 * 1000;

type ActivitySession = {
  accountId: AccountId;
  userId: string;
  driver: Driver;
  preference: ChatSelfPresencePreference;
  effectiveState: ChatUserPresenceState | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * One app-wide activity controller. It owns one timer per connected account,
 * never per observed user, and publishes only effective state transitions.
 *
 * `isInCall` is passed in rather than read from the meeting context, so this
 * stays a plain hook: being in a call holds the state without touching the
 * stored preference, which means leaving the call needs nothing undone and a
 * browser closed mid-call cannot strand anyone.
 */
export const useChatPresenceActivity = (isInCall = false): void => {
  const queryClient = useQueryClient();
  const driverEntries = useDriverEntries();
  const connectionSignature = driverEntries
    .map(
      ({ accountId, driver }) =>
        `${accountId}:${driver.getCurrentUserId() ?? ""}`,
    )
    .join("\u0000");
  const entries = useMemo(
    () =>
      driverEntries.filter(
        ({ driver }) =>
          driver.supportsPresence && driver.getCurrentUserId() !== null,
      ),
    [connectionSignature, driverEntries],
  );
  const preferences = useQueries({
    queries: entries.map(({ accountId, driver }) =>
      selfPresencePreferenceQuery(accountId, driver),
    ),
    combine: (results) => results.map(({ data }) => data ?? null),
  });

  useEffect(() => {
    const sessions = entries.flatMap((entry, index): ActivitySession[] => {
      const preference = preferences[index];
      return preference
        ? [
            {
              accountId: entry.accountId,
              userId: entry.driver.getCurrentUserId()!,
              driver: entry.driver,
              preference,
              effectiveState: null,
              idleTimer: null,
            },
          ]
        : [];
    });

    const publish = (
      session: ActivitySession,
      state: ChatUserPresenceState,
    ) => {
      if (session.effectiveState === state) return;
      session.effectiveState = state;
      void session.driver
        .setUserPresence(state)
        .then(() => {
          queryClient.setQueryData(
            chatKeys.userPresence(session.accountId, session.userId),
            { userId: session.userId, state },
          );
        })
        .catch((error) => {
          session.effectiveState = null;
          console.error(
            `Presence activity update failed for ${session.accountId}`,
            error,
          );
        });
    };
    const clearIdleTimer = (session: ActivitySession) => {
      if (session.idleTimer === null) return;
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    };
    const activate = (session: ActivitySession) => {
      // Neither "offline" nor "busy" is something activity should undo: both
      // were chosen, and typing a message is not a request to become
      // available again. A call is the same: typing in the Hub during one
      // does not mean you are free.
      if (session.preference !== "online" || isInCall) return;
      publish(session, "online");
      clearIdleTimer(session);
      session.idleTimer = setTimeout(() => {
        session.idleTimer = null;
        publish(session, "unavailable");
      }, CHAT_PRESENCE_IDLE_MS);
    };
    const onActivity = () => sessions.forEach(activate);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onActivity();
    };

    sessions.forEach((session) => {
      if (session.preference === "offline") publish(session, "offline");
      // Busy is published as the closest standard value; the idle timer stays
      // out of it, so it does not decay into anything else. Being in a call
      // looks the same from outside, without being a choice.
      else if (session.preference === "busy" || isInCall)
        publish(session, "unavailable");
      else activate(session);
    });
    document.addEventListener("pointerdown", onActivity);
    document.addEventListener("keydown", onActivity);
    window.addEventListener("focus", onActivity);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("pointerdown", onActivity);
      document.removeEventListener("keydown", onActivity);
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sessions.forEach(clearIdleTimer);
    };
  }, [entries, isInCall, preferences, queryClient]);
};
