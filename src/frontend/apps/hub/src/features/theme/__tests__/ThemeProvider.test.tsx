// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider, useTheme } from "../ThemeProvider";

const ThemeProbe = () => {
  const { theme, cunninghamTheme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme}:{cunninghamTheme}
    </button>
  );
};

const renderThemeProvider = () =>
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the light theme by default", () => {
    renderThemeProvider();

    expect(screen.getByRole("button").textContent).toBe("light:dsfr-light");
  });

  it("restores the dark theme from localStorage", () => {
    window.localStorage.setItem("hub-theme", "dark");

    renderThemeProvider();

    expect(screen.getByRole("button").textContent).toBe("dark:dsfr-dark");
  });

  it("persists the selected theme", () => {
    renderThemeProvider();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button").textContent).toBe("dark:dsfr-dark");
    expect(window.localStorage.getItem("hub-theme")).toBe("dark");
  });

  it("ignores an invalid stored theme", () => {
    window.localStorage.setItem("hub-theme", "system");

    renderThemeProvider();

    expect(screen.getByRole("button").textContent).toBe("light:dsfr-light");
  });
});
