import type { TFunction } from "i18next";

import { notify } from "@/features/ui/components/toast";

/**
 * Copies a call's link, to invite people outside the conversation: Hub
 * meetings are open to whoever has the link, account or not.
 */
export const copyMeetingLink = async (
  url: string,
  t: TFunction,
): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url);
    notify.brand(
      t("Invitation link copied: anyone with it can join the call."),
    );
    return true;
  } catch {
    notify.error(t("The link could not be copied. Select it and copy it."));
    return false;
  }
};
