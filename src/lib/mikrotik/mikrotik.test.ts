import { describe, expect, it } from "vitest";
import {
  countUnusedHotspotVouchers,
  createMikroTikAdapter,
  detectRosMajorVersion,
  normalizeHealth,
  normalizeHotspotLog,
  normalizeMikhmonUserLog,
  normalizePingResult,
  normalizeResource,
  normalizeTracerouteResult,
} from "./adapter";
import {
  decodeWordAt,
  encodeSentence,
  encodeWordLength,
  RosBinaryApiAdapter,
} from "./ros-v6-api";
import { RosV7RestAdapter } from "./ros-v7-rest";
import { buildHotspotOnLoginScript, buildPppOnUpScript } from "./scripts";

describe("mikrotik dual ROS v6/v7 adapter", () => {
  it("encodes and decodes RouterOS binary API lengths & sentences", () => {
    for (const len of [0, 1, 127, 128, 300, 16383, 16384, 70000]) {
      const payload = "x".repeat(len);
      const buf = Buffer.concat([
        encodeWordLength(payload.length),
        Buffer.from(payload, "utf8"),
      ]);
      const decoded = decodeWordAt(buf, 0);
      expect(decoded).not.toBeNull();
      expect(decoded?.word.length).toBe(len);
      expect(decoded?.nextOffset).toBe(buf.length);
    }

    const sentence = encodeSentence(["/login", "=name=admin", "=password=secret"]);
    expect(sentence[sentence.length - 1]).toBe(0x00);
  });

  it("normalizes /system/health for both ROS v6 flat object and ROS v7 metric array", () => {
    const v6 = normalizeHealth({ temperature: "43", voltage: "24.2" });
    expect(v6.temperatureC).toBe(43);
    expect(v6.voltageV).toBe(24.2);

    const v7 = normalizeHealth([
      { name: "cpu-temperature", value: "54", type: "C" },
      { name: "voltage", value: "23.9", type: "V" },
    ]);
    expect(v7.cpuTemperatureC).toBe(54);
    expect(v7.voltageV).toBe(23.9);
    expect(v7.rawMetrics["cpu-temperature"]).toBe("54 C");
  });

  it("normalizes /system/resource and detects ROS major version", () => {
    const res7 = normalizeResource("SalikurCore", {
      version: "7.16.2 (stable)",
      "board-name": "RB5009UG+S+",
      uptime: "12d4h30m",
      "cpu-count": "4",
      "cpu-load": "15",
      "free-memory": "512000000",
      "total-memory": "1073741824",
    });

    expect(res7.detectedMajorVersion).toBe("v7");
    expect(res7.cpuCount).toBe(4);
    expect(res7.cpuLoadPct).toBe(15);
    expect(detectRosMajorVersion("6.49.17 (long-term)")).toBe("v6");
  });

  it("selects correct adapter implementation based on rosVersion & connectionMode", () => {
    const base = {
      name: "TestRouter",
      host: "192.168.88.1",
      port: 8728,
      allowSelfSignedTls: true,
      username: "admin",
      password: "secret",
      dnsName: "wifi.salikur.net",
    };

    const a1 = createMikroTikAdapter({
      ...base,
      rosVersion: "v6",
      connectionMode: "api_tcp",
    });
    expect(a1).toBeInstanceOf(RosBinaryApiAdapter);

    const a2 = createMikroTikAdapter({
      ...base,
      port: 443,
      rosVersion: "v7",
      connectionMode: "rest_api",
    });
    expect(a2).toBeInstanceOf(RosV7RestAdapter);

    const a3 = createMikroTikAdapter({
      ...base,
      port: 8729,
      rosVersion: "v7",
      connectionMode: "api_ssl",
    });
    expect(a3).toBeInstanceOf(RosBinaryApiAdapter);
  });

  it("generates distinct Hotspot on-login scripts for lockMac true vs false", () => {
    const locked = buildHotspotOnLoginScript({
      validity: "1d",
      lockMac: true,
      rosVersion: "v7",
    });
    const unlocked = buildHotspotOnLoginScript({
      validity: "1d",
      lockMac: false,
      rosVersion: "v7",
    });

    expect(locked).toContain("mac-address=$mac");
    expect(unlocked).not.toContain("mac-address=$mac");
    expect(locked).toContain("interval=1d");
    expect(unlocked).toContain("interval=1d");

    const ppp = buildPppOnUpScript({
      validity: "30d",
      expiredProfile: "isolir",
    });
    expect(ppp).toContain('profile=\\"isolir\\"');
    expect(ppp).toContain("interval=30d");
  });

  it("counts unused Hotspot vouchers accurately while excluding default-trial & disabled", () => {
    const stats = countUnusedHotspotVouchers([
      { name: "default-trial", uptime: "0s", "bytes-in": "0", "bytes-out": "0" },
      { name: "vc001", uptime: "0s", "bytes-in": "0", "bytes-out": "0", disabled: "false" },
      { name: "vc002", uptime: "", "bytes-in": "0", "bytes-out": "0", disabled: "no" },
      { name: "vc003", uptime: "12m30s", "bytes-in": "1024", "bytes-out": "2048", disabled: "false" },
      { name: "vc004", uptime: "0s", "bytes-in": "0", "bytes-out": "0", disabled: "true" },
    ]);
    expect(stats).toEqual({ unusedCount: 2, totalCount: 4 });
  });

  it("normalizes Hotspot Log and Mikhmon User Log entries accurately", () => {
    const hLog = normalizeHotspotLog({
      ".id": "*10",
      time: "22:45:10",
      topics: "hotspot,info,debug",
      message: "->: hyi3 (192.168.16.241): logged in",
    });
    expect(hLog.userIp).toBe("hyi3 (192.168.16.241)");
    expect(hLog.message).toBe("logged in");

    const uLog = normalizeMikhmonUserLog({
      ".id": "*A1",
      name: "nov/01/2026-|-00:36:53-|-hyi3-|-15000-|-192.168.16.241-|-7C:2A:DB:91:F7:D2-|-14d-|-15000-|-vc-bot",
      owner: "nov2026",
      source: "nov/01/2026",
      comment: "mikhmon",
    });
    expect(uLog).toEqual({
      id: "*A1",
      date: "nov/01/2026",
      time: "00:36:53",
      username: "hyi3",
      price: "15000",
      address: "192.168.16.241",
      macAddress: "7C:2A:DB:91:F7:D2",
      validity: "14d",
      profile: "15000",
      comment: "vc-bot",
      owner: "nov2026",
    });

    expect(
      normalizeMikhmonUserLog({ ".id": "*A2", name: "regular-script" })
    ).toBeNull();
  });

  it("normalizes Ping and Traceroute results across ROS v6/v7 snapshots", () => {
    const ping = normalizePingResult("8.8.8.8", [
      { seq: "0", host: "8.8.8.8", size: "56", ttl: "117", time: "14ms", sent: "1", received: "1", "packet-loss": "0", "min-rtt": "14ms", "avg-rtt": "14ms", "max-rtt": "14ms" },
      { seq: "1", host: "8.8.8.8", size: "56", ttl: "117", time: "16ms", sent: "2", received: "2", "packet-loss": "0", "min-rtt": "14ms", "avg-rtt": "15ms", "max-rtt": "16ms" },
    ]);
    expect(ping.sent).toBe(2);
    expect(ping.received).toBe(2);
    expect(ping.packetLossPct).toBe(0);
    expect(ping.avgRtt).toBe("15ms");

    const trace = normalizeTracerouteResult("1.1.1.1", [
      { ".section": "0", address: "10.0.0.1", loss: "0", sent: "1", last: "1.2", avg: "1.2", best: "1.2", worst: "1.2" },
      { ".section": "1", address: "10.0.0.1", loss: "0", sent: "1", last: "1.2", avg: "1.2", best: "1.2", worst: "1.2" },
      { ".section": "1", address: "1.1.1.1", loss: "0", sent: "1", last: "12.4", avg: "12.4", best: "12.4", worst: "12.4" },
    ]);
    expect(trace.hops).toHaveLength(2);
    expect(trace.hops[1].address).toBe("1.1.1.1");
    expect(trace.hops[1].hop).toBe(2);
  });
});
