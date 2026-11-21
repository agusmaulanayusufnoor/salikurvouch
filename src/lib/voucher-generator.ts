import crypto from "node:crypto";
import QRCode from "qrcode";

const CHARSETS: Record<string, string> = {
  "1": "1234567890",
  "2": "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "3": "abcdefghjkmnpqrstuvwxyz",
  "4": "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz",
  "5": "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789",
  "6": "abcdefghjkmnpqrstuvwxyz23456789",
  "7": "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
};

/**
 * Generates a cryptographically random voucher code matching Mikbotam char types 1-7.
 */
export function generateVoucherCode(length = 5, charType = "6"): string {
  const safeLen = Math.min(Math.max(Math.round(length) || 5, 3), 16);
  const charset = CHARSETS[charType] ?? CHARSETS["6"];
  let code = "";
  for (let i = 0; i < safeLen; i++) {
    code += charset[crypto.randomInt(0, charset.length)];
  }
  return code;
}

/**
 * Generates N unique voucher credentials (`vc`: username=password, `up`: separate).
 */
export function generateUniqueVouchers(params: {
  quantity: number;
  length: number;
  charType: string;
  loginType: "vc" | "up";
  prefix?: string;
}): Array<{ username: string; password: string }> {
  const qty = Math.min(Math.max(params.quantity, 1), 100);
  const prefix = (params.prefix ?? "").trim();
  const seen = new Set<string>();
  const results: Array<{ username: string; password: string }> = [];

  let guard = 0;
  while (results.length < qty && guard < qty * 20) {
    guard++;
    const username = `${prefix}${generateVoucherCode(params.length, params.charType)}`;
    if (seen.has(username)) continue;
    seen.add(username);
    const password =
      params.loginType === "up"
        ? generateVoucherCode(params.length, params.charType)
        : username;
    results.push({ username, password });
  }

  return results;
}

export function buildBatchCode(now = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  // WIB (+07:00)
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = pad(wib.getUTCMonth() + 1);
  const d = pad(wib.getUTCDate());
  const hh = pad(wib.getUTCHours());
  const mm = pad(wib.getUTCMinutes());
  const ss = pad(wib.getUTCSeconds());
  const rand = pad(crypto.randomInt(100, 1000), 3);
  return `BATCH_${y}${m}${d}_${hh}${mm}${ss}_${rand}`;
}

export function buildVoucherComment(params: {
  seller: string;
  price: number;
  batchCode?: string;
  now?: Date;
}): string {
  const wib = new Date((params.now ?? new Date()).getTime() + 7 * 60 * 60 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = wib.getUTCFullYear();
  const seller = params.seller.replace(/[|\s]/g, "_") || "admin";
  const parts = ["vc-bot", seller, String(Math.round(params.price)), `${dd}-${mm}-${yyyy}`];
  if (params.batchCode) parts.push(params.batchCode);
  return parts.join("|");
}

export function normalizeHotspotDnsUrl(dnsName: string): string {
  const trimmed = dnsName.trim().replace(/\/+$/, "");
  if (!trimmed) return "http://wifi.salikur.net";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function buildHotspotLoginUrl(
  dnsName: string,
  username: string,
  password: string
): string {
  const base = normalizeHotspotDnsUrl(dnsName);
  const q = new URLSearchParams({ username, password });
  return `${base}/login?${q.toString()}`;
}

export function formatUptimeLabel(limitUptime?: string | null): string {
  const raw = (limitUptime ?? "").trim().toLowerCase();
  if (!raw || raw === "0" || raw === "00:00:00" || raw === "unlimited") {
    return "Unlimited";
  }
  const match = raw.match(/^(\d+)([wdhm])$/);
  if (!match) return raw;
  const num = Number(match[1]);
  const unit = match[2];
  if (unit === "w") return `${num} Minggu`;
  if (unit === "d") return `${num} Hari`;
  if (unit === "h") return `${num} Jam`;
  if (unit === "m") return `${num} Menit`;
  return raw;
}

export function formatQuotaLabelMb(mb?: number | null): string {
  if (!mb || mb <= 0) return "Unlimited";
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

export function mbToBytes(mb?: number | null): number {
  if (!mb || mb <= 0) return 0;
  return Math.round(mb * 1024 * 1024);
}

export async function generateQrDataUrl(
  text: string,
  darkHex = "#000000"
): Promise<string> {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(darkHex) ? darkHex : "#000000";
  return QRCode.toDataURL(text, {
    width: 240,
    margin: 1,
    color: {
      dark: safeHex,
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

export async function generateQrPngBuffer(
  text: string,
  darkHex = "#000000"
): Promise<Buffer> {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(darkHex) ? darkHex : "#000000";
  return QRCode.toBuffer(text, {
    type: "png",
    width: 320,
    margin: 2,
    color: {
      dark: safeHex,
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}
