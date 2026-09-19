// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAvatarPortalOverlay } from "../useAvatarPortalOverlay";

const overlay = () =>
  document.querySelector<HTMLImageElement>(".hub__avatar-portal-overlay");

const addAvatar = () => {
  const avatar = document.createElement("div");
  avatar.className = "portal-avatar";
  document.body.appendChild(avatar);
  return avatar;
};

describe("useAvatarPortalOverlay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("patches an avatar that appears later", async () => {
    renderHook(() => useAvatarPortalOverlay(".portal-avatar", "blob:photo"));
    const avatar = addAvatar();

    await waitFor(() => expect(overlay()?.parentElement).toBe(avatar));
    expect(overlay()?.src).toBe("blob:photo");
  });

  it("leaves nothing behind once the photo is gone", () => {
    const avatar = addAvatar();
    const { rerender } = renderHook(
      ({ src }: { src?: string }) =>
        useAvatarPortalOverlay(".portal-avatar", src),
      { initialProps: { src: "blob:photo" } as { src?: string } },
    );
    expect(overlay()).not.toBeNull();
    expect(avatar.style.position).toBe("relative");

    rerender({ src: undefined });

    expect(overlay()).toBeNull();
    expect(avatar.style.position).toBe("");
  });
});
