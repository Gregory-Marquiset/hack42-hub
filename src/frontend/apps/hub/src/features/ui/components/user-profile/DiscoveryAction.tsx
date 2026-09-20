import { UserMenuItem } from "@gouvfr-lasuite/ui-components";
import { useTranslation } from "react-i18next";

type DiscoveryActionProps = {
  onOpen: () => void;
};

/** Account menu row that reopens the discovery tour. */
export const DiscoveryAction = ({ onOpen }: DiscoveryActionProps) => {
  const { t } = useTranslation();

  return (
    <UserMenuItem
      label={t("Discover the Hub")}
      icon={
        <span className="material-icons" aria-hidden="true">
          explore
        </span>
      }
      onClick={onOpen}
    />
  );
};
