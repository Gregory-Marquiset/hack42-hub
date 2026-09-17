// @vitest-environment jsdom
import "@/i18n/initI18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationRules } from "@/features/drivers/types";

import {
  useNotificationRules,
  useSetNotificationRuleEnabled,
} from "../useNotificationRules";

const { getNotificationRules, setNotificationRuleEnabled, notifyError } =
  vi.hoisted(() => ({
    getNotificationRules: vi.fn<() => Promise<NotificationRules>>(),
    setNotificationRuleEnabled:
      vi.fn<
        (params: {
          kind: string;
          ruleId: string;
          enabled: boolean;
        }) => Promise<void>
      >(),
    notifyError: vi.fn(),
  }));

vi.mock("@/features/drivers/DriverRegistry", () => ({
  getRegistry: () => ({
    get: () => ({ getNotificationRules, setNotificationRuleEnabled }),
  }),
}));
vi.mock("@/features/ui/components/toast", () => ({
  notify: { error: notifyError },
}));

const ACCOUNT_ID = "account-a";

const emptyRules = (): NotificationRules => ({
  override: [],
  content: [],
  room: [],
  sender: [],
  underride: [],
});

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientProvider";
  return Wrapper;
};

describe("useNotificationRules", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    getNotificationRules.mockReset();
    setNotificationRuleEnabled.mockReset().mockResolvedValue(undefined);
    notifyError.mockReset();
  });

  afterEach(() => queryClient.clear());

  it("returns the fetched rules", async () => {
    const rules: NotificationRules = {
      ...emptyRules(),
      override: [
        {
          id: ".m.rule.master",
          kind: "override",
          isEnabled: false,
          isDefault: true,
          actions: [],
        },
      ],
    };
    getNotificationRules.mockResolvedValue(rules);

    const { result } = renderHook(
      () => useNotificationRules(ACCOUNT_ID, true),
      { wrapper: wrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.rules.override).toHaveLength(1));
    expect(result.current.isInitialLoading).toBe(false);
  });

  it("is not fetched when disabled", () => {
    renderHook(() => useNotificationRules(ACCOUNT_ID, false), {
      wrapper: wrapper(queryClient),
    });
    expect(getNotificationRules).not.toHaveBeenCalled();
  });
});

describe("useSetNotificationRuleEnabled", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    setNotificationRuleEnabled.mockReset().mockResolvedValue(undefined);
    notifyError.mockReset();
    const rules: NotificationRules = {
      ...emptyRules(),
      underride: [
        {
          id: ".m.rule.message",
          kind: "underride",
          isEnabled: true,
          isDefault: true,
          actions: ["notify"],
        },
      ],
    };
    queryClient.setQueryData(["notification-rules", ACCOUNT_ID], rules);
  });

  afterEach(() => queryClient.clear());

  it("optimistically flips the rule before the driver resolves", async () => {
    let resolveMutation: (() => void) | undefined;
    setNotificationRuleEnabled.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    const { result } = renderHook(
      () => useSetNotificationRuleEnabled(ACCOUNT_ID),
      { wrapper: wrapper(queryClient) },
    );

    act(() => result.current.setEnabled("underride", ".m.rule.message", false));

    await waitFor(() => {
      const rules = queryClient.getQueryData<NotificationRules>([
        "notification-rules",
        ACCOUNT_ID,
      ]);
      expect(rules?.underride[0].isEnabled).toBe(false);
    });
    act(() => resolveMutation?.());
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("rolls back and notifies on failure", async () => {
    setNotificationRuleEnabled.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(
      () => useSetNotificationRuleEnabled(ACCOUNT_ID),
      { wrapper: wrapper(queryClient) },
    );

    act(() => result.current.setEnabled("underride", ".m.rule.message", false));

    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce());
    const rules = queryClient.getQueryData<NotificationRules>([
      "notification-rules",
      ACCOUNT_ID,
    ]);
    expect(rules?.underride[0].isEnabled).toBe(true);
  });
});
