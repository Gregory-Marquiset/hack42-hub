import { describe, expect, it } from "vitest";

import type { ChatUnread } from "@/features/drivers/types";

import {
  UNREAD_BADGE_CAP,
  countUnread,
  formatUnreadBadge,
} from "../unreadBadge";

const unread = (over: Partial<ChatUnread> = {}): ChatUnread => ({
  unread: true,
  highlight: false,
  count: 1,
  ...over,
});

describe("formatUnreadBadge", () => {
  it("shows the figure up to the cap, and stops counting past it", () => {
    expect(formatUnreadBadge(1)).toBe("1");
    expect(formatUnreadBadge(UNREAD_BADGE_CAP)).toBe("99");
    expect(formatUnreadBadge(UNREAD_BADGE_CAP + 1)).toBe("99+");
    expect(formatUnreadBadge(4321)).toBe("99+");
  });
});

describe("countUnread", () => {
  it("counts what is waiting", () => {
    expect(countUnread(unread({ count: 7 }))).toBe(7);
  });

  it("counts an unread conversation the backend cannot number as one", () => {
    // Otherwise the badge vanishes on a conversation that does have unread
    // messages - "something" is the truth available.
    expect(countUnread(unread({ count: 0 }))).toBe(1);
  });

  it("counts nothing once it is read", () => {
    expect(countUnread(unread({ unread: false, count: 0 }))).toBe(0);
    // A stale count on a read conversation must not resurrect the badge.
    expect(countUnread(unread({ unread: false, count: 12 }))).toBe(0);
  });
});
