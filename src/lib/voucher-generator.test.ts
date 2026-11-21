import { describe, expect, it } from "vitest";
import {
  buildBatchCode,
  buildHotspotLoginUrl,
  buildVoucherComment,
  formatQuotaLabelMb,
  formatUptimeLabel,
  generateUniqueVouchers,
  generateVoucherCode,
  mbToBytes,
} from "./voucher-generator";

describe("voucher-generator", () => {
  it("generates codes of requested length and character class", () => {
    const numCode = generateVoucherCode(6, "1");
    expect(numCode).toMatch(/^[0-9]{6}$/);

    const upperCode = generateVoucherCode(5, "2");
    expect(upperCode).toMatch(/^[A-Z]{5}$/);

    const lowerNum = generateVoucherCode(8, "6");
    expect(lowerNum).toMatch(/^[a-z0-9]{8}$/);
  });

  it("generates unique vouchers for vc and up modes", () => {
    const vcList = generateUniqueVouchers({
      quantity: 20,
      length: 5,
      charType: "6",
      loginType: "vc",
    });
    expect(vcList).toHaveLength(20);
    expect(new Set(vcList.map((v) => v.username)).size).toBe(20);
    expect(vcList.every((v) => v.username === v.password)).toBe(true);

    const upList = generateUniqueVouchers({
      quantity: 10,
      length: 6,
      charType: "7",
      loginType: "up",
    });
    expect(upList).toHaveLength(10);
    expect(upList.some((v) => v.username !== v.password)).toBe(true);
  });

  it("formats batch code, comment, hotspot login URL, uptime, and quota accurately", () => {
    const fixedDate = new Date("2026-11-21T13:30:05Z"); // 20:30:05 WIB
    const batch = buildBatchCode(fixedDate);
    expect(batch).toMatch(/^BATCH_20261121_203005_\d{3}$/);

    const comment = buildVoucherComment({
      seller: "agusmyn",
      price: 15000,
      batchCode: batch,
      now: fixedDate,
    });
    expect(comment).toBe(`vc-bot|agusmyn|15000|21-11-2026|${batch}`);

    expect(buildHotspotLoginUrl("wifi.salikur.net", "abc", "123")).toBe(
      "http://wifi.salikur.net/login?username=abc&password=123"
    );
    expect(buildHotspotLoginUrl("https://hotspot.example.com/", "a", "b")).toBe(
      "https://hotspot.example.com/login?username=a&password=b"
    );

    expect(formatUptimeLabel("7d")).toBe("7 Hari");
    expect(formatUptimeLabel("00:00:00")).toBe("Unlimited");
    expect(formatQuotaLabelMb(10240)).toBe("10 GB");
    expect(formatQuotaLabelMb(0)).toBe("Unlimited");
    expect(mbToBytes(10)).toBe(10485760);
  });
});
