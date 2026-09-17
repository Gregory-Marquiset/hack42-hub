/**
 * Encrypted attachments, as the Matrix specification defines them (v2): the
 * file is encrypted in the browser with AES-CTR before it is uploaded, and its
 * key travels in the message, which the room's encryption protects. The media
 * server only ever stores ciphertext.
 */

/** The `file` field of an encrypted attachment message. */
export type EncryptedFile = {
  v: "v2";
  url: string;
  key: {
    alg: "A256CTR";
    ext: true;
    k: string;
    key_ops: string[];
    kty: "oct";
  };
  iv: string;
  hashes: { sha256: string };
};

const toUnpaddedBase64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  array.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/=+$/, "");
};

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const normal = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

/** Encrypts a file; the caller uploads `data` and completes `info` with its URL. */
export const encryptAttachment = async (
  plaintext: ArrayBuffer,
): Promise<{ data: ArrayBuffer; info: Omit<EncryptedFile, "url"> }> => {
  const key = await crypto.subtle.generateKey(
    { name: "AES-CTR", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  // The high half of the counter block is random, the low half starts at 0.
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv.subarray(0, 8));
  const data = await crypto.subtle.encrypt(
    { name: "AES-CTR", counter: iv, length: 64 },
    key,
    plaintext,
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return {
    data,
    info: {
      v: "v2",
      key: {
        alg: "A256CTR",
        ext: true,
        k: jwk.k ?? "",
        key_ops: ["encrypt", "decrypt"],
        kty: "oct",
      },
      iv: toUnpaddedBase64(iv),
      hashes: { sha256: toUnpaddedBase64(hash) },
    },
  };
};

export class AttachmentIntegrityError extends Error {
  constructor() {
    super("The downloaded file does not match its hash.");
    this.name = "AttachmentIntegrityError";
  }
}

/** Decrypts a downloaded attachment, after checking it was not altered. */
export const decryptAttachment = async (
  ciphertext: ArrayBuffer,
  info: EncryptedFile,
): Promise<ArrayBuffer> => {
  const hash = await crypto.subtle.digest("SHA-256", ciphertext);
  if (toUnpaddedBase64(hash) !== info.hashes.sha256.replace(/=+$/, "")) {
    throw new AttachmentIntegrityError();
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "oct", k: info.key.k, alg: "A256CTR", ext: true },
    { name: "AES-CTR" },
    false,
    ["decrypt"],
  );
  return crypto.subtle.decrypt(
    { name: "AES-CTR", counter: fromBase64(info.iv), length: 64 },
    key,
    ciphertext,
  );
};
