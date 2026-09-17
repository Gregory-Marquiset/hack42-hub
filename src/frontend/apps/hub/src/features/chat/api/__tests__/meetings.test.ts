import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMeetingArchive,
  fetchMeetingDocumentFile,
  fetchMeetingDocuments,
  updateMeeting,
  uploadMeetingDocument,
} from "../meetings";

const fetchAPI = vi.hoisted(() => vi.fn());

vi.mock("@/features/api/fetchApi", () => ({ fetchAPI }));

describe("updateMeeting", () => {
  afterEach(() => {
    fetchAPI.mockReset();
  });

  it("sends only what changed", async () => {
    fetchAPI.mockResolvedValue(new Response(null, { status: 204 }));

    await updateMeeting("abc-defg-hij", { extendMinutes: 15 });
    await updateMeeting("abc-defg-hij", { title: "" });

    expect(fetchAPI).toHaveBeenNthCalledWith(
      1,
      "meetings/abc-defg-hij/",
      { method: "PATCH", body: JSON.stringify({ extend_minutes: 15 }) },
      { redirectOn40x: false },
    );
    expect(fetchAPI.mock.calls[1][1].body).toBe(JSON.stringify({ title: "" }));
  });
});

describe("fetchMeetingArchive", () => {
  afterEach(() => {
    fetchAPI.mockReset();
  });

  const archive = (disposition?: string) =>
    new Response(new Blob(["zip"]), {
      status: 200,
      headers: disposition ? { "Content-Disposition": disposition } : {},
    });

  it("proves the account and lists only web links", async () => {
    fetchAPI.mockResolvedValue(
      archive('attachment; filename="reunion-2026-09-17-Point.zip"'),
    );

    const result = await fetchMeetingArchive("abc-defg-hij", {
      openIdToken: "openid",
      documents: [
        { id: "a", title: "Compte rendu", url: "https://docs.test/docs/1/" },
        { id: "b", title: "Fichier local", url: "blob:http://hub/123" },
      ],
    });

    expect(result.fileName).toBe("reunion-2026-09-17-Point.zip");
    expect(await result.blob.text()).toBe("zip");
    const [path, init, options] = fetchAPI.mock.calls[0];
    expect(path).toBe("meetings/abc-defg-hij/archive/");
    expect(options).toEqual({ redirectOn40x: false });
    expect(JSON.parse(init.body)).toEqual({
      openid_token: "openid",
      documents: [{ title: "Compte rendu", url: "https://docs.test/docs/1/" }],
      chat_name: "",
    });
  });

  it("reads an encoded file name, or falls back to the meeting", async () => {
    fetchAPI.mockResolvedValueOnce(
      archive(
        "attachment; filename=\"r.zip\"; filename*=UTF-8''r%C3%A9union.zip",
      ),
    );
    fetchAPI.mockResolvedValueOnce(archive());

    const encoded = await fetchMeetingArchive("s", { documents: [] });
    const fallback = await fetchMeetingArchive("s", { documents: [] });

    expect(encoded.fileName).toBe("réunion.zip");
    expect(fallback.fileName).toBe("meeting-s.zip");
  });
});

describe("meeting documents", () => {
  afterEach(() => {
    fetchAPI.mockReset();
  });

  const RAW = {
    id: "a1",
    name: "plan.pdf",
    size: 3,
    created_at: "2026-09-17T08:00:00+00:00",
  };
  const ATTACHMENT = {
    id: "a1",
    name: "plan.pdf",
    size: 3,
    createdAt: "2026-09-17T08:00:00+00:00",
  };

  it("lists the agenda and the documents", async () => {
    fetchAPI.mockResolvedValue(
      Response.json({ agenda: "1.", attachments: [RAW], is_closed: false }),
    );

    await expect(fetchMeetingDocuments("abc", "openid")).resolves.toEqual({
      agenda: "1.",
      attachments: [ATTACHMENT],
      isClosed: false,
    });
    expect(fetchAPI).toHaveBeenCalledWith(
      "meetings/abc/documents/",
      { method: "POST", body: JSON.stringify({ openid_token: "openid" }) },
      { redirectOn40x: false },
    );
  });

  it("sends a document as a form", async () => {
    fetchAPI.mockResolvedValue(Response.json(RAW, { status: 201 }));
    const file = new File(["pdf"], "plan.pdf");

    await expect(uploadMeetingDocument("abc", file)).resolves.toEqual(
      ATTACHMENT,
    );
    const [path, init] = fetchAPI.mock.calls[0];
    expect(path).toBe("meetings/abc/attachments/");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("openid_token")).toBe("");
    expect(((init.body as FormData).get("file") as File).name).toBe("plan.pdf");
  });

  it("downloads a document", async () => {
    fetchAPI.mockResolvedValue(new Response(new Blob(["pdf"])));

    const blob = await fetchMeetingDocumentFile("abc", "a/1", "openid");

    expect(await blob.text()).toBe("pdf");
    expect(fetchAPI.mock.calls[0][0]).toBe("meetings/abc/attachments/a%2F1/");
    expect(JSON.parse(fetchAPI.mock.calls[0][1].body)).toEqual({
      openid_token: "openid",
    });
  });
});
