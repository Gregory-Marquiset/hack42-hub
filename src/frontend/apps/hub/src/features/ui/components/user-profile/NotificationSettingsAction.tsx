import { UserMenuItem } from "@gouvfr-lasuite/ui-components";
import { Bell } from "@gouvfr-lasuite/ui-components/icons";
import { useTranslation } from "react-i18next";

type NotificationSettingsActionProps = {
  onOpen: () => void;
};

/** Account menu row that opens the transparent notification settings panel. */
export const NotificationSettingsAction = ({
  onOpen,
}: NotificationSettingsActionProps) => {
  const { t } = useTranslation();

  return (
    <UserMenuItem label={t("Notifications")} icon={<Bell />} onClick={onOpen} />
  );
};
