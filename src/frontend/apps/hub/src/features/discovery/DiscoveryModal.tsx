import { Button, Modal, ModalSize } from "@gouvfr-lasuite/ui-components";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getDiscoveryFeatures } from "./features";

type DiscoveryModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * A tour of what the Hub does and where each feature lives, for someone who
 * opens it for the first time. Opened once on its own, then from the account
 * menu.
 */
export const DiscoveryModal = ({ isOpen, onClose }: DiscoveryModalProps) => {
  const { t } = useTranslation();
  const features = useMemo(() => getDiscoveryFeatures(t), [t]);

  return (
    <Modal
      isOpen={isOpen}
      size={ModalSize.LARGE}
      title={t("Discover the Hub")}
      aria-label={t("Discover the Hub")}
      onClose={onClose}
      closeOnClickOutside
      rightActions={<Button onClick={onClose}>{t("Let's go")}</Button>}
    >
      <div className="hub__discovery">
        <p className="hub__discovery__intro">
          {t(
            "Messages, meetings and documents in one place. Here is what you can do, and where to find it.",
          )}
        </p>
        <ul className="hub__discovery__list">
          {features.map((feature) => (
            <li key={feature.id} className="hub__discovery__card">
              <span
                className="material-icons hub__discovery__icon"
                aria-hidden="true"
              >
                {feature.icon}
              </span>
              <div className="hub__discovery__text">
                <h3 className="hub__discovery__title">{feature.title}</h3>
                <p className="hub__discovery__description">
                  {feature.description}
                </p>
                <p className="hub__discovery__where">{feature.where}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="hub__discovery__footer">
          {t("You can reopen this tour from your account menu.")}
        </p>
      </div>
    </Modal>
  );
};
