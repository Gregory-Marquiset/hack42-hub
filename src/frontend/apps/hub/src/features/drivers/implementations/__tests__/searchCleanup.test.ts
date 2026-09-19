import { afterEach, describe, expect, it, vi } from "vitest";

import { searchDatabaseName } from "@/features/chat/search/storage";

import { LazyMatrixDriver } from "../LazyMatrixDriver";

// Never loaded here: the cleanup must work without the SDK.
vi.mock("../MatrixDriver", () => ({ MatrixDriver: class {} }));

const USER = {
  mxId: "@me:localhost",
  homeserverUrl: "https://matrix.localhost",
};

describe("message search cleanup at logout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deletes the stored index without loading the Matrix driver", async () => {
    const deleteDatabase = vi.fn(() => {
      const request: { onsuccess?: () => void } = {};
      setTimeout(() => request.onsuccess?.());
      return request;
    });
    vi.stubGlobal("indexedDB", { deleteDatabase });
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(USER),
    });

    await new LazyMatrixDriver("matrix").clearMessageSearch();

    expect(deleteDatabase).toHaveBeenCalledWith(
      searchDatabaseName("", "matrix", USER.homeserverUrl, USER.mxId),
    );
  });
});
