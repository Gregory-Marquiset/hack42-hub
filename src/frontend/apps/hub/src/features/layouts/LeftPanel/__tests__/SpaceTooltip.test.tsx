// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpaceTooltip } from "../SpaceTooltip";

afterEach(cleanup);

describe("SpaceTooltip", () => {
  it("renders outside the rail, at the viewport position it was given", () => {
    // The point of the portal: the rail is a scroll container and would clip
    // a tooltip anchored inside it.
    const { container } = render(
      <SpaceTooltip label="Technique" anchor={{ top: 118, left: 54 }} />,
    );

    const tooltip = screen.getByText("Technique");
    expect(container.innerHTML).toBe("");
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip.style.top).toBe("118px");
    expect(tooltip.style.left).toBe("54px");
  });

  it("says nothing to assistive technology, which already has the name", () => {
    render(<SpaceTooltip label="Technique" anchor={{ top: 0, left: 0 }} />);

    expect(screen.getByText("Technique").getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
