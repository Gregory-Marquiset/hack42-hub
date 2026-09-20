import {
  type IPushRule,
  type PushRuleAction as MatrixPushRuleAction,
  type PushRuleSet,
  PushRuleActionName,
  PushRuleKind,
  TweakName,
} from "matrix-js-sdk/lib/matrix";

import type {
  NotificationRule,
  NotificationRuleAction,
  NotificationRuleKind,
  NotificationRules,
} from "../types";

const RULE_KIND_TO_MATRIX: Record<NotificationRuleKind, PushRuleKind> = {
  override: PushRuleKind.Override,
  content: PushRuleKind.ContentSpecific,
  room: PushRuleKind.RoomSpecific,
  sender: PushRuleKind.SenderSpecific,
  underride: PushRuleKind.Underride,
};

export const toPushRuleKind = (kind: NotificationRuleKind): PushRuleKind =>
  RULE_KIND_TO_MATRIX[kind];

const toNotificationRuleAction = (
  action: MatrixPushRuleAction,
): NotificationRuleAction => {
  if (typeof action === "string") return action;
  if (action.set_tweak === TweakName.Sound) {
    return { setTweak: "sound", value: action.value };
  }
  return { setTweak: "highlight", value: action.value };
};

export const toPushRuleActions = (
  actions: NotificationRuleAction[],
): MatrixPushRuleAction[] =>
  actions.map((action): MatrixPushRuleAction => {
    if (typeof action === "string") return action as PushRuleActionName;
    if (action.setTweak === "sound") {
      return { set_tweak: TweakName.Sound, value: action.value };
    }
    return { set_tweak: TweakName.Highlight, value: action.value };
  });

const toNotificationRule = (
  rule: IPushRule,
  kind: NotificationRuleKind,
): NotificationRule => ({
  id: rule.rule_id,
  kind,
  isEnabled: rule.enabled,
  isDefault: rule.default,
  actions: rule.actions.map(toNotificationRuleAction),
  conditions: rule.conditions?.map((condition) => ({
    kind: condition.kind,
    key: condition.key,
    pattern: condition.pattern,
    is: condition.is,
  })),
  pattern: rule.pattern,
});

/** Maps a rule kind's array, defaulting a missing key to empty — the server
 * omits a kind entirely when the account has no rules of that kind. */
const toRuleList = (
  global: PushRuleSet,
  kind: NotificationRuleKind,
): NotificationRule[] =>
  (global[toPushRuleKind(kind)] ?? []).map((rule) =>
    toNotificationRule(rule, kind),
  );

export const toNotificationRules = (
  global: PushRuleSet,
): NotificationRules => ({
  override: toRuleList(global, "override"),
  content: toRuleList(global, "content"),
  room: toRuleList(global, "room"),
  sender: toRuleList(global, "sender"),
  underride: toRuleList(global, "underride"),
});

/** Whether a room-kind rule's actions amount to "never notify" — matches
 * the shape `MatrixClient.setRoomMutePushRule` creates/looks for. */
export const ruleActionsAreDontNotify = (
  actions: MatrixPushRuleAction[],
): boolean => actions.includes(PushRuleActionName.DontNotify);
