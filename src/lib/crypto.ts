import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit recommended nonce for GCM
const AUTH_TAG_LENGTH = 16;
const VERSION_PREFIX = "v1";

function resolveMasterKey(keyHex?: string): Buffer {
  const raw = (keyHex ?? process.env.APP_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is not configured. Generate one with `openssl rand -hex 32`."
    );
  }

  // Accept 64-char hex key directly (32 bytes) or derive a 32-byte key via SHA-256
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (raw.length < 32) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes) or at least 32 characters."
    );
  }

  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Output format: `v1:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>`
 */
export function encryptSecret(plaintext: string, keyHex?: string): string {
  const key = resolveMasterKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/**
 * Decrypts a secret produced by `encryptSecret`.
 */
export function decryptSecret(payload: string, keyHex?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new Error("Invalid encrypted secret format.");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const key = resolveMasterKey(keyHex);
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const ciphertext = Buffer.from(dataB64, "base64url");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Corrupted encryption metadata.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Checks whether a stored string is already encrypted with our `v1:` AES-256-GCM format.
 */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === VERSION_PREFIX;
}

/**
 * Hashes an OTP / token with SHA-256 for safe database storage.
 */
export function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
