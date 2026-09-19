import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useDriverEntries } from "@/features/drivers/DriverRegistry";
import type { AccountId, ChatRef } from "@/features/drivers/types";

import { chatHref } from "../chatRefs";
import { notificationRulesQuery } from "../hooks/useNotificationRules";

import { getMutedRoomRules } from "./describeNotificationRule";
import { NotificationSound } from "./NotificationSound";
import { NotificationPermission } from "./notificationPermission";

type NotificationSession = {
  sound: NotificationSound;
  permission: NotificationPermission;
  notifications: Map<Notification, ChatRef>;
  disposed: boolean;
};

const preview = (content: string): string => {
  const characters = Array.from(content.replace(/\s+/gu, " ").trim());
  return characters.length > 160
    ? `${characters.slice(0, 159).join("")}…`
    : characters.join("");
};

/** Play incoming activity; show a browser notification only without focus. */
export const useChatNotifications = (
  userId?: string,
  isInCall = false,
): void => {
  const entries = useDriverEntries();
  const queryClient = useQueryClient();
  const hasAccounts = entries.length > 0;
  const router = useRouter();
  const { t } = useTranslation();
  // Read through a ref so the subscription is not rebuilt each time one of
  // these changes - the sound decision is made when an event arrives.
  const latest = useRef({ router, t, isInCall });
  useEffect(() => {
    latest.current = { router, t, isInCall };
  }, [router, t, isInCall]);

  const session = useRef<NotificationSession | null>(null);
  // Per-account set of muted room ids, refreshed from `getNotificationRules`
  // on mount and on `notification-rules:changed`. Empty (the default) for
  // any driver that doesn't support notification rules at all — leaving
  // this hook's behavior byte-for-byte unchanged for those accounts.
  const mutedByAccount = useRef<Map<AccountId, Set<string>>>(new Map());
  useEffect(() => {
    if (!userId || !hasAccounts) return;
    const current: NotificationSession = {
      sound: new NotificationSound(),
      permission: new NotificationPermission(),
      notifications: new Map(),
      disposed: false,
    };
    session.current = current;
    return () => {
      current.disposed = true;
      current.sound.dispose();
      current.permission.dispose();
      current.notifications.forEach((_ref, notification) =>
        notification.close(),
      );
      current.notifications.clear();
      session.current = null;
    };
  }, [userId, hasAccounts]);

  useEffect(() => {
    const current = session.current;
    if (!userId || !current) return;
    const accounts = new Set(entries.map(({ accountId }) => accountId));
    current.notifications.forEach((ref, notification) => {
      if (!accounts.has(ref.accountId)) {
        notification.close();
        current.notifications.delete(notification);
      }
    });

    let active = true;
    // Through the query cache the settings panel reads too: one request for
    // both, and the cache always holds the latest answer even when an older
    // request settles last.
    const refreshMuted = (
      accountId: AccountId,
      driver: (typeof entries)[number]["driver"],
      fresh: boolean,
    ) => {
      const options = notificationRulesQuery(accountId, driver);
      const fetching = fresh
        ? queryClient.fetchQuery({ ...options, staleTime: 0 })
        : queryClient.ensureQueryData(options);
      void fetching
        .then(() => {
          const rules = queryClient.getQueryData(options.queryKey);
          if (!active || !rules) return;
          mutedByAccount.current.set(
            accountId,
            new Set(getMutedRoomRules(rules).map((rule) => rule.id)),
          );
        })
        // Not connected yet, or unreadable: the next change tries again.
        .catch(() => {});
    };
    entries.forEach(({ accountId, driver }) => {
      if (driver.supportsNotificationRules)
        refreshMuted(accountId, driver, false);
    });
    const unsubscribes = entries.map(({ accountId, driver }) =>
      driver.subscribeToEvents((event) => {
        if (!active || current.disposed) return;

        if (event.type === "notification-rules:changed") {
          refreshMuted(accountId, driver, true);
          return;
        }

        if (
          event.type !== "message:received" &&
          event.type !== "invitation:received"
        )
          return;

        if (mutedByAccount.current.get(accountId)?.has(event.chatId)) return;

        // Capture focus before a permission prompt can change it.
        const focused =
          document.visibilityState === "visible" && document.hasFocus();
        // Two reasons to stay quiet: busy was chosen, or a call is running -
        // a sound over a conversation is the one place it helps least. Both
        // read from the chosen state rather than the effective one: going
        // idle for five minutes publishes `unavailable` too, and that is not
        // a request for quiet. The banner still appears either way.
        if (
          !latest.current.isInCall &&
          driver.getSelfPresencePreference() !== "busy"
        ) {
          current.sound.play();
        }
        try {
          if (
            !focused &&
            window.isSecureContext &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const { t } = latest.current;
            let body: string;
            if (event.type === "message:received") {
              body = preview(event.content);
            } else if (event.inviterName) {
              body = t("{{name}} invites you to join this conversation.", {
                name: event.inviterName,
              });
            } else {
              body = t("You have been invited to join this conversation.");
            }

            const ref: ChatRef = { accountId, chatId: event.chatId };
            const notification = new Notification(event.chatName, {
              body,
              icon: "/assets/favicon.png",
              silent: true,
            });
            current.notifications.set(notification, ref);
            notification.onclose = () =>
              current.notifications.delete(notification);
            notification.onclick = () => {
              if (
                !current.disposed &&
                current.notifications.has(notification)
              ) {
                window.focus();
                void latest.current.router.push(chatHref(ref)).catch(() => {});
              }
              notification.close();
              current.notifications.delete(notification);
            };
          }
        } catch {
          // Native notification failures must not interrupt incoming activity.
        }
        current.permission.request();
      }),
    );
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [entries, queryClient, userId]);
};
