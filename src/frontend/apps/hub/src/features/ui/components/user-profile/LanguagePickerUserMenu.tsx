import { LanguagePicker } from "@gouvfr-lasuite/ui-components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/features/auth/Auth";
import { getHubApi } from "@/features/config/HubApi";

// Values must match the backend's `LANGUAGES` choices (`hub/settings.py`),
// which are lowercase (e.g. "en-us") — sending "en-US" fails Django's
// case-sensitive choice validation with a 400, silently rolled back below.
const LANGUAGES = [
  { label: "Français", value: "fr-fr", shortLabel: "FR" },
  { label: "English", value: "en-us", shortLabel: "EN" },
  { label: "Deutsch", value: "de-de", shortLabel: "DE" },
];

export const LanguagePickerUserMenu = () => {
  const { i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const hubApi = getHubApi();
  const [selected, setSelected] = useState<string>(
    user?.language ?? i18n.language,
  );

  // Re-sync if the user's stored language changes outside this menu (e.g.
  // language picked in another tab and mirrored back through refreshUser).
  useEffect(() => {
    if (user?.language && user.language !== selected) {
      setSelected(user.language);
    }
  }, [user?.language, selected]);

  const onChange = (value: string) => {
    const previous = selected;
    setSelected(value);
    void i18n.changeLanguage(value);
    if (!user) {
      return;
    }
    hubApi
      .updateUser({ id: user.id, language: value })
      .then(() => refreshUser?.())
      .catch(() => {
        // Roll back: server didn't accept the change, keep UI consistent.
        setSelected(previous);
        void i18n.changeLanguage(previous);
      });
  };

  return (
    <LanguagePicker
      languages={LANGUAGES.map((language) => ({
        ...language,
        isChecked: language.value === selected,
      }))}
      size="small"
      onChange={onChange}
      compact
    />
  );
};
