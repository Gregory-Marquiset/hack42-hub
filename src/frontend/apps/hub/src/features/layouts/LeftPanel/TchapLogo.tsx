import clsx from "clsx";
import Image from "next/image";

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
 */
export const TchapLogo = ({
  variant = "full",
  decorative = false,
}: {
  variant?: "full" | "mark";
  decorative?: boolean;
} = {}) => (
  <span
    className={clsx(
      "hub__tchap-logo",
      variant === "mark" && "hub__tchap-logo--mark",
    )}
    {...(decorative
      ? { "aria-hidden": true }
      : { role: "img", "aria-label": "Tchap" })}
  >
    <span className="hub__tchap-logo__mark" aria-hidden="true">
      <span className="hub__tchap-logo__asset hub__tchap-logo__asset--primary">
        <Image
          src="/assets/tchap-logo-mark-1.svg"
          alt=""
          fill
          sizes="23px"
          priority
          unoptimized
        />
      </span>
      <span className="hub__tchap-logo__asset hub__tchap-logo__asset--secondary">
        <Image
          src="/assets/tchap-logo-mark-2.svg"
          alt=""
          fill
          sizes="15px"
          priority
          unoptimized
        />
      </span>
    </span>
    <span className="hub__tchap-logo__wordmark" aria-hidden="true">
      <Image
        src="/assets/tchap-logo-wordmark.svg"
        alt=""
        fill
        sizes="63px"
        priority
        unoptimized
      />
    </span>
  </span>
);
