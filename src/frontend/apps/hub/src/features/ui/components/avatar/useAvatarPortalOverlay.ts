import { useEffect } from "react";

const OVERLAY_CLASS = "hub__avatar-portal-overlay";

type Patched = {
  target: HTMLElement;
  img: HTMLImageElement;
  /** Whether `position` was set here, and so is ours to remove. */
  positioned: boolean;
};

const patch = (target: HTMLElement, src: string): Patched => {
  const img =
    target.querySelector<HTMLImageElement>(`.${OVERLAY_CLASS}`) ??
    document.createElement("img");
  if (img.src !== src) img.src = src;
  const positioned = !target.style.position;
  if (positioned) target.style.position = "relative";
  if (!img.isConnected) {
    img.alt = "";
    img.className = OVERLAY_CLASS;
    Object.assign(img.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      objectFit: "cover",
      pointerEvents: "none",
    });
    target.appendChild(img);
  }
  return { target, img, positioned };
};

const unpatch = ({ target, img, positioned }: Patched): void => {
  img.remove();
  if (positioned) target.style.position = "";
};

/**
 * Some of the library's own dialogs/popovers (`UserMenu`'s popover,
 * `ShareModal`) render outside our component tree — straight into a portal
 * on `document.body` — and their avatar primitive (`UserAvatar`/`UserRow`)
 * has no `src` prop, only ever initials. Since there's no React children
 * slot to reach into, this patches a real `<img>` onto the first element
 * matching `selector` (in document order) as it (re)appears. Only the
 * first match, not every one: callers scope `selector` to a list of other
 * people's rows too (e.g. chat members), where document order is relied on
 * to land on the current user's own row — patching every match would put
 * "my" photo on everyone's avatar.
 *
 * The patch is undone when the photo changes or the hook goes away, so no
 * stale photo stays behind, and DOM changes are looked at once per frame
 * rather than on every mutation of the page.
 */
export const useAvatarPortalOverlay = (
  selector: string,
  src: string | undefined,
): void => {
  useEffect(() => {
    if (!src) return;

    let patched: Patched | null = null;
    const tryPatch = () => {
      const target = document.querySelector<HTMLElement>(selector);
      if (
        patched &&
        patched.target === target &&
        patched.img.parentElement === target
      ) {
        return;
      }
      if (patched) unpatch(patched);
      patched = target ? patch(target, src) : null;
    };

    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        tryPatch();
      });
    };

    tryPatch();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (patched) unpatch(patched);
    };
  }, [selector, src]);
};
