import { describe, expect, it } from "vitest";

import {
  AttachmentIntegrityError,
  decryptAttachment,
  encryptAttachment,
} from "../matrixAttachments";

const bytes = (text: string) => new TextEncoder().encode(text).buffer;

describe("matrixAttachments", () => {
  it("encrypts a file so that only its key can read it back", async () => {
    const plaintext = bytes("ordre du jour de la réunion");

    const { data, info } = await encryptAttachment(plaintext);

    expect(new Uint8Array(data)).not.toEqual(new Uint8Array(plaintext));
    expect(info).toMatchObject({
      v: "v2",
      key: { alg: "A256CTR", kty: "oct", ext: true },
    });
    // Unpadded base64: 16 bytes of counter, the low 8 of them zero.
    expect(info.iv).toMatch(/^[A-Za-z0-9+/]{22}$/);
    expect(atob(`${info.iv}==`).slice(8)).toBe("\0".repeat(8));
    expect(info.hashes.sha256).not.toContain("=");

    const decrypted = await decryptAttachment(data, {
      ...info,
      url: "mxc://localhost/file",
    });
    expect(new TextDecoder().decode(decrypted)).toBe(
      "ordre du jour de la réunion",
    );
  });

  it("refuses a file that was altered on the server", async () => {
    const { data, info } = await encryptAttachment(bytes("contenu"));
    const altered = new Uint8Array(data);
    altered[0] ^= 1;

    await expect(
      decryptAttachment(altered.buffer, {
        ...info,
        url: "mxc://localhost/file",
      }),
    ).rejects.toBeInstanceOf(AttachmentIntegrityError);
  });
});
