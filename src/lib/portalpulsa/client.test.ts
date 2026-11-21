import { describe, expect, it } from "vitest";
import { calculatePpobSellPrice } from "./client";

describe("portalpulsa markup pricing", () => {
  const defaultCfg = {
    smallPct: 3,
    largePct: 1,
    threshold: 100000,
  };

  it("applies +3% markup with Math.ceil for cost prices below threshold", () => {
    const res = calculatePpobSellPrice(5395, defaultCfg);
    expect(res.sellPrice).toBe(5557);
    expect(res.profit).toBe(162);
  });

  it("applies +1% markup with Math.ceil for cost prices >= threshold", () => {
    const res = calculatePpobSellPrice(100000, defaultCfg);
    expect(res.sellPrice).toBe(101000);
    expect(res.profit).toBe(1000);

    const res2 = calculatePpobSellPrice(200500, defaultCfg);
    expect(res2.sellPrice).toBe(202505);
    expect(res2.profit).toBe(2005);
  });

  it("supports custom markup settings from app_settings", () => {
    const res = calculatePpobSellPrice(20000, {
      smallPct: 5,
      largePct: 2,
      threshold: 50000,
    });
    expect(res.sellPrice).toBe(21000);
    expect(res.profit).toBe(1000);
  });
});
