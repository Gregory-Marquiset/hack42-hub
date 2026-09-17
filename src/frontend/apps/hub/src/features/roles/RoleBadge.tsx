import { useTranslation } from "react-i18next";

import { useUserRoles } from "./useRoles";

/** The six hues `roles.scss` defines, 60 degrees apart on the wheel. */
const TONES = ["po", "pm", "dev", "qa", "ops", "design"] as const;

/** The labels the editor offers, each pinned to its own hue. */
const PRESET_TONES: Record<string, (typeof TONES)[number]> = {
  PO: "po",
  PM: "pm",
  DEV: "dev",
  QA: "qa",
  OPS: "ops",
  DESIGN: "design",
};

/**
 * A stable hue for a label the editor does not know.
 *
 * Custom titles used to share one grey, so "Assistant IA", "Support" and
 * "Responsable produit" were indistinguishable. Hashing spreads them over the
 * same six hues and, being a pure function of the text, gives one person the
 * same colour on every screen and for every viewer.
 */
const toneFor = (role: string): (typeof TONES)[number] => {
  const preset = PRESET_TONES[role.toUpperCase()];
  if (preset) {
    return preset;
  }
  let hash = 5381;
  for (let index = 0; index < role.length; index += 1) {
    hash = ((hash << 5) + hash + role.charCodeAt(index)) | 0;
  }
  return TONES[(hash >>> 0) % TONES.length];
};

export const RoleBadge = ({ role }: { role: string }) => {
  const { t } = useTranslation();
  if (!role) return null;
  return (
    <span
      className={`hub__role-badge hub__role-badge--${toneFor(role)}`}
      title={t("Role: {{role}}", { role })}
    >
      {role}
    </span>
  );
};

export const UserRoleBadge = ({ userId }: { userId: string }) => {
  const roles = useUserRoles([userId]);
  return <RoleBadge role={roles[userId] ?? ""} />;
};
