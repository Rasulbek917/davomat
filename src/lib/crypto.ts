import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { serverEnv } from "@/lib/env";

/** Cryptographically strong opaque token, URL-safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Keyed hash used for session tokens and other high-entropy secrets.
 * HMAC (not a bare hash) so that a database leak alone is not enough to
 * brute-force or precompute tokens.
 */
export function hmacToken(token: string): string {
  return createHmac("sha256", serverEnv().SESSION_SECRET).update(token).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for third-party integration credentials at rest.
// ---------------------------------------------------------------------------

function encryptionKey(): Buffer {
  const key = Buffer.from(serverEnv().CREDENTIAL_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (base64). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return key;
}

/** Encrypt a JSON-serialisable payload. Returns `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptSecret(payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Decrypt a value produced by {@link encryptSecret}. Returns null when invalid. */
export function decryptSecret<T = unknown>(value: string | null | undefined): T | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const [, ivPart, tagPart, dataPart] = parts;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Mask a username/secret for display: "di***tor". */
export function maskHint(value: string): string {
  if (value.length <= 2) return "**";
  if (value.length <= 6) return `${value[0]}***${value[value.length - 1]}`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
