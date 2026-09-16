import { UserMenuItem } from "@gouvfr-lasuite/ui-components";
import { ImageAdd } from "@gouvfr-lasuite/ui-components/icons";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { useSetUserAvatar } from "@/features/chat/hooks/useSetUserAvatar";
import { useDriverEntries } from "@/features/drivers/DriverRegistry";

/** Account menu row that uploads and sets the user's own chat avatar. */
export const ChangeProfilePhotoAction = () => {
  const { t } = useTranslation();
  const entries = useDriverEntries();
  const account = entries.find((entry) => entry.driver.supportsAvatarUpload);
  const { setUserAvatar } = useSetUserAvatar(account?.accountId ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!account) {
    return null;
  }

  return (
    <>
      <UserMenuItem
        label={t("Change profile photo")}
        icon={<ImageAdd />}
        onClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hub__visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            setUserAvatar(file);
          }
        }}
      />
    </>
  );
};
