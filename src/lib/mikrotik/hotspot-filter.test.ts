import { describe, expect, it } from "vitest";
import type { HotspotUser } from "./types";
import {
  filterHotspotUsers,
  formatBytesLimitLabel,
  isUnusedVoucher,
  parseCommentVoucherPrice,
} from "./hotspot-filter";

function makeUser(overrides: Partial<HotspotUser> = {}): HotspotUser {
  return {
    id: "*1",
    name: "abc12",
    password: "abc12",
    profile: "3000",
    server: "all",
    macAddress: "",
    limitUptime: "1d",
    uptime: "0s",
    limitBytesTotal: 0,
    bytesIn: 0,
    bytesOut: 0,
    comment: "vc-bot|agusmyn|3000|24-11-2026",
    disabled: false,
    ...overrides,
  };
}

describe("hotspot-filter", () => {
  it("detects unused vs used vs disabled vouchers accurately", () => {
    expect(isUnusedVoucher(makeUser())).toBe(true);
    expect(isUnusedVoucher(makeUser({ uptime: "00:00:00" }))).toBe(true);
    expect(isUnusedVoucher(makeUser({ uptime: "5m", bytesOut: 1024 }))).toBe(
      false
    );
    expect(isUnusedVoucher(makeUser({ disabled: true }))).toBe(false);
    expect(isUnusedVoucher(makeUser({ name: "default-trial" }))).toBe(false);
  });

  it("filters by comment, profile, usage, and search query", () => {
    const users: HotspotUser[] = [
      makeUser({ id: "*1", name: "u1", comment: "BATCH_A", profile: "3000" }),
      makeUser({ id: "*2", name: "u2", comment: "BATCH_A", profile: "5000" }),
      makeUser({
        id: "*3",
        name: "u3",
        comment: "BATCH_B",
        profile: "3000",
        uptime: "10m",
        bytesIn: 500,
      }),
      makeUser({
        id: "*4",
        name: "u4",
        comment: "BATCH_A",
        profile: "3000",
        disabled: true,
      }),
    ];

    expect(
      filterHotspotUsers(users, { comment: "BATCH_A" }).map((u) => u.id)
    ).toEqual(["*1", "*2", "*4"]);

    expect(
      filterHotspotUsers(users, {
        comment: "BATCH_A",
        profile: "3000",
        usage: "unused",
      }).map((u) => u.id)
    ).toEqual(["*1"]);

    expect(
      filterHotspotUsers(users, { search: "batch_b" }).map((u) => u.id)
    ).toEqual(["*3"]);
  });

  it("parses price from vc-bot comment and formats byte limit", () => {
    expect(parseCommentVoucherPrice("vc-bot|Goessmyn|5000|24-09-2025")).toBe(
      5000
    );
    expect(parseCommentVoucherPrice("custom-note")).toBe(0);
    expect(formatBytesLimitLabel(0)).toBe("Unlimited");
    expect(formatBytesLimitLabel(500 * 1024 * 1024)).toBe("500 MB");
    expect(formatBytesLimitLabel(2 * 1024 * 1024 * 1024)).toBe("2 GB");
  });
});
