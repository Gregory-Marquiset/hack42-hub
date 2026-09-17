import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import type {
  NotificationRule,
  NotificationRules,
} from "@/features/drivers/types";

import {
  describeNotificationRule,
  findMasterRule,
  getAdvancedRules,
  getMutedRoomRules,
  groupNotificationRulesByCategory,
} from "../describeNotificationRule";

// Identity stub: returns the English source string itself, same convention
// this app's translations.json uses for keys — no i18next instance needed.
const t = ((key: string) => key) as TFunction;

const emptyRules = (): NotificationRules => ({
  override: [],
  content: [],
  room: [],
  sender: [],
  underride: [],
});

const rule = (overrides: Partial<NotificationRule>): NotificationRule => ({
  id: ".m.rule.message",
  kind: "underride",
  isEnabled: true,
  isDefault: true,
  actions: ["notify"],
  ...overrides,
});

describe("describeNotificationRule", () => {
  it("phrases the master rule with inverted logic when enabled", () => {
    const description = describeNotificationRule(
      rule({ id: ".m.rule.master", kind: "override", isEnabled: true }),
      t,
    );
    expect(description.title).toBe("Pause all notifications");
    expect(description.sentence).toBe("All notifications are paused.");
    expect(description.isWellKnown).toBe(true);
  });

  it("phrases the master rule as notifications-on when disabled", () => {
    const description = describeNotificationRule(
      rule({ id: ".m.rule.master", kind: "override", isEnabled: false }),
      t,
    );
    expect(description.sentence).toBe("Notifications are on.");
  });

  it("describes a well-known notifying rule", () => {
    const description = describeNotificationRule(
      rule({ id: ".m.rule.room_one_to_one", actions: ["notify"] }),
      t,
    );
    expect(description.title).toBe("Direct messages");
    expect(description.sentence).toBe(
      "Notifies you when someone sends you a direct message.",
    );
    expect(description.isWellKnown).toBe(true);
  });

  it("describes a well-known rule that doesn't notify", () => {
    const description = describeNotificationRule(
      rule({ id: ".m.rule.room_one_to_one", actions: ["dont_notify"] }),
      t,
    );
    expect(description.sentence).toBe("Direct messages don't notify you.");
  });

  it("recognizes both the legacy and modern mention rule ids", () => {
    expect(
      describeNotificationRule(
        rule({ id: ".m.rule.is_user_mention", kind: "override" }),
        t,
      ).title,
    ).toBe("Mentions");
    expect(
      describeNotificationRule(
        rule({ id: ".m.rule.contains_display_name", kind: "override" }),
        t,
      ).title,
    ).toBe("Mentions");
  });

  it("falls back to a muted-conversation description for a room-mute rule", () => {
    const description = describeNotificationRule(
      rule({
        id: "!room:example.com",
        kind: "room",
        isDefault: false,
        actions: ["dont_notify"],
      }),
      t,
    );
    expect(description.title).toBe("Muted conversation");
    expect(description.isWellKnown).toBe(false);
  });

  it("falls back to a generic description for an unrecognized custom rule", () => {
    const description = describeNotificationRule(
      rule({
        id: "custom.rule.example",
        kind: "content",
        isDefault: false,
        pattern: "urgent",
        actions: ["notify"],
      }),
      t,
    );
    expect(description.title).toBe("custom.rule.example");
    expect(description.sentence).toBe("Notifies you for this custom rule.");
    expect(description.isWellKnown).toBe(false);
  });
});

describe("groupNotificationRulesByCategory", () => {
  it("merges the plaintext and encrypted variants into one row", () => {
    const rules = emptyRules();
    rules.underride = [
      rule({ id: ".m.rule.message", actions: ["notify"] }),
      rule({ id: ".m.rule.encrypted", actions: ["dont_notify"] }),
    ];
    const [row] = groupNotificationRulesByCategory(rules, t);
    expect(row.id).toBe("group-messages");
    expect(row.rules).toHaveLength(2);
    // At least one of the pair notifies, so the merged row reads as enabled.
    expect(row.isEnabled).toBe(true);
  });

  it("omits a category the account has none of the underlying rules for", () => {
    const rules = emptyRules();
    rules.underride = [rule({ id: ".m.rule.message" })];
    const rows = groupNotificationRulesByCategory(rules, t);
    expect(rows.map((row) => row.id)).toEqual(["group-messages"]);
  });
});

describe("findMasterRule / getAdvancedRules / getMutedRoomRules", () => {
  it("finds the master rule regardless of kind", () => {
    const rules = emptyRules();
    rules.override = [rule({ id: ".m.rule.master", kind: "override" })];
    expect(findMasterRule(rules)?.id).toBe(".m.rule.master");
  });

  it("excludes the master rule, categorized rules, and room mutes from advanced", () => {
    const rules = emptyRules();
    rules.override = [
      rule({ id: ".m.rule.master", kind: "override" }),
      rule({ id: ".m.rule.invite_for_me", kind: "override" }),
    ];
    rules.content = [
      rule({ id: "custom.rule.example", kind: "content", isDefault: false }),
    ];
    rules.room = [
      rule({
        id: "!room:example.com",
        kind: "room",
        isDefault: false,
        actions: ["dont_notify"],
      }),
    ];
    const advanced = getAdvancedRules(rules);
    expect(advanced.map((r) => r.id)).toEqual(["custom.rule.example"]);
  });

  it("only returns enabled dont_notify room rules as muted", () => {
    const rules = emptyRules();
    rules.room = [
      rule({
        id: "!muted:example.com",
        kind: "room",
        isDefault: false,
        isEnabled: true,
        actions: ["dont_notify"],
      }),
      rule({
        id: "!not-muted:example.com",
        kind: "room",
        isDefault: false,
        isEnabled: false,
        actions: ["dont_notify"],
      }),
    ];
    expect(getMutedRoomRules(rules).map((r) => r.id)).toEqual([
      "!muted:example.com",
    ]);
  });
});
