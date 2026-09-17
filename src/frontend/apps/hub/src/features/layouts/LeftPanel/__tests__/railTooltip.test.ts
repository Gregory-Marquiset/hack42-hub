import { describe, expect, it } from "vitest";

import {
  RAIL_TOOLTIP_DELAY_MS,
  RAIL_TOOLTIP_GAP,
  anchorFromRect,
} from "../railTooltip";

const rect = (top: number, height = 36, right = 44) => ({ top, right, height });

describe("RAIL_TOOLTIP_DELAY_MS", () => {
  it("waits long enough not to fire while the pointer crosses the rail", () => {
    expect(RAIL_TOOLTIP_DELAY_MS).toBeGreaterThanOrEqual(150);
  });

  it("answers well inside the second someone is willing to wait", () => {
    expect(RAIL_TOOLTIP_DELAY_MS).toBeLessThanOrEqual(1000);
  });
});

describe("anchorFromRect", () => {
  it("sits beside the middle of the bubble", () => {
    expect(anchorFromRect(rect(100), 800)).toEqual({
      top: 118,
      left: 44 + RAIL_TOOLTIP_GAP,
    });
  });

  it("keeps a bubble at the very top of the rail on screen", () => {
    // A rail long enough to scroll puts a bubble under the window's edge; its
    // middle would anchor the tooltip above the window entirely.
    expect(anchorFromRect(rect(-30), 800).top).toBe(8);
  });

  it("keeps a bubble at the very bottom on screen", () => {
    expect(anchorFromRect(rect(1200), 800).top).toBe(792);
  });

  it("answers inside a window too short for its own margins", () => {
    expect(anchorFromRect(rect(0), 4).top).toBe(8);
  });
});
