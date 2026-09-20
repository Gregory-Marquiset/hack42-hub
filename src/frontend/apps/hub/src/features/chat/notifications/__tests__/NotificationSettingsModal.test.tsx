// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  NotificationRule,
  NotificationRules,
} from "@/features/drivers/types";

import { NotificationSettingsModal } from "../NotificationSettingsModal";

const {
  getNotificationRules,
  setNotificationRuleEnabled,
  setNotificationRuleActions,
  setChatMuted,
} = vi.hoisted(() => ({
  getNotificationRules: vi.fn<() => Promise<NotificationRules>>(),
  setNotificationRuleEnabled: vi.fn(async () => {}),
  setNotificationRuleActions: vi.fn(async () => {}),
  setChatMuted: vi.fn(async () => {}),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));
vi.mock("@/features/drivers/DriverRegistry", () => ({
  useDriverEntries: () => [
    { accountId: "account-a", driver: { supportsNotificationRules: true } },
  ],
  getRegistry: () => ({
    get: () => ({
      getNotificationRules,
      setNotificationRuleEnabled,
      setNotificationRuleActions,
      setChatMuted,
    }),
  }),
}));
vi.mock("@/features/chat/hooks/useChats", () => ({
  useChats: () => ({ all: [], favourites: [] }),
}));
vi.mock("@/features/ui/components/toast", () => ({
  notify: { error: vi.fn() },
}));
vi.mock("@gouvfr-lasuite/ui-components", () => ({
  Modal: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
  ModalSize: { MEDIUM: "medium" },
  Switch: ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  ),
}));

const rule = (overrides: Partial<NotificationRule>): NotificationRule => ({
  id: ".m.rule.message",
  kind: "underride",
  isEnabled: true,
  isDefault: true,
  actions: ["notify"],
  ...overrides,
});

const rulesWith = (underride: NotificationRule[]): NotificationRules => ({
  override: [],
  content: [],
  room: [],
  sender: [],
  underride,
});

const renderModal = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationSettingsModal
        accountId="account-a"
        isOpen
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
};

describe("NotificationSettingsModal category switches", () => {
  beforeEach(() => {
    setNotificationRuleEnabled.mockClear();
    setNotificationRuleActions.mockClear();
  });

  it("shows an enabled rule without a notify action as off", async () => {
    // Matrix 1.7: an empty action list means "don't notify".
    getNotificationRules.mockResolvedValue(rulesWith([rule({ actions: [] })]));
    renderModal();

    const toggle = await screen.findByLabelText("Group messages");
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it("switches a silent rule on by writing its actions", async () => {
    getNotificationRules.mockResolvedValue(
      rulesWith([rule({ actions: ["dont_notify"] })]),
    );
    renderModal();

    fireEvent.click(await screen.findByLabelText("Group messages"));

    await waitFor(() =>
      expect(setNotificationRuleActions).toHaveBeenCalledWith({
        kind: "underride",
        ruleId: ".m.rule.message",
        actions: ["notify"],
      }),
    );
    // Already enabled: enabling it again would have changed nothing.
    expect(setNotificationRuleEnabled).not.toHaveBeenCalled();
  });

  it("switches a notifying category off by disabling its rules", async () => {
    getNotificationRules.mockResolvedValue(rulesWith([rule({})]));
    renderModal();

    fireEvent.click(await screen.findByLabelText("Group messages"));

    await waitFor(() =>
      expect(setNotificationRuleEnabled).toHaveBeenCalledWith({
        kind: "underride",
        ruleId: ".m.rule.message",
        enabled: false,
      }),
    );
    expect(setNotificationRuleActions).not.toHaveBeenCalled();
  });
});

describe("NotificationSettingsModal muted conversations", () => {
  it("unmutes a conversation through the driver", async () => {
    getNotificationRules.mockResolvedValue({
      ...rulesWith([]),
      room: [
        rule({
          id: "!muted:localhost",
          kind: "room",
          isDefault: false,
          actions: ["dont_notify"],
        }),
      ],
    });
    renderModal();

    fireEvent.click(await screen.findByText("Unmute"));

    await waitFor(() =>
      expect(setChatMuted).toHaveBeenCalledWith("!muted:localhost", false),
    );
  });
});
