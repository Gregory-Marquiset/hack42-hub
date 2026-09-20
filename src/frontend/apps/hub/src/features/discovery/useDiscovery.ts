import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "hub.discovery.seen";

const hasSeenDiscovery = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === "true";
  } catch {
    // Storage refused (private window, blocked site data): never open by
    // itself rather than on every page load.
    return true;
  }
};

/**
 * Whether the discovery tour is open. It opens by itself on someone's first
 * visit on this browser, and is remembered as seen once closed.
 */
export const useDiscovery = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenDiscovery()) {
      setIsOpen(true);
    }
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "true");
    } catch {
      // Nothing to remember then: the tour stays one click away in the menu.
    }
  }, []);

  return { isOpen, open, close };
};
