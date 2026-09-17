import { useTranslation } from "react-i18next";

import type {
  ChatSelfPresencePreference,
  ChatUserPresenceState,
} from "@/features/drivers/types";

/**
 * Either alphabet: an observed Matrix state, or the viewer's own choice, which
 * knows "busy" - a value the protocol does not have.
 */
type PresenceValue = ChatUserPresenceState | ChatSelfPresencePreference;

type UserPresenceIndicatorProps = {
  state: PresenceValue | null;
  decorative?: boolean;
  placement?: "inline" | "avatar";
};

/**
 * Three dots, three meanings, and nothing else to learn: green means talk to
 * me, red means not now, grey means gone. `unavailable` is Matrix's "away",
 * which for someone looking at the dot is the same news as "busy".
 */
const TONES: Record<PresenceValue, "online" | "busy" | "offline"> = {
  online: "online",
  busy: "busy",
  unavailable: "busy",
  offline: "offline",
};

const LABELS: Record<PresenceValue, string> = {
  online: "Available",
  busy: "Busy",
  unavailable: "Busy",
  offline: "Offline",
};

/** Pure presentation for a resolved transport-level user presence. */
export const UserPresenceIndicator = ({
  state,
  decorative = false,
  placement = "inline",
}: UserPresenceIndicatorProps) => {
  const { t } = useTranslation();

  if (!state) return null;

  const label = t(LABELS[state]);
  const presentation = TONES[state];
  return (
    <span
      className={`hub__user-presence hub__user-presence--${presentation} hub__user-presence--${placement}`}
      data-presence={state}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      title={label}
    />
  );
};
