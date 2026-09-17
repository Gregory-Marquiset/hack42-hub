/**
 * Where a rail tooltip goes, and how long the pointer has to stay.
 *
 * Kept apart from the component so the arithmetic is testable without a
 * browser: the tooltip is positioned in viewport coordinates because the rail
 * is a scroll container, and a scroll container clips everything its children
 * paint outside it - an absolutely positioned bubble inside the rail would be
 * cut off by the rail itself.
 */

/** How long the pointer rests on an espace before its name appears. */
export const RAIL_TOOLTIP_DELAY_MS = 250;

/** Space between the bubble and the tooltip beside it. */
export const RAIL_TOOLTIP_GAP = 10;

/** Room kept between the tooltip and the top or bottom of the window. */
const VIEWPORT_MARGIN = 8;

export type RailTooltipAnchor = { top: number; left: number };

type RectLike = { top: number; right: number; height: number };

/**
 * Anchors the tooltip to the middle of the bubble's right edge.
 *
 * `top` is the middle of the bubble: the tooltip pulls itself up by half its
 * own height in CSS, which is the one part of the centring that needs to know
 * how tall the text ended up being. A bubble near the top or bottom of a long
 * rail would otherwise anchor the tooltip off-screen, so the middle is kept
 * within the window.
 */
export const anchorFromRect = (
  rect: RectLike,
  viewportHeight: number,
): RailTooltipAnchor => ({
  top: Math.min(
    Math.max(rect.top + rect.height / 2, VIEWPORT_MARGIN),
    Math.max(viewportHeight - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
  ),
  left: rect.right + RAIL_TOOLTIP_GAP,
});
