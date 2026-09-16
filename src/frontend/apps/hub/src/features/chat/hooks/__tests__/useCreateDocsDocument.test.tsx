// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAPI } from "@/features/api/fetchApi";

import {
  createDocsDocument,
  useCreateDocsDocument,
} from "../useCreateDocsDocument";

const login = vi.hoisted(() => vi.fn());

vi.mock("@/features/api/fetchApi", () => ({ fetchAPI: vi.fn() }));
vi.mock("@/features/auth/Auth", () => ({ login }));

const wrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientProvider";
  return Wrapper;
};

describe("useCreateDocsDocument", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.mocked(fetchAPI).mockReset();
    vi.mocked(login).mockReset();
  });

  afterEach(() => queryClient.clear());

  it("posts the title and joined member Matrix IDs to the Hub Docs endpoint", async () => {
    const document = {
      id: "doc-1",
      provider: "docs" as const,
      title: "Test Hub",
      address: "https://docs.test/docs/doc-1/",
      sharing: {
        shared: ["@demo0:test"],
        unresolved: [],
        failed: [],
      },
    };
    vi.mocked(fetchAPI).mockResolvedValue(
      new Response(JSON.stringify(document), { status: 201 }),
    );
    const { result } = renderHook(() => useCreateDocsDocument(), {
      wrapper: wrapper(queryClient),
    });

    let created;
    await act(async () => {
      created = await result.current.createDocument({
        title: "Test Hub",
        memberIds: ["@demo0:test"],
      });
    });

    expect(fetchAPI).toHaveBeenCalledWith(
      "integrations/docs/documents/",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Test Hub",
          member_ids: ["@demo0:test"],
        }),
      },
      { redirectOn40x: false },
    );
    expect(created).toEqual(document);
  });

  it("starts a fresh Hub login when the session cannot be refreshed", async () => {
    const unauthorized = Object.assign(new Error("unauthorized"), {
      code: 401,
    });
    vi.mocked(fetchAPI).mockRejectedValue(unauthorized);

    await expect(createDocsDocument("Test Hub", [])).rejects.toThrow(
      "unauthorized",
    );

    expect(login).toHaveBeenCalledWith(window.location.href);
  });
});
