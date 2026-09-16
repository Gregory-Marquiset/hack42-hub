import type { ChatMeeting } from "@/features/drivers/types";

/** Short `DD/MM` date used to label a meeting in the panel lists. */
export const formatMeetingDay = (iso: string, locale?: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
};

/**
 * A meeting is a Meet call with no title of its own, so the panel labels it by
 * the day it was held — the `01/09 Réunion du mois` shape of the mockups.
 */
export const formatMeetingLabel = (
  meeting: ChatMeeting,
  fallback: string,
  locale?: string,
): string => `${formatMeetingDay(meeting.startedAt, locale)} ${fallback}`;
