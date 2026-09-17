import { Modal, ModalSize, Switch } from "@gouvfr-lasuite/ui-components";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { chatKeys } from "@/features/chat/chatKeys";
import { useChats } from "@/features/chat/hooks/useChats";
import {
  useNotificationRules,
  useSetNotificationRuleEnabled,
} from "@/features/chat/hooks/useNotificationRules";
import { getRegistry } from "@/features/drivers/DriverRegistry";
import type { AccountId } from "@/features/drivers/types";
import { notify } from "@/features/ui/components/toast";

import {
  describeNotificationRule,
  findMasterRule,
  getAdvancedRules,
  getMutedRoomRules,
  groupNotificationRulesByCategory,
} from "./describeNotificationRule";

type NotificationSettingsModalProps = {
  accountId: AccountId;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * The transparent notification settings panel: who gets notified, where,
 * and under what conditions, backed by the account's real Matrix push
 * rules (see `Driver.getNotificationRules`).
 */
export const NotificationSettingsModal = ({
  accountId,
  isOpen,
  onClose,
}: NotificationSettingsModalProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { rules, isInitialLoading, isError } = useNotificationRules(
    accountId,
    isOpen,
  );
  const { setEnabled } = useSetNotificationRuleEnabled(accountId);
  const { all, favourites } = useChats();
  const chatNames = useMemo(() => {
    const map = new Map<string, string>();
    [...favourites, ...all].forEach((chat) => map.set(chat.id, chat.name));
    return map;
  }, [all, favourites]);

  const masterRule = useMemo(() => findMasterRule(rules), [rules]);
  const categories = useMemo(
    () => groupNotificationRulesByCategory(rules, t),
    [rules, t],
  );
  const mutedRooms = useMemo(() => getMutedRoomRules(rules), [rules]);
  const advancedRules = useMemo(() => getAdvancedRules(rules), [rules]);

  const { mutate: unmute } = useMutation({
    mutationFn: (roomId: string) =>
      getRegistry().get(accountId).setChatMuted(roomId, false),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.notificationRules(accountId),
      });
      void queryClient.invalidateQueries({
        queryKey: chatKeys.chatMutedOf(accountId),
      });
    },
    onError: () => {
      notify.error(t("This setting could not be changed. Please try again."));
    },
    meta: { noGlobalError: true },
  });

  return (
    <Modal
      isOpen={isOpen}
      size={ModalSize.MEDIUM}
      title={t("Notification settings")}
      aria-label={t("Notification settings")}
      onClose={onClose}
      closeOnClickOutside
    >
      <div className="hub__notification-settings">
        {isInitialLoading && (
          <p role="status" className="hub__notification-settings__state">
            {t("Loading notification rules…")}
          </p>
        )}
        {isError && (
          <p role="alert" className="hub__notification-settings__state">
            {t("Notification rules could not be loaded.")}
          </p>
        )}
        {!isInitialLoading && !isError && (
          <>
            {masterRule && (
              <div className="hub__notification-settings__master">
                <Switch
                  label={describeNotificationRule(masterRule, t).title}
                  checked={masterRule.isEnabled}
                  onChange={(event) =>
                    setEnabled(
                      masterRule.kind,
                      masterRule.id,
                      event.target.checked,
                    )
                  }
                />
                <p className="hub__notification-settings__sentence">
                  {describeNotificationRule(masterRule, t).sentence}
                </p>
              </div>
            )}

            <ul className="hub__notification-settings__list">
              {categories.map((row) => (
                <li key={row.id} className="hub__notification-settings__row">
                  <Switch
                    label={row.title}
                    checked={row.isEnabled}
                    onChange={(event) =>
                      row.rules.forEach(({ kind, ruleId }) =>
                        setEnabled(kind, ruleId, event.target.checked),
                      )
                    }
                  />
                  <p className="hub__notification-settings__sentence">
                    {row.sentence}
                  </p>
                </li>
              ))}
            </ul>

            {mutedRooms.length > 0 && (
              <div className="hub__notification-settings__section">
                <h3 className="hub__notification-settings__section__title">
                  {t("Muted conversations")}
                </h3>
                <ul className="hub__notification-settings__muted-list">
                  {mutedRooms.map((rule) => (
                    <li
                      key={rule.id}
                      className="hub__notification-settings__muted-row"
                    >
                      <span>{chatNames.get(rule.id) ?? rule.id}</span>
                      <button
                        type="button"
                        className="hub__notification-settings__unmute"
                        onClick={() => unmute(rule.id)}
                      >
                        {t("Unmute")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {advancedRules.length > 0 && (
              <details className="hub__notification-settings__advanced">
                <summary>{t("Advanced")}</summary>
                <ul className="hub__notification-settings__list">
                  {advancedRules.map((rule) => {
                    const description = describeNotificationRule(rule, t);
                    return (
                      <li
                        key={rule.id}
                        className="hub__notification-settings__row"
                      >
                        <Switch
                          label={description.title}
                          checked={rule.isEnabled}
                          onChange={(event) =>
                            setEnabled(rule.kind, rule.id, event.target.checked)
                          }
                        />
                        <p className="hub__notification-settings__sentence">
                          {description.sentence}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
