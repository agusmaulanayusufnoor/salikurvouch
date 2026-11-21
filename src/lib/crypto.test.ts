import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  isEncryptedSecret,
} from "./crypto";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("crypto (AES-256-GCM)", () => {
  it("encrypts and decrypts secrets round-trip", () => {
    const original = "MikroTik!Super$ecret#2026";
    const encrypted = encryptSecret(original, TEST_KEY);

    expect(encrypted).not.toContain(original);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(decryptSecret(encrypted, TEST_KEY)).toBe(original);
  });

  it("uses a unique random IV for each encryption", () => {
    const a = encryptSecret("same-secret", TEST_KEY);
    const b = encryptSecret("same-secret", TEST_KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, TEST_KEY)).toBe("same-secret");
    expect(decryptSecret(b, TEST_KEY)).toBe("same-secret");
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("sensitive-token", TEST_KEY);
    const parts = encrypted.split(":");
    parts[3] = parts[3].slice(0, -2) + "AA";
    expect(() => decryptSecret(parts.join(":"), TEST_KEY)).toThrow();
  });

  it("rejects wrong master key", () => {
    const encrypted = encryptSecret("sensitive-token", TEST_KEY);
    const otherKey =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    expect(() => decryptSecret(encrypted, otherKey)).toThrow();
  });

  it("hashes OTP tokens deterministically", () => {
    const hash1 = hashToken("12345678");
    const hash2 = hashToken("12345678");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
