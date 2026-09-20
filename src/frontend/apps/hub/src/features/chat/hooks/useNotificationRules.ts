import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import type { Driver } from "@/features/drivers/Driver";
import { getRegistry } from "@/features/drivers/DriverRegistry";
import type {
  AccountId,
  NotificationRuleAction,
  NotificationRuleKind,
  NotificationRules,
} from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import { chatKeys } from "../chatKeys";

const EMPTY_RULES: NotificationRules = {
  override: [],
  content: [],
  room: [],
  sender: [],
  underride: [],
};

export type UseNotificationRulesResult = {
  rules: NotificationRules;
  isInitialLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/**
 * The one query for an account's notification rules, shared by the settings
 * panel and the notification hook so both read the same cache.
 */
export const notificationRulesQuery = (
  accountId: AccountId,
  driver?: Pick<Driver, "getNotificationRules">,
) =>
  queryOptions({
    queryKey: chatKeys.notificationRules(accountId),
    queryFn: () =>
      (driver ?? getRegistry().get(accountId)).getNotificationRules(),
    staleTime: Infinity,
    meta: { noGlobalError: true },
  });

/** Every notification rule for one account (see `Driver.getNotificationRules`). */
export const useNotificationRules = (
  accountId: AccountId,
  enabled: boolean,
): UseNotificationRulesResult => {
  const query = useQuery({ ...notificationRulesQuery(accountId), enabled });

  return {
    rules: query.data ?? EMPTY_RULES,
    isInitialLoading: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
};

export type UseSetNotificationRuleEnabledResult = {
  setEnabled: (
    kind: NotificationRuleKind,
    ruleId: string,
    enabled: boolean,
  ) => void;
  isPending: boolean;
};

/**
 * Toggles one rule, or several at once when a settings-panel row merges a
 * plaintext/encrypted pair (see `groupNotificationRulesByCategory`) — the
 * caller fires one `setEnabled` per underlying rule, so an optimistic patch
 * here only needs to flip that single rule's `isEnabled` in the cache.
 */
export const useSetNotificationRuleEnabled = (
  accountId: AccountId,
): UseSetNotificationRuleEnabledResult => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { mutate, isPending } = useMutation({
    mutationFn: ({
      kind,
      ruleId,
      enabled,
    }: {
      kind: NotificationRuleKind;
      ruleId: string;
      enabled: boolean;
    }) =>
      getRegistry()
        .get(accountId)
        .setNotificationRuleEnabled({ kind, ruleId, enabled }),
    onMutate: async ({ kind, ruleId, enabled }) => {
      const queryKey = chatKeys.notificationRules(accountId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationRules>(queryKey);
      queryClient.setQueryData<NotificationRules>(queryKey, (rules) =>
        rules
          ? {
              ...rules,
              [kind]: rules[kind].map((rule) =>
                rule.id === ruleId ? { ...rule, isEnabled: enabled } : rule,
              ),
            }
          : rules,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          chatKeys.notificationRules(accountId),
          context.previous,
        );
      }
      notify.error(t("This setting could not be changed. Please try again."));
    },
    meta: { noGlobalError: true },
  });

  const setEnabled = useCallback(
    (kind: NotificationRuleKind, ruleId: string, enabled: boolean) =>
      mutate({ kind, ruleId, enabled }),
    [mutate],
  );

  return { setEnabled, isPending };
};

export type UseSetNotificationRuleActionsResult = {
  setActions: (
    kind: NotificationRuleKind,
    ruleId: string,
    actions: NotificationRuleAction[],
  ) => void;
  isPending: boolean;
};

export const useSetNotificationRuleActions = (
  accountId: AccountId,
): UseSetNotificationRuleActionsResult => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { mutate, isPending } = useMutation({
    mutationFn: ({
      kind,
      ruleId,
      actions,
    }: {
      kind: NotificationRuleKind;
      ruleId: string;
      actions: NotificationRuleAction[];
    }) =>
      getRegistry()
        .get(accountId)
        .setNotificationRuleActions({ kind, ruleId, actions }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.notificationRules(accountId),
      });
    },
    onError: () => {
      notify.error(t("This setting could not be changed. Please try again."));
    },
    meta: { noGlobalError: true },
  });

  const setActions = useCallback(
    (
      kind: NotificationRuleKind,
      ruleId: string,
      actions: NotificationRuleAction[],
    ) => mutate({ kind, ruleId, actions }),
    [mutate],
  );

  return { setActions, isPending };
};
