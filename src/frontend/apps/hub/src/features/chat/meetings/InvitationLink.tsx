import { useTranslation } from "react-i18next";

import { copyMeetingLink } from "./copyMeetingLink";

const CLASSES = {
  window: {
    text: "hub__meeting-window__share-text",
    row: "hub__meeting-window__share-row",
    input: "hub__meeting-window__share-link",
    copy: "hub__meeting-window__text-button",
  },
  panel: {
    text: "hub__chat-meetings__details-text",
    row: "hub__chat-meetings__invite-row",
    input: "hub__chat-meetings__input",
    copy: "hub__chat-meetings__action hub__chat-meetings__invite-copy",
  },
};

type InvitationLinkProps = {
  url: string;
  /** Styled for the meeting window, or for the meetings panel. */
  variant: keyof typeof CLASSES;
  tabIndex?: number;
};

/**
 * The link of a call, to invite people from outside the conversation: what
 * it gives, the link selected on focus, and a button copying it.
 */
export const InvitationLink = ({
  url,
  variant,
  tabIndex,
}: InvitationLinkProps) => {
  const { t } = useTranslation();
  const classes = CLASSES[variant];

  return (
    <>
      <p className={classes.text}>
        {t("Anyone with this link can join the call, even without an account.")}
      </p>
      <div className={classes.row}>
        <input
          type="text"
          readOnly
          className={classes.input}
          value={url}
          aria-label={t("Invitation link")}
          tabIndex={tabIndex}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          className={classes.copy}
          tabIndex={tabIndex}
          onClick={() => void copyMeetingLink(url, t)}
        >
          {t("Copy the link")}
        </button>
      </div>
    </>
  );
};
