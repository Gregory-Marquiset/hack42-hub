// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useDiscovery } from "../useDiscovery";

describe("useDiscovery", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("opens by itself on a first visit", () => {
    const { result } = renderHook(() => useDiscovery());

    expect(result.current.isOpen).toBe(true);
  });

  it("stays closed once the tour was closed on this browser", () => {
    const first = renderHook(() => useDiscovery());
    act(() => first.result.current.close());
    expect(first.result.current.isOpen).toBe(false);

    const second = renderHook(() => useDiscovery());
    expect(second.result.current.isOpen).toBe(false);
  });

  it("reopens from the menu after being seen", () => {
    localStorage.setItem("hub.discovery.seen", "true");
    const { result } = renderHook(() => useDiscovery());

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
  });
});
