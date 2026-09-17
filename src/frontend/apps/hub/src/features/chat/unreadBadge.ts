import type { ChatUnread } from "@/features/drivers/types";

/** Over ninety-nine, the exact figure stops being the point. */
export const UNREAD_BADGE_CAP = 99;

/** `7`, `99`, then `99+`: what a badge shows for a total. */
export const formatUnreadBadge = (count: number): string =>
  count > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : String(count);

/**
 * What one conversation adds to a total.
 *
 * A backend cannot always put a number on it: `count` is 0 while `unread`
 * still says something is waiting. Counting that as nothing would make a
 * badge disappear on a conversation that has unread messages, so it counts
 * as one - the badge says "something", which is the truth available.
 */
export const countUnread = (unread: ChatUnread): number =>
  unread.unread ? Math.max(unread.count, 1) : 0;
