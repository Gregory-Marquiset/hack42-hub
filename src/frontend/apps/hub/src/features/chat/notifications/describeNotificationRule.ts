import type { TFunction } from "i18next";

import type {
  NotificationRule,
  NotificationRuleAction,
  NotificationRuleKind,
  NotificationRules,
} from "@/features/drivers/types";

/**
 * Well-known Matrix default rule ids this file recognizes. Matrix ships both
 * a legacy and a modern id for some triggers (mentions, @room) — both are
 * treated as the same category below, so whichever one a given homeserver
 * version uses still renders a readable sentence instead of falling through
 * to the generic "Advanced" description.
 */
const RULE_ID = {
  master: ".m.rule.master",
  dm: ".m.rule.room_one_to_one",
  encryptedDm: ".m.rule.encrypted_room_one_to_one",
  message: ".m.rule.message",
  encryptedMessage: ".m.rule.encrypted",
  isUserMention: ".m.rule.is_user_mention",
  containsDisplayName: ".m.rule.contains_display_name",
  containsUserName: ".m.rule.contains_user_name",
  isRoomMention: ".m.rule.is_room_mention",
  atRoomNotification: ".m.rule.roomnotif",
  inviteForMe: ".m.rule.invite_for_me",
  reaction: ".m.rule.reaction",
  memberEvent: ".m.rule.member_event",
  tombstone: ".m.rule.tombstone",
} as const;

const RULE_KINDS: NotificationRuleKind[] = [
  "override",
  "content",
  "room",
  "sender",
  "underride",
];

/**
 * A rule notifies when it is enabled and asks to. Since Matrix 1.7 an empty
 * action list means "don't notify", `dont_notify` being its legacy spelling:
 * only an explicit `notify` does.
 */
const ruleNotifies = (rule: NotificationRule): boolean =>
  rule.isEnabled && rule.actions.includes("notify");

/**
 * The actions the Matrix spec gives each default rule, restored when its
 * category is switched back on: enabling a rule that is set to stay silent
 * would change nothing.
 */
const SOUND: NotificationRuleAction = { setTweak: "sound", value: "default" };
const HIGHLIGHT: NotificationRuleAction = { setTweak: "highlight" };
const NOTIFYING_ACTIONS: Record<string, NotificationRuleAction[]> = {
  [RULE_ID.dm]: ["notify", SOUND],
  [RULE_ID.encryptedDm]: ["notify", SOUND],
  [RULE_ID.isUserMention]: ["notify", SOUND, HIGHLIGHT],
  [RULE_ID.containsDisplayName]: ["notify", SOUND, HIGHLIGHT],
  [RULE_ID.containsUserName]: ["notify", SOUND, HIGHLIGHT],
  [RULE_ID.isRoomMention]: ["notify", HIGHLIGHT],
  [RULE_ID.atRoomNotification]: ["notify", HIGHLIGHT],
  [RULE_ID.inviteForMe]: ["notify", SOUND],
  [RULE_ID.tombstone]: ["notify", HIGHLIGHT],
};

type NotificationRuleDescription = {
  title: string;
  sentence: string;
};

/** Pure: one rule + `t` in, a readable title/sentence out. No React, no Matrix client. */
export const describeNotificationRule = (
  rule: NotificationRule,
  t: TFunction,
): NotificationRuleDescription => {
  switch (rule.id) {
    case RULE_ID.master:
      // Inverted logic: this rule being *enabled* means notifications are
      // paused — it's Matrix's kill switch, not an ordinary "notify" rule.
      return {
        title: t("Pause all notifications"),
        sentence: rule.isEnabled
          ? t("All notifications are paused.")
          : t("Notifications are on."),
      };
    case RULE_ID.dm:
    case RULE_ID.encryptedDm:
      return {
        title: t("Direct messages"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you when someone sends you a direct message.")
          : t("Direct messages don't notify you."),
      };
    case RULE_ID.message:
    case RULE_ID.encryptedMessage:
      return {
        title: t("Group messages"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you when a message is sent in a group conversation.")
          : t("Group messages don't notify you."),
      };
    case RULE_ID.isUserMention:
    case RULE_ID.containsDisplayName:
    case RULE_ID.containsUserName:
      return {
        title: t("Mentions"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you when someone mentions you.")
          : t("Mentions don't notify you."),
      };
    case RULE_ID.isRoomMention:
    case RULE_ID.atRoomNotification:
      return {
        title: t("Room mentions (@room)"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you when someone pings the whole room.")
          : t("Room-wide pings don't notify you."),
      };
    case RULE_ID.inviteForMe:
      return {
        title: t("Invitations"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you when you're invited to a conversation.")
          : t("Invitations don't notify you."),
      };
    case RULE_ID.reaction:
      return {
        title: t("Reactions"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you when someone reacts to your message.")
          : t("Reactions don't notify you."),
      };
    case RULE_ID.memberEvent:
    case RULE_ID.tombstone:
      return {
        title: t("Room updates"),
        sentence: ruleNotifies(rule)
          ? t("Notifies you about membership changes and room upgrades.")
          : t("Room updates don't notify you."),
      };
    default:
      if (rule.kind === "room" && rule.actions.includes("dont_notify")) {
        return {
          title: t("Muted conversation"),
          sentence: t("This conversation is muted."),
        };
      }
      return {
        title: rule.id,
        sentence: ruleNotifies(rule)
          ? t("Notifies you for this custom rule.")
          : t("This custom rule doesn't notify you."),
      };
  }
};

const findRule = (
  rules: NotificationRules,
  ruleId: string,
): NotificationRule | undefined => {
  for (const kind of RULE_KINDS) {
    const found = rules[kind].find((rule) => rule.id === ruleId);
    if (found) return found;
  }
  return undefined;
};

export type NotificationCategoryRow = {
  id: string;
  title: string;
  sentence: string;
  /** True when at least one of the category's underlying rules notifies —
   * toggling the row flips every rule listed in `rules` together. */
  isEnabled: boolean;
  rules: NotificationRule[];
};

/** One write to a push rule: its enabled flag, or its actions. */
export type NotificationRuleChange = {
  kind: NotificationRuleKind;
  ruleId: string;
} & ({ enabled: boolean } | { actions: NotificationRuleAction[] });

/**
 * What switching a category row writes. Off disables every rule of it. On
 * makes every rule notify: a disabled one is enabled, and one enabled but
 * set to stay silent gets its default actions back - enabling it alone would
 * leave the switch off.
 */
export const categoryRuleChanges = (
  row: NotificationCategoryRow,
  on: boolean,
): NotificationRuleChange[] =>
  row.rules.flatMap((rule): NotificationRuleChange[] => {
    const ref = { kind: rule.kind, ruleId: rule.id };
    if (!on) return rule.isEnabled ? [{ ...ref, enabled: false }] : [];
    const changes: NotificationRuleChange[] = [];
    if (!rule.actions.includes("notify")) {
      changes.push({
        ...ref,
        actions: NOTIFYING_ACTIONS[rule.id] ?? ["notify"],
      });
    }
    if (!rule.isEnabled) changes.push({ ...ref, enabled: true });
    return changes;
  });

const CATEGORY_RULE_IDS: { id: string; ruleIds: string[] }[] = [
  { id: "direct-messages", ruleIds: [RULE_ID.dm, RULE_ID.encryptedDm] },
  {
    id: "group-messages",
    ruleIds: [RULE_ID.message, RULE_ID.encryptedMessage],
  },
  {
    id: "mentions",
    ruleIds: [
      RULE_ID.isUserMention,
      RULE_ID.containsDisplayName,
      RULE_ID.containsUserName,
    ],
  },
  {
    id: "room-mentions",
    ruleIds: [RULE_ID.isRoomMention, RULE_ID.atRoomNotification],
  },
  { id: "invitations", ruleIds: [RULE_ID.inviteForMe] },
  { id: "reactions", ruleIds: [RULE_ID.reaction] },
  { id: "room-updates", ruleIds: [RULE_ID.memberEvent, RULE_ID.tombstone] },
];

const ALL_CATEGORY_RULE_IDS = new Set(
  CATEGORY_RULE_IDS.flatMap((category) => category.ruleIds),
);

/**
 * The curated category rows (Direct messages, Mentions, …) for the settings
 * panel's main list. A category is omitted when the account has none of its
 * underlying rules (server didn't ship that default) rather than showing a
 * row with nothing to toggle.
 */
export const groupNotificationRulesByCategory = (
  rules: NotificationRules,
  t: TFunction,
): NotificationCategoryRow[] =>
  CATEGORY_RULE_IDS.map(({ id, ruleIds }) => {
    const matched = ruleIds
      .map((ruleId) => findRule(rules, ruleId))
      .filter((rule): rule is NotificationRule => rule !== undefined);
    if (matched.length === 0) return null;
    // The sentence agrees with the switch: a notifying rule speaks for the
    // row when there is one.
    const { title, sentence } = describeNotificationRule(
      matched.find(ruleNotifies) ?? matched[0],
      t,
    );
    const row: NotificationCategoryRow = {
      id,
      title,
      sentence,
      isEnabled: matched.some(ruleNotifies),
      rules: matched,
    };
    return row;
  }).filter((row): row is NotificationCategoryRow => row !== null);

/** The global kill-switch rule, shown as its own prominent toggle. */
export const findMasterRule = (
  rules: NotificationRules,
): NotificationRule | undefined => findRule(rules, RULE_ID.master);

/**
 * Every rule that isn't the master switch, a curated category, or a
 * per-room mute — custom/third-party rules the "Advanced" section lists
 * with the generic fallback description.
 */
export const getAdvancedRules = (
  rules: NotificationRules,
): NotificationRule[] =>
  RULE_KINDS.flatMap((kind) => rules[kind]).filter(
    (rule) =>
      rule.id !== RULE_ID.master &&
      !ALL_CATEGORY_RULE_IDS.has(rule.id) &&
      rule.kind !== "room",
  );

/** Active per-room mutes — the "Muted conversations" section resolves each
 * `id` (a room id) to a chat name via the caller's own chat list cache. */
export const getMutedRoomRules = (
  rules: NotificationRules,
): NotificationRule[] =>
  rules.room.filter(
    (rule) => rule.isEnabled && rule.actions.includes("dont_notify"),
  );
