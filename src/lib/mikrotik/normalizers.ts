import type {
  DhcpLease,
  HotspotActiveSession,
  HotspotIpBinding,
  HotspotLogEntry,
  HotspotProfile,
  HotspotServer,
  HotspotUser,
  IpBindingType,
  MikhmonUserLogEntry,
  NetwatchHost,
  PingReplyRow,
  PingResult,
  PppActiveSession,
  PppProfile,
  PppSecret,
  RosVersion,
  RouterHealth,
  RouterInterface,
  RouterSystemResource,
  TracerouteHopRow,
  TracerouteResult,
} from "./types";

export type RawRecord = Record<string, unknown>;

export function parseBool(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  const s = String(val ?? "").toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}

export function parseNumber(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = String(val ?? "").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const cleaned = String(val).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function detectRosMajorVersion(version: string): RosVersion | "unknown" {
  const trimmed = version.trim();
  if (trimmed.startsWith("7.")) return "v7";
  if (trimmed.startsWith("6.")) return "v6";
  return "unknown";
}

/**
 * Normalizes `/system/resource` across ROS v6 & v7.
 */
export function normalizeResource(
  identity: string,
  raw: RawRecord
): RouterSystemResource {
  const version = String(raw.version ?? "");
  return {
    identity: identity || "MikroTik",
    version,
    detectedMajorVersion: detectRosMajorVersion(version),
    boardName: String(raw["board-name"] ?? raw.platform ?? ""),
    platform: String(raw.platform ?? ""),
    architectureName: String(raw["architecture-name"] ?? ""),
    uptime: String(raw.uptime ?? ""),
    cpu: String(raw.cpu ?? ""),
    cpuCount: parseNumber(raw["cpu-count"]),
    cpuFrequencyMhz: parseNumber(raw["cpu-frequency"]),
    cpuLoadPct: parseNumber(raw["cpu-load"]),
    freeMemoryBytes: parseNumber(raw["free-memory"]),
    totalMemoryBytes: parseNumber(raw["total-memory"]),
    freeHddBytes: parseNumber(raw["free-hdd-space"]),
    totalHddBytes: parseNumber(raw["total-hdd-space"]),
    badBlocksPct: parseNumber(raw["bad-blocks"]),
  };
}

/**
 * Normalizes `/system/health` across:
 * - ROS v6 flat object: `{ temperature: "42", voltage: "24.1" }`
 * - ROS v7 array of `{ name, value, type }`: `[{ name: "cpu-temperature", value: "51", type: "C" }, ...]`
 */
export function normalizeHealth(
  raw: RawRecord | RawRecord[] | undefined | null
): RouterHealth {
  const rawMetrics: Record<string, string> = {};
  let temperatureC: number | null = null;
  let cpuTemperatureC: number | null = null;
  let voltageV: number | null = null;

  if (!raw) {
    return { temperatureC, cpuTemperatureC, voltageV, rawMetrics };
  }

  const items = Array.isArray(raw) ? raw : [raw];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    // ROS v7 metric row format: { name: "temperature", value: "44", type: "C" }
    if ("name" in item && "value" in item) {
      const key = String(item.name ?? "").toLowerCase();
      const val = String(item.value ?? "");
      const unit = item.type ? String(item.type) : "";
      rawMetrics[key] = unit ? `${val} ${unit}` : val;

      if (key === "temperature" || key === "board-temperature1") {
        temperatureC = parseNullableNumber(val);
      } else if (key === "cpu-temperature" || key === "phy-temperature") {
        cpuTemperatureC = parseNullableNumber(val);
      } else if (key === "voltage") {
        voltageV = parseNullableNumber(val);
      }
      continue;
    }

    // ROS v6 flat object format
    for (const [k, v] of Object.entries(item)) {
      if (v === undefined || v === null) continue;
      const lower = k.toLowerCase();
      rawMetrics[lower] = String(v);
      if (lower === "temperature") {
        temperatureC = parseNullableNumber(v);
      } else if (lower === "cpu-temperature") {
        cpuTemperatureC = parseNullableNumber(v);
      } else if (lower === "voltage") {
        voltageV = parseNullableNumber(v);
      }
    }
  }

  return { temperatureC, cpuTemperatureC, voltageV, rawMetrics };
}

export function normalizeHotspotServer(raw: RawRecord): HotspotServer {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    interfaceName: String(raw.interface ?? ""),
    profile: String(raw.profile ?? ""),
    disabled: parseBool(raw.disabled),
  };
}

export function normalizeHotspotProfile(raw: RawRecord): HotspotProfile {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    rateLimit: String(raw["rate-limit"] ?? ""),
    sharedUsers: String(raw["shared-users"] ?? "1"),
    sessionTimeout: String(raw["session-timeout"] ?? ""),
    parentQueue: String(raw["parent-queue"] ?? ""),
    transparentProxy: parseBool(raw["transparent-proxy"]),
    onLogin: String(raw["on-login"] ?? ""),
  };
}

export function normalizeHotspotUser(raw: RawRecord): HotspotUser {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    password: String(raw.password ?? ""),
    profile: String(raw.profile ?? ""),
    server: String(raw.server ?? "all"),
    macAddress: String(raw["mac-address"] ?? ""),
    limitUptime: String(raw["limit-uptime"] ?? ""),
    uptime: String(raw.uptime ?? "0s"),
    limitBytesTotal: parseNumber(raw["limit-bytes-total"]),
    bytesIn: parseNumber(raw["bytes-in"]),
    bytesOut: parseNumber(raw["bytes-out"]),
    comment: String(raw.comment ?? ""),
    disabled: parseBool(raw.disabled),
  };
}

/**
 * Counts unused Hotspot vouchers (excludes `default-trial` and disabled users).
 * A voucher is unused when uptime is 0s/empty and bytes-in/out are both 0.
 */
export function countUnusedHotspotVouchers(rawRows: RawRecord[]): {
  unusedCount: number;
  totalCount: number;
} {
  let totalCount = 0;
  let unusedCount = 0;

  for (const raw of rawRows) {
    const name = String(raw.name ?? "").trim();
    if (!name || name === "default-trial") continue;

    totalCount++;
    const disabled = parseBool(raw.disabled);
    if (disabled) continue;

    const uptime = String(raw.uptime ?? "").trim().toLowerCase();
    const bytesIn = parseNumber(raw["bytes-in"]);
    const bytesOut = parseNumber(raw["bytes-out"]);
    const noUptime = !uptime || uptime === "0s" || uptime === "00:00:00";

    if (noUptime && bytesIn === 0 && bytesOut === 0) {
      unusedCount++;
    }
  }

  return { unusedCount, totalCount };
}

export function normalizeHotspotActive(raw: RawRecord): HotspotActiveSession {
  return {
    id: String(raw[".id"] ?? ""),
    user: String(raw.user ?? ""),
    address: String(raw.address ?? ""),
    macAddress: String(raw["mac-address"] ?? ""),
    server: String(raw.server ?? ""),
    uptime: String(raw.uptime ?? ""),
    sessionTimeLeft: String(raw["session-time-left"] ?? ""),
    loginBy: String(raw["login-by"] ?? ""),
    bytesIn: parseNumber(raw["bytes-in"]),
    bytesOut: parseNumber(raw["bytes-out"]),
    comment: String(raw.comment ?? ""),
  };
}

export function normalizePppSecret(raw: RawRecord): PppSecret {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    password: String(raw.password ?? ""),
    service: String(raw.service ?? "any"),
    profile: String(raw.profile ?? ""),
    localAddress: String(raw["local-address"] ?? ""),
    remoteAddress: String(raw["remote-address"] ?? ""),
    comment: String(raw.comment ?? ""),
    disabled: parseBool(raw.disabled),
  };
}

export function normalizePppActive(raw: RawRecord): PppActiveSession {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    service: String(raw.service ?? ""),
    callerId: String(raw["caller-id"] ?? ""),
    address: String(raw.address ?? ""),
    uptime: String(raw.uptime ?? ""),
    comment: String(raw.comment ?? ""),
  };
}

export function normalizePppProfile(raw: RawRecord): PppProfile {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    localAddress: String(raw["local-address"] ?? ""),
    remoteAddress: String(raw["remote-address"] ?? ""),
    dnsServer: String(raw["dns-server"] ?? ""),
    rateLimit: String(raw["rate-limit"] ?? ""),
    parentQueue: String(raw["parent-queue"] ?? ""),
    comment: String(raw.comment ?? ""),
    onUp: String(raw["on-up"] ?? ""),
  };
}

export function normalizeInterface(raw: RawRecord): RouterInterface {
  return {
    id: String(raw[".id"] ?? ""),
    name: String(raw.name ?? ""),
    type: String(raw.type ?? ""),
    running: parseBool(raw.running),
    disabled: parseBool(raw.disabled),
    rxBytes: parseNumber(raw["rx-byte"]),
    txBytes: parseNumber(raw["tx-byte"]),
  };
}

export function normalizeNetwatch(raw: RawRecord): NetwatchHost {
  return {
    id: String(raw[".id"] ?? ""),
    host: String(raw.host ?? ""),
    comment: String(raw.comment ?? ""),
    status: String(raw.status ?? "unknown"),
    since: String(raw.since ?? ""),
    interval: String(raw.interval ?? ""),
    disabled: parseBool(raw.disabled),
  };
}

/**
 * Normalizes a `/log` row for Hotspot Log (Mikhmon-style User (IP) + Message split).
 */
export function normalizeHotspotLog(raw: RawRecord): HotspotLogEntry {
  const rawMessage = String(raw.message ?? "").trim();
  // Strip optional RouterOS prefix like "->: "
  const cleaned = rawMessage.replace(/^->:\s*/, "");

  let userIp = "-";
  let message = cleaned;

  const parenMatch = cleaned.match(/^([^\s:]+(?:\s*\([^)]+\))):\s*(.+)$/);
  if (parenMatch) {
    userIp = parenMatch[1].trim();
    message = parenMatch[2].trim();
  } else {
    const colonIdx = cleaned.indexOf(": ");
    if (colonIdx > 0 && colonIdx < 64) {
      userIp = cleaned.slice(0, colonIdx).trim();
      message = cleaned.slice(colonIdx + 2).trim();
    }
  }

  return {
    id: String(raw[".id"] ?? ""),
    time: String(raw.time ?? ""),
    topics: String(raw.topics ?? ""),
    userIp,
    message,
    rawMessage,
  };
}

/**
 * Normalizes a Mikhmon User Log stored in `/system/script`.
 * Mikhmon script name format:
 *   date-|-time-|-username-|-price-|-ip-|-mac-|-validity-|-profile-|-comment
 * Returns `null` if the script is not a Mikhmon user log entry.
 */
export function normalizeMikhmonUserLog(
  raw: RawRecord
): MikhmonUserLogEntry | null {
  const name = String(raw.name ?? "");
  if (!name.includes("-|-")) return null;

  const parts = name.split("-|-");
  const date = (parts[0] || String(raw.source ?? "")).trim();
  const time = (parts[1] || "").trim();
  const username = (parts[2] || "").trim();
  const price = (parts[3] || "").trim();
  const address = (parts[4] || "").trim();
  const macAddress = (parts[5] || "").trim();
  const validity = (parts[6] || "").trim();
  const profile = (parts[7] || "").trim();
  const comment = (parts[8] || "").trim();

  if (!username && !date) return null;

  return {
    id: String(raw[".id"] ?? ""),
    date,
    time,
    username,
    price,
    address,
    macAddress,
    validity,
    profile,
    comment,
    owner: String(raw.owner ?? ""),
  };
}

/**
 * Normalizes RouterOS `/ping` output rows (ROS v6 & v7).
 */
export function normalizePingResult(
  target: string,
  rawRows: RawRecord[]
): PingResult {
  const replies: PingReplyRow[] = rawRows.map((row, idx) => ({
    seq: row.seq !== undefined ? parseNumber(row.seq) : idx,
    host: String(row.host ?? target),
    size: String(row.size ?? ""),
    ttl: String(row.ttl ?? ""),
    time: String(row.time ?? ""),
    status: String(row.status ?? (row.time ? "ok" : "timeout")),
  }));

  const last = rawRows[rawRows.length - 1] ?? {};
  const sent =
    last.sent !== undefined ? parseNumber(last.sent) : replies.length;
  const received =
    last.received !== undefined
      ? parseNumber(last.received)
      : replies.filter((r) => r.status === "ok" || Boolean(r.time)).length;
  const packetLossPct =
    last["packet-loss"] !== undefined
      ? parseNumber(last["packet-loss"])
      : sent > 0
        ? Math.round(((sent - received) / sent) * 100)
        : 0;

  return {
    target,
    replies,
    sent,
    received,
    packetLossPct,
    minRtt: String(last["min-rtt"] ?? ""),
    avgRtt: String(last["avg-rtt"] ?? ""),
    maxRtt: String(last["max-rtt"] ?? ""),
  };
}

/**
 * Normalizes RouterOS `/tool/traceroute` output rows (ROS v6 & v7).
 * RouterOS often streams incremental `.section` snapshots; when present,
 * we take only the final snapshot so each hop appears once.
 */
export function normalizeTracerouteResult(
  target: string,
  rawRows: RawRecord[]
): TracerouteResult {
  let finalRows = rawRows;
  const hasSection = rawRows.some(
    (r) => r[".section"] !== undefined && String(r[".section"]).trim() !== ""
  );
  if (hasSection) {
    let maxSection = -1;
    for (const r of rawRows) {
      const sec = parseNumber(r[".section"]);
      if (sec > maxSection) maxSection = sec;
    }
    finalRows = rawRows.filter((r) => parseNumber(r[".section"]) === maxSection);
  }

  const hops: TracerouteHopRow[] = finalRows.map((row, idx) => {
    const address = String(row.address ?? "").trim();
    const lossRaw = String(row.loss ?? "").replace(/%$/, "").trim();
    const last = String(row.last ?? "").trim();
    const status = String(
      row.status ?? (!address && (!last || last === "timeout") ? "timeout" : "")
    ).trim();

    return {
      hop: idx + 1,
      address: address || "*",
      lossPct: lossRaw ? `${lossRaw}%` : "-",
      sent: String(row.sent ?? "1"),
      last: last || "-",
      avg: String(row.avg ?? "-"),
      best: String(row.best ?? "-"),
      worst: String(row.worst ?? "-"),
      status,
    };
  });

  return { target, hops };
}

export function normalizeDhcpLease(raw: RawRecord): DhcpLease {
  return {
    id: String(raw[".id"] ?? ""),
    address: String(raw.address ?? raw["active-address"] ?? ""),
    macAddress: String(raw["mac-address"] ?? raw["active-mac-address"] ?? ""),
    hostName: String(raw["host-name"] ?? ""),
    server: String(raw.server ?? raw["active-server"] ?? ""),
    status: String(raw.status ?? ""),
    expiresAfter: String(raw["expires-after"] ?? ""),
    lastSeen: String(raw["last-seen"] ?? ""),
    activeAddress: String(raw["active-address"] ?? ""),
    comment: String(raw.comment ?? ""),
    dynamic: parseBool(raw.dynamic),
    disabled: parseBool(raw.disabled),
  };
}

export function normalizeHotspotIpBinding(raw: RawRecord): HotspotIpBinding {
  const rawType = String(raw.type ?? "regular").toLowerCase();
  const type: IpBindingType =
    rawType === "bypassed" || rawType === "blocked" ? rawType : "regular";
  return {
    id: String(raw[".id"] ?? ""),
    macAddress: String(raw["mac-address"] ?? ""),
    address: String(raw.address ?? ""),
    toAddress: String(raw["to-address"] ?? ""),
    server: String(raw.server ?? "all"),
    type,
    comment: String(raw.comment ?? ""),
    disabled: parseBool(raw.disabled),
  };
}
