import http from "node:http";
import https from "node:https";
import type {
  CreateHotspotIpBindingInput,
  CreateHotspotProfileInput,
  CreateHotspotUserInput,
  CreatePppProfileInput,
  CreatePppSecretInput,
  DhcpLease,
  HotspotActiveSession,
  HotspotIpBinding,
  HotspotLogEntry,
  HotspotProfile,
  HotspotServer,
  HotspotUser,
  InterfaceTraffic,
  MikhmonUserLogEntry,
  MikhmonUserLogQuery,
  MikroTikAdapter,
  NetwatchHost,
  PingOptions,
  PingResult,
  PppActiveSession,
  PppProfile,
  PppSecret,
  RouterConfig,
  RouterInterface,
  RouterStatusSnapshot,
  TestConnectionResult,
  TracerouteOptions,
  TracerouteResult,
} from "./types";
import {
  countUnusedHotspotVouchers,
  normalizeDhcpLease,
  normalizeHealth,
  normalizeHotspotActive,
  normalizeHotspotIpBinding,
  normalizeHotspotLog,
  normalizeHotspotProfile,
  normalizeHotspotServer,
  normalizeHotspotUser,
  normalizeInterface,
  normalizeMikhmonUserLog,
  normalizeNetwatch,
  normalizePingResult,
  normalizePppActive,
  normalizePppProfile,
  normalizePppSecret,
  normalizeResource,
  normalizeTracerouteResult,
  parseNumber,
  type RawRecord,
} from "./normalizers";

/**
 * RouterOS v7 Native REST API Adapter (`https://<host>:<port>/rest/...`).
 * Uses Node.js https/http directly so `allowSelfSignedTls` is scoped per request.
 */
export class RosV7RestAdapter implements MikroTikAdapter {
  constructor(public readonly config: RouterConfig) {}

  private request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    restPath: string,
    body?: Record<string, unknown>,
    timeoutOverrideMs?: number
  ): Promise<T> {
    const cleanPath = restPath.startsWith("/") ? restPath : `/${restPath}`;
    const port = this.config.port || 443;
    // Allow plain HTTP only if host explicitly starts with http:// or port === 80
    const isPlainHttp =
      this.config.host.startsWith("http://") || port === 80;
    const hostname = this.config.host.replace(/^https?:\/\//i, "");
    const authHeader = `Basic ${Buffer.from(
      `${this.config.username}:${this.config.password}`,
      "utf8"
    ).toString("base64")}`;

    const payload = body ? JSON.stringify(body) : undefined;
    const timeoutMs = timeoutOverrideMs ?? this.config.readTimeoutMs ?? 8000;

    return new Promise<T>((resolve, reject) => {
      const headers: Record<string, string | number> = {
        Authorization: authHeader,
        Accept: "application/json",
      };
      if (payload) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(payload);
      }

      const client = isPlainHttp ? http : https;
      const req = client.request(
        {
          hostname,
          port,
          path: `/rest${cleanPath}`,
          method,
          headers,
          timeout: timeoutMs,
          ...(isPlainHttp
            ? {}
            : { rejectUnauthorized: !this.config.allowSelfSignedTls }),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const rawText = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode ?? 0;

            if (status < 200 || status >= 300) {
              let detail = rawText;
              try {
                const parsed = JSON.parse(rawText) as {
                  detail?: string;
                  message?: string;
                };
                detail = parsed.detail || parsed.message || rawText;
              } catch {
                // keep rawText
              }
              reject(
                new Error(
                  `RouterOS v7 REST error (${status} ${cleanPath}): ${detail}`
                )
              );
              return;
            }

            if (!rawText.trim()) {
              resolve(undefined as T);
              return;
            }

            try {
              resolve(JSON.parse(rawText) as T);
            } catch (err) {
              reject(
                new Error(
                  `Invalid JSON from RouterOS v7 REST (${cleanPath}): ${err instanceof Error ? err.message : String(err)}`
                )
              );
            }
          });
        }
      );

      req.on("timeout", () => {
        req.destroy(
          new Error(
            `RouterOS v7 REST timeout (${timeoutMs}ms) ke ${hostname}:${port}`
          )
        );
      });
      req.on("error", (err) => {
        reject(new Error(`RouterOS v7 REST error: ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async testConnection(): Promise<TestConnectionResult> {
    const started = Date.now();
    try {
      const [idObj, resObj, healthRaw] = await Promise.all([
        this.request<RawRecord>("GET", "/system/identity"),
        this.request<RawRecord>("GET", "/system/resource"),
        this.request<RawRecord | RawRecord[]>("GET", "/system/health").catch(
          () => []
        ),
      ]);

      const resource = normalizeResource(
        String(idObj?.name ?? this.config.name),
        resObj ?? {}
      );
      const health = normalizeHealth(healthRaw);

      return {
        ok: true,
        latencyMs: Date.now() - started,
        identity: resource.identity,
        version: resource.version,
        detectedMajorVersion: resource.detectedMajorVersion,
        boardName: resource.boardName,
        uptime: resource.uptime,
        temperatureC: health.temperatureC ?? health.cpuTemperatureC,
        connectionMode: this.config.connectionMode,
        configuredRosVersion: this.config.rosVersion,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        connectionMode: this.config.connectionMode,
        configuredRosVersion: this.config.rosVersion,
        error: err instanceof Error ? err.message : "Gagal terhubung ke router",
      };
    }
  }

  async getSystemStatus(): Promise<RouterStatusSnapshot> {
    const started = Date.now();
    const [idObj, resObj, healthRaw, activeList, usersList, neighborList] =
      await Promise.all([
        this.request<RawRecord>("GET", "/system/identity"),
        this.request<RawRecord>("GET", "/system/resource"),
        this.request<RawRecord | RawRecord[]>("GET", "/system/health").catch(
          () => []
        ),
        this.request<RawRecord[]>("GET", "/ip/hotspot/active").catch(() => []),
        this.request<RawRecord[]>("GET", "/ip/hotspot/user").catch(() => []),
        this.request<RawRecord[]>("GET", "/ip/neighbor").catch(() => []),
      ]);

    const voucherStats = countUnusedHotspotVouchers(
      Array.isArray(usersList) ? usersList : []
    );

    return {
      resource: normalizeResource(
        String(idObj?.name ?? this.config.name),
        resObj ?? {}
      ),
      health: normalizeHealth(healthRaw),
      hotspotActiveCount: Array.isArray(activeList) ? activeList.length : 0,
      unusedVoucherCount: voucherStats.unusedCount,
      totalHotspotUsersCount: voucherStats.totalCount,
      neighborCount: Array.isArray(neighborList) ? neighborList.length : 0,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  }

  async listHotspotServers(): Promise<HotspotServer[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ip/hotspot");
    return (Array.isArray(rows) ? rows : []).map(normalizeHotspotServer);
  }

  async listHotspotProfiles(): Promise<HotspotProfile[]> {
    const rows = await this.request<RawRecord[]>(
      "GET",
      "/ip/hotspot/user/profile"
    );
    return (Array.isArray(rows) ? rows : []).map(normalizeHotspotProfile);
  }

  async addHotspotProfile(input: CreateHotspotProfileInput): Promise<string> {
    const payload: Record<string, unknown> = {
      name: input.name,
      "shared-users": input.sharedUsers || "1",
      "transparent-proxy": input.transparentProxy ? "true" : "false",
    };
    if (input.rateLimit) payload["rate-limit"] = input.rateLimit;
    if (input.parentQueue && input.parentQueue !== "none") {
      payload["parent-queue"] = input.parentQueue;
    }
    if (input.onLogin) payload["on-login"] = input.onLogin;

    const res = await this.request<RawRecord>(
      "PUT",
      "/ip/hotspot/user/profile",
      payload
    );
    return String(res?.[".id"] ?? res?.ret ?? "");
  }

  async removeHotspotProfile(id: string): Promise<void> {
    await this.request(
      "DELETE",
      `/ip/hotspot/user/profile/${encodeURIComponent(id)}`
    );
  }

  async listHotspotUsers(): Promise<HotspotUser[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ip/hotspot/user");
    return (Array.isArray(rows) ? rows : []).map(normalizeHotspotUser);
  }

  async addHotspotUser(input: CreateHotspotUserInput): Promise<string> {
    const payload: Record<string, unknown> = {
      server: input.server || "all",
      name: input.name,
      password: input.password,
      profile: input.profile,
      disabled: input.disabled ? "true" : "false",
    };
    if (input.macAddress) {
      payload["mac-address"] = input.macAddress;
    }
    if (input.limitUptime && input.limitUptime !== "00:00:00") {
      payload["limit-uptime"] = input.limitUptime;
    }
    if (input.limitBytesIn && input.limitBytesIn > 0) {
      payload["limit-bytes-in"] = String(input.limitBytesIn);
    }
    if (input.limitBytesOut && input.limitBytesOut > 0) {
      payload["limit-bytes-out"] = String(input.limitBytesOut);
    }
    if (input.limitBytesTotal && input.limitBytesTotal > 0) {
      payload["limit-bytes-total"] = String(input.limitBytesTotal);
    }
    if (input.comment) payload.comment = input.comment;

    const res = await this.request<RawRecord>(
      "PUT",
      "/ip/hotspot/user",
      payload
    );
    return String(res?.[".id"] ?? res?.ret ?? "");
  }

  async updateHotspotUser(
    id: string,
    patch: Partial<CreateHotspotUserInput>
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.password !== undefined) payload.password = patch.password;
    if (patch.profile !== undefined) payload.profile = patch.profile;
    if (patch.server !== undefined) payload.server = patch.server;
    if (patch.macAddress !== undefined)
      payload["mac-address"] = patch.macAddress;
    if (patch.limitUptime !== undefined)
      payload["limit-uptime"] = patch.limitUptime;
    if (patch.limitBytesTotal !== undefined)
      payload["limit-bytes-total"] = String(patch.limitBytesTotal);
    if (patch.comment !== undefined) payload.comment = patch.comment;
    if (patch.disabled !== undefined) {
      payload.disabled = patch.disabled ? "true" : "false";
    }
    await this.request(
      "PATCH",
      `/ip/hotspot/user/${encodeURIComponent(id)}`,
      payload
    );
  }

  async removeHotspotUser(id: string): Promise<void> {
    await this.request(
      "DELETE",
      `/ip/hotspot/user/${encodeURIComponent(id)}`
    );
  }

  async resetHotspotUserCounters(id: string): Promise<void> {
    await this.request("POST", "/ip/hotspot/user/reset-counters", {
      numbers: id,
    });
  }

  async listHotspotActive(): Promise<HotspotActiveSession[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ip/hotspot/active");
    return (Array.isArray(rows) ? rows : []).map(normalizeHotspotActive);
  }

  async kickHotspotActive(id: string): Promise<void> {
    await this.request(
      "DELETE",
      `/ip/hotspot/active/${encodeURIComponent(id)}`
    );
  }

  async listPppSecrets(): Promise<PppSecret[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ppp/secret");
    return (Array.isArray(rows) ? rows : []).map(normalizePppSecret);
  }

  async addPppSecret(input: CreatePppSecretInput): Promise<string> {
    const payload: Record<string, unknown> = {
      name: input.name,
      password: input.password,
      service: input.service || "any",
      profile: input.profile || "default",
      disabled: input.disabled ? "true" : "false",
    };
    if (input.localAddress) payload["local-address"] = input.localAddress;
    if (input.remoteAddress) payload["remote-address"] = input.remoteAddress;
    if (input.comment) payload.comment = input.comment;

    const res = await this.request<RawRecord>("PUT", "/ppp/secret", payload);
    return String(res?.[".id"] ?? res?.ret ?? "");
  }

  async updatePppSecret(
    id: string,
    patch: Partial<CreatePppSecretInput>
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.password !== undefined) payload.password = patch.password;
    if (patch.service !== undefined) payload.service = patch.service;
    if (patch.profile !== undefined) payload.profile = patch.profile;
    if (patch.localAddress !== undefined)
      payload["local-address"] = patch.localAddress;
    if (patch.remoteAddress !== undefined)
      payload["remote-address"] = patch.remoteAddress;
    if (patch.comment !== undefined) payload.comment = patch.comment;
    if (patch.disabled !== undefined) {
      payload.disabled = patch.disabled ? "true" : "false";
    }
    await this.request(
      "PATCH",
      `/ppp/secret/${encodeURIComponent(id)}`,
      payload
    );
  }

  async removePppSecret(id: string): Promise<void> {
    await this.request("DELETE", `/ppp/secret/${encodeURIComponent(id)}`);
  }

  async listPppActive(): Promise<PppActiveSession[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ppp/active");
    return (Array.isArray(rows) ? rows : []).map(normalizePppActive);
  }

  async disconnectPppActive(id: string): Promise<void> {
    await this.request("DELETE", `/ppp/active/${encodeURIComponent(id)}`);
  }

  async listPppProfiles(): Promise<PppProfile[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ppp/profile");
    return (Array.isArray(rows) ? rows : []).map(normalizePppProfile);
  }

  async addPppProfile(input: CreatePppProfileInput): Promise<string> {
    const payload: Record<string, unknown> = {
      name: input.name,
    };
    if (input.localAddress) payload["local-address"] = input.localAddress;
    if (input.remoteAddress) payload["remote-address"] = input.remoteAddress;
    if (input.dnsServer) payload["dns-server"] = input.dnsServer;
    if (input.rateLimit) payload["rate-limit"] = input.rateLimit;
    if (input.parentQueue && input.parentQueue !== "none") {
      payload["parent-queue"] = input.parentQueue;
    }
    if (input.comment) payload.comment = input.comment;
    if (input.onUp) payload["on-up"] = input.onUp;

    const res = await this.request<RawRecord>("PUT", "/ppp/profile", payload);
    return String(res?.[".id"] ?? res?.ret ?? "");
  }

  async removePppProfile(id: string): Promise<void> {
    await this.request("DELETE", `/ppp/profile/${encodeURIComponent(id)}`);
  }

  async listSimpleQueues(): Promise<string[]> {
    const rows = await this.request<RawRecord[]>("GET", "/queue/simple");
    return (Array.isArray(rows) ? rows : [])
      .map((r) => String(r.name ?? ""))
      .filter(Boolean);
  }

  async listIpPools(): Promise<string[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ip/pool");
    return (Array.isArray(rows) ? rows : [])
      .map((r) => String(r.name ?? ""))
      .filter(Boolean);
  }

  async listInterfaces(): Promise<RouterInterface[]> {
    const rows = await this.request<RawRecord[]>("GET", "/interface");
    return (Array.isArray(rows) ? rows : []).map(normalizeInterface);
  }

  async monitorInterfaceTraffic(
    interfaceName: string
  ): Promise<InterfaceTraffic> {
    const rows = await this.request<RawRecord[]>(
      "POST",
      "/interface/monitor-traffic",
      {
        interface: interfaceName,
        once: true,
      }
    );
    const row = Array.isArray(rows) ? (rows[0] ?? {}) : {};
    return {
      interfaceName,
      rxBitsPerSecond: parseNumber(row["rx-bits-per-second"]),
      txBitsPerSecond: parseNumber(row["tx-bits-per-second"]),
      rxPacketsPerSecond: parseNumber(row["rx-packets-per-second"]),
      txPacketsPerSecond: parseNumber(row["tx-packets-per-second"]),
      sampledAt: new Date().toISOString(),
    };
  }

  async listNetwatch(): Promise<NetwatchHost[]> {
    const rows = await this.request<RawRecord[]>("GET", "/tool/netwatch");
    return (Array.isArray(rows) ? rows : []).map(normalizeNetwatch);
  }

  async listHotspotLogs(): Promise<HotspotLogEntry[]> {
    const rows = await this.request<RawRecord[]>("GET", "/log");
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => String(r.topics ?? "").toLowerCase().includes("hotspot"))
      .map(normalizeHotspotLog)
      .reverse();
  }

  async listMikhmonUserLogs(
    query?: MikhmonUserLogQuery
  ): Promise<MikhmonUserLogEntry[]> {
    const path =
      query?.all || !query?.owner
        ? "/system/script?comment=mikhmon"
        : `/system/script?owner=${encodeURIComponent(query.owner)}`;
    const rows = await this.request<RawRecord[]>("GET", path);
    const parsed: MikhmonUserLogEntry[] = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      const entry = normalizeMikhmonUserLog(r);
      if (entry) parsed.push(entry);
    }
    return parsed;
  }

  async ping(options: PingOptions): Promise<PingResult> {
    const count = Math.min(Math.max(options.count ?? 4, 1), 10);
    const timeoutMs = Math.max(20000, count * 2000 + 6000);
    const payload: Record<string, unknown> = {
      address: options.address,
      count: String(count),
    };
    if (options.interfaceName) payload.interface = options.interfaceName;
    if (options.size) payload.size = String(options.size);
    if (options.srcAddress) payload["src-address"] = options.srcAddress;

    const rows = await this.request<RawRecord[]>(
      "POST",
      "/ping",
      payload,
      timeoutMs
    );
    return normalizePingResult(
      options.address,
      Array.isArray(rows) ? rows : []
    );
  }

  async traceroute(options: TracerouteOptions): Promise<TracerouteResult> {
    const count = Math.min(Math.max(options.count ?? 1, 1), 3);
    const maxHops = Math.min(Math.max(options.maxHops ?? 15, 1), 30);
    const payload: Record<string, unknown> = {
      address: options.address,
      count: String(count),
      "max-hops": String(maxHops),
      protocol: options.protocol || "icmp",
      "use-dns": options.useDns ? "yes" : "no",
    };
    if (options.interfaceName) payload.interface = options.interfaceName;
    if (options.srcAddress) payload["src-address"] = options.srcAddress;

    const rows = await this.request<RawRecord[]>(
      "POST",
      "/tool/traceroute",
      payload,
      30000
    );
    return normalizeTracerouteResult(
      options.address,
      Array.isArray(rows) ? rows : []
    );
  }

  async listDhcpLeases(): Promise<DhcpLease[]> {
    const rows = await this.request<RawRecord[]>("GET", "/ip/dhcp-server/lease");
    return (Array.isArray(rows) ? rows : []).map(normalizeDhcpLease);
  }

  async removeDhcpLease(id: string): Promise<void> {
    await this.request(
      "DELETE",
      `/ip/dhcp-server/lease/${encodeURIComponent(id)}`
    );
  }

  async listHotspotIpBindings(): Promise<HotspotIpBinding[]> {
    const rows = await this.request<RawRecord[]>(
      "GET",
      "/ip/hotspot/ip-binding"
    );
    return (Array.isArray(rows) ? rows : []).map(normalizeHotspotIpBinding);
  }

  async addHotspotIpBinding(
    input: CreateHotspotIpBindingInput
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      server: input.server || "all",
      type: input.type || "bypassed",
      disabled: input.disabled ? "true" : "false",
    };
    if (input.macAddress) payload["mac-address"] = input.macAddress;
    if (input.address) payload.address = input.address;
    if (input.toAddress) payload["to-address"] = input.toAddress;
    if (input.comment) payload.comment = input.comment;

    const res = await this.request<RawRecord>(
      "PUT",
      "/ip/hotspot/ip-binding",
      payload
    );
    return String(res?.[".id"] ?? res?.ret ?? "");
  }

  async updateHotspotIpBinding(
    id: string,
    patch: Partial<CreateHotspotIpBindingInput>,
    unsetFields?: Array<"mac-address" | "address" | "to-address">
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.macAddress) payload["mac-address"] = patch.macAddress;
    if (patch.address) payload.address = patch.address;
    if (patch.toAddress) payload["to-address"] = patch.toAddress;
    if (patch.server !== undefined) payload.server = patch.server;
    if (patch.type !== undefined) payload.type = patch.type;
    if (patch.comment !== undefined) payload.comment = patch.comment;
    if (patch.disabled !== undefined) {
      payload.disabled = patch.disabled ? "true" : "false";
    }
    if (Object.keys(payload).length > 0) {
      await this.request(
        "PATCH",
        `/ip/hotspot/ip-binding/${encodeURIComponent(id)}`,
        payload
      );
    }
    if (unsetFields && unsetFields.length > 0) {
      for (const field of unsetFields) {
        await this.request("POST", "/ip/hotspot/ip-binding/unset", {
          numbers: id,
          "value-name": field,
        });
      }
    }
  }

  async removeHotspotIpBinding(id: string): Promise<void> {
    await this.request(
      "DELETE",
      `/ip/hotspot/ip-binding/${encodeURIComponent(id)}`
    );
  }
}
