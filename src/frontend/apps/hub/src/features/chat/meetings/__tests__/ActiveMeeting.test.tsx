// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveMeetingProvider, useActiveMeeting } from "../ActiveMeeting";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const URL_A = "https://meet.example.com/abc-defg-hij";
const URL_B = "https://meet.example.com/klm-nopq-rst";

const Opener = () => {
  const { openMeeting, isMinimized } = useActiveMeeting();
  return (
    <>
      <button type="button" onClick={() => openMeeting(URL_A)}>
        open A
      </button>
      <button type="button" onClick={() => openMeeting(URL_B)}>
        open B
      </button>
      <span data-testid="state">{isMinimized ? "minimized" : "expanded"}</span>
    </>
  );
};

const renderApp = () =>
  render(
    <ActiveMeetingProvider>
      <Opener />
    </ActiveMeetingProvider>,
  );

const frame = () => screen.getByTitle("Meeting") as HTMLIFrameElement;

describe("ActiveMeetingProvider", () => {
  afterEach(cleanup);

  it("shows no window until a meeting is opened", () => {
    renderApp();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the same frame when minimized and restored", () => {
    renderApp();
    fireEvent.click(screen.getByText("open A"));
    const before = frame();
    expect(before.getAttribute("src")).toBe(URL_A);

    fireEvent.click(screen.getByLabelText("Minimize the meeting"));

    expect(screen.getByRole("dialog").hasAttribute("data-minimized")).toBe(
      true,
    );
    expect(screen.queryByTestId("meeting-window-backdrop")).toBeNull();
    expect(screen.getByTestId("state").textContent).toBe("minimized");
    expect(frame()).toBe(before);

    fireEvent.click(screen.getByLabelText("Restore the meeting"));

    expect(screen.getByRole("dialog").hasAttribute("data-minimized")).toBe(
      false,
    );
    expect(frame()).toBe(before);
  });

  it("minimizes when the backdrop is clicked", () => {
    renderApp();
    fireEvent.click(screen.getByText("open A"));

    fireEvent.click(screen.getByTestId("meeting-window-backdrop"));

    expect(screen.getByRole("dialog").hasAttribute("data-minimized")).toBe(
      true,
    );
  });

  it("leaves the call", () => {
    renderApp();
    fireEvent.click(screen.getByText("open A"));

    fireEvent.click(screen.getByLabelText("Leave the meeting"));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves the embedded call when it is opened in a new tab", () => {
    renderApp();
    fireEvent.click(screen.getByText("open A"));
    const link = screen.getByLabelText("Open in a new tab");
    expect(link.getAttribute("href")).toBe(URL_A);
    expect(link.getAttribute("target")).toBe("_blank");

    fireEvent.click(link);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("switches to another call expanded", () => {
    renderApp();
    fireEvent.click(screen.getByText("open A"));
    fireEvent.click(screen.getByLabelText("Minimize the meeting"));

    fireEvent.click(screen.getByText("open B"));

    expect(frame().getAttribute("src")).toBe(URL_B);
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });
});
