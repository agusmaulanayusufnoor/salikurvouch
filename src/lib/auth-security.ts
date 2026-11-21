import crypto from "node:crypto";

const OTP_SECRET_FALLBACK = "salikurvouch-otp-hmac-fallback-dev-only";

function getHmacKey(): string {
  return process.env.APP_ENCRYPTION_KEY || OTP_SECRET_FALLBACK;
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
export function generateOtpCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Computes an HMAC-SHA256 hex digest binding `challengeId` and `otp`.
 */
export function hashOtpCode(challengeId: string, otp: string): string {
  return crypto
    .createHmac("sha256", getHmacKey())
    .update(`${challengeId}:${otp.trim()}`)
    .digest("hex");
}

/**
 * Constant-time verification of an OTP code against its stored HMAC hash.
 */
export function verifyOtpHash(
  challengeId: string,
  otp: string,
  expectedHash: string
): boolean {
  const actual = hashOtpCode(challengeId, otp);
  const aBuf = Buffer.from(actual, "hex");
  const bBuf = Buffer.from(expectedHash, "hex");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Generates a strong, human-readable password with guaranteed uppercase,
 * lowercase, digit, and symbol characters (avoiding ambiguous 0/O/1/l/I).
 */
export function generateReadablePassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;

  const chars: string[] = [
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  const targetLen = Math.max(length, 10);
  while (chars.length < targetLen) {
    chars.push(all[crypto.randomInt(0, all.length)]);
  }

  // Fisher-Yates shuffle using crypto.randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join("");
}

/**
 * Masks Telegram target details for display on unauthenticated login screens.
 */
export function maskTelegramTarget(
  username: string | null | undefined,
  chatId: number
): string {
  const idStr = String(chatId);
  const maskedId =
    idStr.length > 4 ? `***${idStr.slice(-4)}` : `***${idStr.slice(-2)}`;

  const cleanUser = (username ?? "").replace(/^@/, "").trim();
  if (!cleanUser) return `ID ${maskedId}`;

  const maskedUser =
    cleanUser.length <= 3
      ? `${cleanUser[0]}***`
      : `${cleanUser.slice(0, 2)}***${cleanUser.slice(-2)}`;

  return `@${maskedUser} (ID ${maskedId})`;
}
