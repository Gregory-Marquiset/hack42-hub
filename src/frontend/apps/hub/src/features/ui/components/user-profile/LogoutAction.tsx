import { UserMenuItem } from "@gouvfr-lasuite/ui-components";
import { Logout } from "@gouvfr-lasuite/ui-components/icons";
import { useTranslation } from "react-i18next";

import { logout } from "@/features/auth/Auth";

/**
 * Account menu row that logs the user out. Rendered through `actions`
 * (not `UserMenu`'s own `logout` prop) so it can be ordered after
 * `ChangeProfilePhotoAction` — the library always renders its built-in
 * `logout` slot above `actions`, which the user asked not to have.
 */
export const LogoutAction = () => {
  const { t } = useTranslation();
  return (
    <UserMenuItem label={t("Logout")} icon={<Logout />} onClick={logout} />
  );
};
