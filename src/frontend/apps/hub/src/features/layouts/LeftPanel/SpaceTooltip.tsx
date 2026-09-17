import { createPortal } from "react-dom";

import type { RailTooltipAnchor } from "./railTooltip";

/**
 * An espace's name, beside its bubble.
 *
 * It renders into `document.body` rather than next to the bubble: the rail
 * scrolls, and a scroll container clips what its children paint outside it, so
 * a tooltip anchored inside the rail would be cut off by the rail. The name is
 * already the link's accessible name, so this copy is hidden from assistive
 * technology instead of being announced twice.
 */
export const SpaceTooltip = ({
  label,
  anchor,
}: {
  label: string;
  anchor: RailTooltipAnchor;
}) => {
  if (typeof document === "undefined") return null;

  return createPortal(
    <span
      className="hub__rail-tooltip"
      style={{ top: anchor.top, left: anchor.left }}
      aria-hidden="true"
    >
      {label}
    </span>,
    document.body,
  );
};
