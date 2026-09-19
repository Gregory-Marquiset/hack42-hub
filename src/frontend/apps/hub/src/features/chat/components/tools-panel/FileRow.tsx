import { useTranslation } from "react-i18next";

import { Download } from "./MeetingIcons";

type FileRowProps = {
  name: string;
  /** Under the name: its sender, date, size… */
  details: string;
  tabIndex: number;
  /** This file is being downloaded. */
  isDownloading: boolean;
  /** A download is under way (one at a time). */
  isDisabled: boolean;
  onDownload: () => void;
};

/** One file of a documents list: its name, details and a download button. */
export const FileRow = ({
  name,
  details,
  tabIndex,
  isDownloading,
  isDisabled,
  onDownload,
}: FileRowProps) => {
  const { t } = useTranslation();

  return (
    <li className="hub__tools-list__row">
      <span className="hub__tools-list__text">
        <span className="hub__tools-list__label">{name}</span>
        <span className="hub__tools-list__details">{details}</span>
      </span>
      <span className="hub__tools-list__actions">
        <button
          type="button"
          className="hub__tools-list__icon-button"
          aria-label={t("Download {{name}}", { name })}
          disabled={isDisabled}
          aria-busy={isDownloading || undefined}
          tabIndex={tabIndex}
          onClick={onDownload}
        >
          <Download />
        </button>
      </span>
    </li>
  );
};
