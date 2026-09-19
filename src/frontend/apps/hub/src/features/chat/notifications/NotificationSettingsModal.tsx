import { Modal, ModalSize, Switch } from "@gouvfr-lasuite/ui-components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useChatMute } from "@/features/chat/hooks/useChatMute";
import { useChats } from "@/features/chat/hooks/useChats";
import {
  useNotificationRules,
  useSetNotificationRuleActions,
  useSetNotificationRuleEnabled,
} from "@/features/chat/hooks/useNotificationRules";
import type { AccountId } from "@/features/drivers/types";

import {
  categoryRuleChanges,
  describeNotificationRule,
  findMasterRule,
  getAdvancedRules,
  getMutedRoomRules,
  groupNotificationRulesByCategory,
} from "./describeNotificationRule";

/**
 * One muted conversation, unmuted through the same hook as its header menu.
 * The list follows on its own: the driver announces the rules change, which
 * refreshes the rules this panel reads.
 */
const MutedConversationRow = ({
  accountId,
  chatId,
  name,
}: {
  accountId: AccountId;
  chatId: string;
  name: string;
}) => {
  const { t } = useTranslation();
  const ref = useMemo(() => ({ accountId, chatId }), [accountId, chatId]);
  const { setMuted, isPending } = useChatMute(ref, false);
  return (
    <li className="hub__notification-settings__muted-row">
      <span>{name}</span>
      <button
        type="button"
        className="hub__notification-settings__unmute"
        disabled={isPending}
        onClick={() => setMuted(false)}
      >
        {t("Unmute")}
      </button>
    </li>
  );
};

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
  const { rules, isInitialLoading, isError } = useNotificationRules(
    accountId,
    isOpen,
  );
  const { setEnabled } = useSetNotificationRuleEnabled(accountId);
  const { setActions } = useSetNotificationRuleActions(accountId);
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
                      categoryRuleChanges(row, event.target.checked).forEach(
                        (change) =>
                          "actions" in change
                            ? setActions(
                                change.kind,
                                change.ruleId,
                                change.actions,
                              )
                            : setEnabled(
                                change.kind,
                                change.ruleId,
                                change.enabled,
                              ),
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
                    <MutedConversationRow
                      key={rule.id}
                      accountId={accountId}
                      chatId={rule.id}
                      name={chatNames.get(rule.id) ?? rule.id}
                    />
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
