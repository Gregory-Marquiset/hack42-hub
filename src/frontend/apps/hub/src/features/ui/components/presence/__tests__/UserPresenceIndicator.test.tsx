// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserPresenceIndicator } from "../UserPresenceIndicator";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("UserPresenceIndicator", () => {
  // Three dots, three meanings: green invites, red holds you off, grey says
  // nobody is there. Matrix's "away" is the same news as busy to whoever is
  // looking, so it shares the red - but only "busy" is ever chosen.
  it.each([
    ["online", "Available", "online"],
    ["busy", "Busy", "busy"],
    ["unavailable", "Busy", "busy"],
    ["offline", "Offline", "offline"],
  ] as const)("renders an accessible %s indicator", (state, label, tone) => {
    render(<UserPresenceIndicator state={state} />);

    const indicator = screen.getByRole("img", { name: label });
    expect(indicator.getAttribute("data-presence")).toBe(state);
    expect(indicator.getAttribute("title")).toBe(label);
    for (const candidate of ["online", "busy", "offline"] as const) {
      expect(
        indicator.classList.contains(`hub__user-presence--${candidate}`),
      ).toBe(candidate === tone);
    }
  });

  it("supports the shared avatar overlay placement", () => {
    render(<UserPresenceIndicator state="online" placement="avatar" />);

    expect(
      screen
        .getByRole("img", { name: "Available" })
        .classList.contains("hub__user-presence--avatar"),
    ).toBe(true);
  });

  it("renders nothing for an unknown presence", () => {
    const { container } = render(<UserPresenceIndicator state={null} />);

    expect(container.childElementCount).toBe(0);
  });
});
