import clsx from "clsx";
import { ReactNode, useEffect, useState } from "react";

import { AvatarColor, hashAvatarColor } from "./palette";

const deriveInitials = (label: string): string => {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
};

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = {
  label: string;
  children?: ReactNode;
  variant?: "solid" | "soft";
  size?: AvatarSize;
  decorative?: boolean;
  /** Force a specific palette colour. Defaults to a hash of `label`. */
  color?: AvatarColor;
  className?: string;
  /**
   * Photo to show instead of initials/children. Falls back to them
   * automatically if the image fails to load (removed account, dead link).
   */
  src?: string;
};

export const Avatar = ({
  label,
  children,
  variant = "solid",
  size = "sm",
  decorative = false,
  color,
  className,
  src,
}: AvatarProps) => {
  const resolvedColor = color ?? hashAvatarColor(label);
  const a11yProps = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": label };
  const [imageFailed, setImageFailed] = useState(false);
  // A freshly uploaded photo reuses the same avatar instance with a new
  // `src` — retry it instead of keeping a stale failure from the old one.
  useEffect(() => setImageFailed(false), [src]);
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span
      className={clsx(
        "hub__avatar",
        `hub__avatar--${size}`,
        `hub__avatar--${resolvedColor}`,
        variant === "soft" && "hub__avatar--soft",
        className,
      )}
      {...a11yProps}
    >
      {showImage ? (
        <img
          className="hub__avatar__image"
          src={src}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        (children ?? deriveInitials(label))
      )}
    </span>
  );
};
