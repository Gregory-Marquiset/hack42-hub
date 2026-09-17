import { afterEach, describe, expect, it, vi } from "vitest";

import { copyMeetingLink } from "../copyMeetingLink";

const notify = vi.hoisted(() => ({ brand: vi.fn(), error: vi.fn() }));

vi.mock("@/features/ui/components/toast", () => ({ notify }));

const t = ((key: string) => key) as never;
const URL = "https://meet.example.com/abc-defg-hij";

describe("copyMeetingLink", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("copies the link and says who can use it", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyMeetingLink(URL, t)).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(notify.brand).toHaveBeenCalledWith(
      "Invitation link copied: anyone with it can join the call.",
    );
  });

  it("asks to copy it by hand when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error())) },
    });

    await expect(copyMeetingLink(URL, t)).resolves.toBe(false);

    expect(notify.error).toHaveBeenCalledWith(
      "The link could not be copied. Select it and copy it.",
    );
  });
});
