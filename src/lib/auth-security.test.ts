import { describe, expect, it } from "vitest";
import {
  generateOtpCode,
  generateReadablePassword,
  hashOtpCode,
  maskTelegramTarget,
  verifyOtpHash,
} from "./auth-security";

describe("auth-security helpers", () => {
  it("generates 6-digit OTP and verifies constant-time HMAC hash", () => {
    const otp = generateOtpCode();
    expect(otp).toMatch(/^\d{6}$/);

    const challengeId = "11111111-2222-3333-4444-555555555555";
    const hash = hashOtpCode(challengeId, otp);

    expect(verifyOtpHash(challengeId, otp, hash)).toBe(true);
    expect(verifyOtpHash(challengeId, "000000", hash)).toBe(otp === "000000");
    expect(verifyOtpHash("other-id", otp, hash)).toBe(false);
  });

  it("generates strong readable password with mixed character classes", () => {
    const pw = generateReadablePassword(12);
    expect(pw).toHaveLength(12);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[2-9]/);
    expect(pw).toMatch(/[!@#$%&*]/);
    expect(pw).not.toMatch(/[0O1lI]/);
  });

  it("masks Telegram username and chat ID safely", () => {
    expect(maskTelegramTarget("agusmyn", 150377182)).toBe(
      "@ag***yn (ID ***7182)"
    );
    expect(maskTelegramTarget(null, 150377182)).toBe("ID ***7182");
  });
});
