import { useEffect } from "react";

const OVERLAY_CLASS = "hub__avatar-portal-overlay";

const patch = (target: Element, src: string) => {
  const el = target as HTMLElement;
  const existing = el.querySelector<HTMLImageElement>(`.${OVERLAY_CLASS}`);
  if (existing) {
    if (existing.src !== src) existing.src = src;
    return;
  }
  if (!el.style.position) el.style.position = "relative";
  const img = document.createElement("img");
  img.src = src;
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
  el.appendChild(img);
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
 */
export const useAvatarPortalOverlay = (
  selector: string,
  src: string | undefined,
): void => {
  useEffect(() => {
    if (!src) return;

    const tryPatch = () => {
      const el = document.querySelector(selector);
      if (el) patch(el, src);
    };

    tryPatch();

    const observer = new MutationObserver(tryPatch);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [selector, src]);
};
