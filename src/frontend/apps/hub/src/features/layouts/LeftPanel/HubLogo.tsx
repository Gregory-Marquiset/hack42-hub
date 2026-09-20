import clsx from "clsx";

/**
 * The product's name in the panel's corner.
 *
 * `variant="mark"` drops the wordmark and keeps the mark alone, for the 53px
 * of a closed panel: a name nobody can read is not a name, but the mark still
 * says which product this is.
 *
 * `decorative` is for the case where the logo sits inside a button that
 * already carries its own label - two labels on one control read as two
 * controls.
 *
 * Drawn inline rather than loaded as images: two files for one mark meant two
 * requests and a flash of nothing before they arrived.
 */
export const HubLogo = ({
  variant = "full",
  decorative = false,
}: {
  variant?: "full" | "mark";
  decorative?: boolean;
} = {}) => (
  <span
    className={clsx("hub__logo", variant === "mark" && "hub__logo--mark")}
    {...(decorative
      ? { "aria-hidden": true }
      : { role: "img", "aria-label": "Le Hub" })}
  >
    <svg
      className="hub__logo__mark"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="16" className="hub__logo__square" />
      <circle cx="22" cy="24" r="7" className="hub__logo__dot" />
      <circle
        cx="42"
        cy="24"
        r="7"
        className="hub__logo__dot hub__logo__dot--soft"
      />
      <circle
        cx="32"
        cy="42"
        r="7"
        className="hub__logo__dot hub__logo__dot--accent"
      />
    </svg>
    <span className="hub__logo__wordmark" aria-hidden="true">
      Le Hub
    </span>
  </span>
);
